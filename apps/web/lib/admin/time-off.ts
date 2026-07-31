import "server-only";
import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { appointments, patients, timeOff } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { addDays, lisbonDateTimeToUtc, lisbonMidnightUtc, lisbonParts } from "@/lib/scheduling/time";
import { generateLoteSchedule, type LoteEnd } from "@/lib/scheduling/lote";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope } from "./schedule-scope";

/**
 * W5-12 — therapist availability blocks, migration-free on the existing
 * `time_off` table (migration 0006). Two modes, both a single time_off row whose
 * timestamptz range expresses them:
 *   - "pontual": a date + an hour range within that day (reason "other").
 *   - "prolongada": a whole-day date range, e.g. ferias (reason "vacation").
 *
 * Lisbon wall-clock in -> UTC in the DB (CLAUDE.md: UTC in DB, Lisbon for
 * display). Every mutation writes an audit row (rule 6). RLS scopes every read
 * to the caller's tenant; this module never filters tenant_id by hand.
 */

export type TimeOffMode = "pontual" | "prolongada";

/** A block as shown in the Bloquear horário list (Lisbon wall-clock strings). */
export type TimeOffBlockView = {
  id: string;
  mode: TimeOffMode;
  reason: string;
  /** Lisbon calendar date, "yyyy-mm-dd". For prolongada, the first day. */
  startDate: string;
  /** Lisbon calendar date, "yyyy-mm-dd". For prolongada, the LAST day (inclusive). */
  endDate: string;
  /** Lisbon "HH:mm" (pontual only; "" for prolongada). */
  startTime: string;
  /** Lisbon "HH:mm" (pontual only; "" for prolongada). */
  endTime: string;
  note: string;
};

/**
 * PL-22 — "bloquear lote": one submit, many blocks.
 *
 * Owner CR 2026-07-31: "create the same thing for blocking the schedule for
 * therapists by the reception or admins, bloquear lote or whatever". The same
 * recurrence PL-21 gave Agendar lote, pointed at time_off instead of
 * appointments, so "every Tuesday morning until September" is one action rather
 * than eight identical forms.
 *
 * Reuses generateLoteSchedule verbatim - one definition of what a recurrence
 * means across booking and blocking, so the two can never drift.
 */
export type TimeOffBatchInput = {
  userId: string;
  /** First candidate Lisbon date, "yyyy-mm-dd". */
  startDate: string;
  /** Weekdays to block, 0=Sunday..6=Saturday. Empty = startDate's own weekday. */
  weekdays: number[];
  everyWeeks: number;
  end: LoteEnd;
  /** The hour range blocked on EACH generated day, Lisbon "HH:mm". */
  startTime: string;
  endTime: string;
  note?: string;
};

export type TimeOffBatchResult = {
  /** The Lisbon dates actually blocked, ascending. */
  dates: string[];
  /** Appointments the whole batch runs over, deduped by appointment id. */
  overlaps: OverlappingAppointment[];
};

export type TimeOffBlockInput = {
  userId: string;
  mode: TimeOffMode;
  /** "yyyy-mm-dd" Lisbon date. Both modes use it as the start day. */
  startDate: string;
  /** "yyyy-mm-dd" Lisbon date. prolongada: last day (inclusive). Ignored for pontual. */
  endDate?: string;
  /** "HH:mm" Lisbon. pontual only. */
  startTime?: string;
  /** "HH:mm" Lisbon. pontual only. */
  endTime?: string;
  note?: string;
};

/** One existing appointment overlapping a proposed/created block. */
export type OverlappingAppointment = {
  id: string;
  patientName: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Map our two modes to the time_off reason enum. ferias -> vacation, else other. */
function reasonForMode(mode: TimeOffMode): "vacation" | "other" {
  return mode === "prolongada" ? "vacation" : "other";
}

/**
 * Resolve a block input to its absolute UTC [startsAt, endsAt) window.
 *   - pontual: the given hour range on the given day.
 *   - prolongada: Lisbon midnight of startDate .. Lisbon midnight of (endDate + 1
 *     day), so the whole last day is covered (half-open end).
 */
function resolveWindow(input: TimeOffBlockInput): { startsAt: Date; endsAt: Date } {
  if (!DATE_RE.test(input.startDate)) throw new AdminError("invalid", "startDate must be yyyy-mm-dd");

  if (input.mode === "pontual") {
    const st = input.startTime ?? "";
    const et = input.endTime ?? "";
    if (!TIME_RE.test(st) || !TIME_RE.test(et)) {
      throw new AdminError("invalid", "pontual times must be HH:mm");
    }
    if (et <= st) throw new AdminError("invalid", "end must be after start");
    return {
      startsAt: lisbonDateTimeToUtc(input.startDate, st),
      endsAt: lisbonDateTimeToUtc(input.startDate, et),
    };
  }

  // prolongada
  const endDate = input.endDate ?? input.startDate;
  if (!DATE_RE.test(endDate)) throw new AdminError("invalid", "endDate must be yyyy-mm-dd");
  if (endDate < input.startDate) throw new AdminError("invalid", "endDate must be on/after startDate");
  return {
    startsAt: lisbonMidnightUtc(input.startDate),
    endsAt: lisbonMidnightUtc(addDays(endDate, 1)),
  };
}

/** Classify a stored time_off row back into a display mode. A row that spans an
 *  exact whole number of Lisbon days from midnight reads as prolongada; anything
 *  else (an intra-day hour range) reads as pontual. */
function viewFor(row: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  note: string | null;
}): TimeOffBlockView {
  const startParts = lisbonParts(row.startsAt);
  const endParts = lisbonParts(row.endsAt);
  const startsAtMidnight = startParts.hour === 0 && startParts.minute === 0;
  const endsAtMidnight = endParts.hour === 0 && endParts.minute === 0;
  const isProlongada = startsAtMidnight && endsAtMidnight;

  if (isProlongada) {
    // endsAt is the exclusive midnight after the last blocked day: step back one day.
    const lastDay = addDays(endParts.date, -1);
    return {
      id: row.id,
      mode: "prolongada",
      reason: row.reason,
      startDate: startParts.date,
      endDate: lastDay < startParts.date ? startParts.date : lastDay,
      startTime: "",
      endTime: "",
      note: row.note ?? "",
    };
  }

  const hh = (n: number) => String(n).padStart(2, "0");
  return {
    id: row.id,
    mode: "pontual",
    reason: row.reason,
    startDate: startParts.date,
    endDate: startParts.date,
    startTime: `${hh(startParts.hour)}:${hh(startParts.minute)}`,
    endTime: `${hh(endParts.hour)}:${hh(endParts.minute)}`,
    note: row.note ?? "",
  };
}

/** List a therapist's blocks, soonest first. */
export async function listTimeOffBlocks(
  actor: RequestContext,
  userId: string,
): Promise<TimeOffBlockView[]> {
  assertCan(actor.role, "schedule:read");
  const scope = await resolveScheduleScope(actor);
  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, userId, scope);
    const rows = await tx
      .select({
        id: timeOff.id,
        startsAt: timeOff.startsAt,
        endsAt: timeOff.endsAt,
        reason: timeOff.reason,
        note: timeOff.note,
      })
      .from(timeOff)
      .where(eq(timeOff.userId, userId))
      .orderBy(asc(timeOff.startsAt));
    return rows.map(viewFor);
  });
}

/**
 * Existing appointments overlapping a proposed block window. Used to WARN before
 * (and after) writing a block — the appointments are NEVER cancelled (owner
 * ruling Q-W5-4: clinical/scheduling data is never silently destroyed).
 */
async function appointmentsOverlapping(
  tx: Parameters<Parameters<typeof runScoped>[1]>[0],
  args: { userId: string; startsAt: Date; endsAt: Date },
): Promise<OverlappingAppointment[]> {
  const rows = await tx
    .select({
      id: appointments.id,
      patientName: patients.fullName,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(
      and(
        eq(appointments.practitionerId, args.userId),
        ne(appointments.status, "cancelled"),
        lt(appointments.startsAt, args.endsAt),
        gt(appointments.endsAt, args.startsAt),
      ),
    )
    .orderBy(asc(appointments.startsAt));
  return rows.map((r) => ({
    id: r.id,
    patientName: r.patientName,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
  }));
}

function validateInput(input: TimeOffBlockInput): void {
  if (!input.userId) throw new AdminError("invalid", "user required");
  if (input.mode !== "pontual" && input.mode !== "prolongada") {
    throw new AdminError("invalid", "mode must be pontual or prolongada");
  }
}

/**
 * Create a block. Returns the appointments it overlaps so the caller can surface
 * them as a warning. The block IS created regardless (warn, never block/cancel).
 */
export async function createTimeOffBlock(
  actor: RequestContext,
  input: TimeOffBlockInput,
): Promise<{ id: string; overlaps: OverlappingAppointment[] }> {
  assertCan(actor.role, "schedule:manage");
  validateInput(input);
  const { startsAt, endsAt } = resolveWindow(input);
  const note = input.note?.trim() || null;
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, input.userId, scope);
    const overlaps = await appointmentsOverlapping(tx, { userId: input.userId, startsAt, endsAt });
    const [row] = await tx
      .insert(timeOff)
      .values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        userId: input.userId,
        startsAt,
        endsAt,
        reason: reasonForMode(input.mode),
        note,
      })
      .returning({ id: timeOff.id });
    await writeAudit(tx, actor, {
      action: "time_off.create",
      entityType: "time_off",
      entityId: row?.id ?? null,
      // PII-free: mode + affected appointment count only, never patient values.
      metadata: { mode: input.mode, overlappingAppointments: overlaps.length },
    });
    return { id: row?.id ?? "", overlaps };
  });
}

/**
 * Create MANY blocks in one transaction from a recurrence.
 *
 * All-or-nothing on purpose: a half-applied batch would leave the therapist's
 * week in a state nobody asked for, and the user cannot tell which half landed.
 * One transaction, one audit row carrying the count.
 *
 * Overlapping appointments are REPORTED, never cancelled - the same rule the
 * single-block path follows (Q-W5-4). Reported for the whole batch, deduped,
 * because one appointment can sit under two generated days.
 */
export async function createTimeOffBlockBatch(
  actor: RequestContext,
  input: TimeOffBatchInput,
): Promise<TimeOffBatchResult> {
  assertCan(actor.role, "schedule:manage");
  if (!DATE_RE.test(input.startDate)) {
    throw new AdminError("invalid", "startDate must be yyyy-mm-dd");
  }
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
    throw new AdminError("invalid", "times must be HH:mm");
  }
  if (input.endTime <= input.startTime) {
    throw new AdminError("invalid", "end must be after start");
  }

  const dates = generateLoteSchedule({
    from: input.startDate,
    weekdays: input.weekdays,
    everyWeeks: input.everyWeeks,
    end: input.end,
  });
  // An empty pattern is a user error worth surfacing, not a silent no-op that
  // looks like it worked (e.g. an end date before the start date).
  if (dates.length === 0) throw new AdminError("invalid", "recurrence produced no dates");

  const note = input.note?.trim() || null;
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, input.userId, scope);

    const seen = new Map<string, OverlappingAppointment>();
    for (const date of dates) {
      const startsAt = lisbonDateTimeToUtc(date, input.startTime);
      const endsAt = lisbonDateTimeToUtc(date, input.endTime);
      for (const appt of await appointmentsOverlapping(tx, { userId: input.userId, startsAt, endsAt })) {
        seen.set(appt.id, appt);
      }
      await tx.insert(timeOff).values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        userId: input.userId,
        startsAt,
        endsAt,
        reason: reasonForMode("pontual"),
        note,
      });
    }

    const overlaps = [...seen.values()];
    await writeAudit(tx, actor, {
      action: "time_off.create_batch",
      entityType: "time_off",
      entityId: null,
      // PII-free: counts only, never a patient value.
      metadata: { blocks: dates.length, overlappingAppointments: overlaps.length },
    });
    return { dates, overlaps };
  });
}

/** Update a block (same two modes). Returns overlapping appointments to warn. */
export async function updateTimeOffBlock(
  actor: RequestContext,
  id: string,
  input: TimeOffBlockInput,
): Promise<{ overlaps: OverlappingAppointment[] }> {
  assertCan(actor.role, "schedule:manage");
  validateInput(input);
  if (!id) throw new AdminError("invalid", "id required");
  const { startsAt, endsAt } = resolveWindow(input);
  const note = input.note?.trim() || null;
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, input.userId, scope);
    const overlaps = await appointmentsOverlapping(tx, { userId: input.userId, startsAt, endsAt });
    const rows = await tx
      .update(timeOff)
      .set({ startsAt, endsAt, reason: reasonForMode(input.mode), note })
      .where(and(eq(timeOff.id, id), eq(timeOff.userId, input.userId)))
      .returning({ id: timeOff.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "time_off.update",
      entityType: "time_off",
      entityId: id,
      metadata: { mode: input.mode, overlappingAppointments: overlaps.length },
    });
    return { overlaps };
  });
}

/** Hard-delete a block. Removing a block only frees availability again; it never
 *  touches appointments, so a plain delete is safe (no soft-archive needed). */
export async function deleteTimeOffBlock(actor: RequestContext, id: string): Promise<void> {
  assertCan(actor.role, "schedule:manage");
  if (!id) throw new AdminError("invalid", "id required");
  const scope = await resolveScheduleScope(actor);
  await runScoped(actor, async (tx) => {
    const [existing] = await tx
      .select({ userId: timeOff.userId })
      .from(timeOff)
      .where(eq(timeOff.id, id))
      .limit(1);
    if (!existing) throw new AdminError("not_found");
    await assertTargetInScheduleScope(tx, existing.userId, scope);
    const rows = await tx
      .delete(timeOff)
      .where(eq(timeOff.id, id))
      .returning({ id: timeOff.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "time_off.delete",
      entityType: "time_off",
      entityId: id,
    });
  });
}

// Exposed for unit testing the pure window/view mapping without a DB.
export const __test = { resolveWindow, viewFor, reasonForMode };
