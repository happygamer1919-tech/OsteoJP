import "server-only";
import { and, asc, eq, gt, gte, inArray, lt, notInArray } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  appointments,
  locationClosedDays,
  locationClosedDaysSchemaPresent,
  locations,
  patients,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import {
  closedDayInputError,
  closedDayOverlap,
  type ClosedDayInput,
  type ClosedDayRule,
} from "@/lib/scheduling/closed-days-core";
import { addDays, lisbonMidnightUtc, todayInLisbon } from "@/lib/scheduling/time";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

/**
 * ENCERRAMENTOS - a clinic's DATED closures (Tier C 0114, ruled 2026-11-05).
 *
 * The data behind /horarios/encerramentos: the list, the add (one clinic, or
 * every clinic the actor may manage), the remove, and the visits already
 * booked inside a closure.
 *
 * WHO (owner answer C2): `closures:manage`, which owner, admin and reception
 * hold and a therapist does not. A receptionist or admin assigned to clinics
 * manages only those clinics (viewerLocationScope, the PL-09 basis); an
 * unassigned one and the owner manage every clinic of the tenant. The table's
 * RLS repeats the role list and the tenant; the clinic scope is this file's.
 *
 * NO UPDATE, as the table has none: a closure is removed and added again. A
 * closure that has started cannot be removed (it is history for the capacity
 * figures); the table's DELETE policy says the same.
 *
 * A SAVE CANCELS NOTHING (owner answer C5). The visits already booked inside
 * the new closure are returned and listed for reception to move; no SMS is
 * sent and no visit changes state. Their reminders still go out until they are
 * moved, which is why the list is shown on save and stays on the page.
 *
 * Every mutation writes an audit row (CLAUDE.md rule 6), PII-free.
 */

/** A clinic the actor may manage closures for. */
export type ClosureClinic = { id: string; name: string };

/** One closure as the page lists it. */
export type ClosureView = ClosedDayRule & {
  locationId: string;
  locationName: string;
  /** True once its first day is today or earlier: it cannot be removed. */
  started: boolean;
  /** Visits not cancelled and not missed, inside the closure, from now on. */
  affectedCount: number;
};

/** One visit already booked inside a closure, for reception to move. */
export type AffectedVisit = {
  id: string;
  closureId: string;
  locationName: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  patientName: string;
  practitionerName: string;
};

export type ClosuresPage = {
  /** False until the closure table exists on this database. */
  available: boolean;
  clinics: ClosureClinic[];
  closures: ClosureView[];
};

/** Visits in these states do not occupy the clinic, so they are not listed. */
const NOT_OCCUPYING = ["cancelled", "no_show"] as const;

/** The clinics this actor may manage, by the PL-09 location scope. */
async function manageableClinics(tx: DbTx, scope: string[] | null): Promise<ClosureClinic[]> {
  const rows = await tx
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(scope ? inArray(locations.id, scope) : undefined)
    .orderBy(asc(locations.name));
  return rows;
}

const ruleSelection = {
  id: locationClosedDays.id,
  locationId: locationClosedDays.locationId,
  startsOn: locationClosedDays.startsOn,
  endsOn: locationClosedDays.endsOn,
  closedFrom: locationClosedDays.closedFrom,
  closedTo: locationClosedDays.closedTo,
  kind: locationClosedDays.kind,
  label: locationClosedDays.label,
} as const;

type RuleRow = ClosedDayRule & { locationId: string };

/**
 * The visits inside these closures, from `now` on (a past visit is not
 * something reception can move). One query per call, filtered in memory by
 * the same `closedDayOverlap` every booking refusal uses, so the list names
 * exactly the visits the closure would now refuse.
 */
async function visitsInside(
  tx: DbTx,
  rules: readonly RuleRow[],
  clinicName: (id: string) => string,
  now: Date,
): Promise<AffectedVisit[]> {
  if (rules.length === 0) return [];
  const out: AffectedVisit[] = [];
  for (const locationId of [...new Set(rules.map((r) => r.locationId))]) {
    const mine = rules.filter((r) => r.locationId === locationId);
    const first = mine.reduce((a, r) => (r.startsOn < a ? r.startsOn : a), mine[0]!.startsOn);
    const last = mine.reduce((a, r) => (r.endsOn > a ? r.endsOn : a), mine[0]!.endsOn);
    const from = lisbonMidnightUtc(first);
    const to = lisbonMidnightUtc(addDays(last, 1));
    const rows = await tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        patientName: patients.fullName,
        practitionerName: users.fullName,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(users, eq(users.id, appointments.practitionerId))
      .where(
        and(
          eq(appointments.locationId, locationId),
          notInArray(appointments.status, [...NOT_OCCUPYING]),
          lt(appointments.startsAt, to),
          gt(appointments.endsAt, from > now ? from : now),
        ),
      )
      .orderBy(asc(appointments.startsAt));
    for (const a of rows) {
      for (const r of mine) {
        if (closedDayOverlap([r], a.startsAt, a.endsAt)) {
          out.push({
            id: a.id,
            closureId: r.id,
            locationName: clinicName(locationId),
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt.toISOString(),
            patientName: a.patientName,
            practitionerName: a.practitionerName,
          });
          break;
        }
      }
    }
  }
  return out.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

/**
 * The page's data: the clinics the actor may manage, and their closures that
 * have not ended yet (ongoing and upcoming), each with its count of visits
 * still booked inside it.
 */
export async function listClosures(actor: RequestContext, now: Date = new Date()): Promise<ClosuresPage> {
  assertCan(actor.role, "closures:manage");
  const scope = await viewerLocationScope(actor);
  const today = todayInLisbon(now);
  return runScoped(actor, async (tx) => {
    const clinics = await manageableClinics(tx, scope);
    const available = await locationClosedDaysSchemaPresent(tx);
    if (!available || clinics.length === 0) return { available, clinics, closures: [] };
    const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
    const rules: RuleRow[] = await tx
      .select(ruleSelection)
      .from(locationClosedDays)
      .where(
        and(
          inArray(locationClosedDays.locationId, clinics.map((c) => c.id)),
          gte(locationClosedDays.endsOn, today),
        ),
      )
      .orderBy(asc(locationClosedDays.startsOn), asc(locationClosedDays.locationId));
    const affected = await visitsInside(tx, rules, (id) => nameOf.get(id) ?? "", now);
    const countBy = new Map<string, number>();
    for (const v of affected) countBy.set(v.closureId, (countBy.get(v.closureId) ?? 0) + 1);
    return {
      available,
      clinics,
      closures: rules.map((r) => ({
        ...r,
        locationName: nameOf.get(r.locationId) ?? "",
        started: r.startsOn <= today,
        affectedCount: countBy.get(r.id) ?? 0,
      })),
    };
  });
}

/**
 * The visits still booked inside the named closures (the list shown on save,
 * and on "Ver marcações"). Closures outside the actor's clinics are ignored,
 * never thrown on: the ids come from the page's own URL.
 */
export async function listAffectedVisits(
  actor: RequestContext,
  closureIds: readonly string[],
  now: Date = new Date(),
): Promise<AffectedVisit[]> {
  assertCan(actor.role, "closures:manage");
  const ids = [...new Set(closureIds)].filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return [];
  const scope = await viewerLocationScope(actor);
  return runScoped(actor, async (tx) => {
    if (!(await locationClosedDaysSchemaPresent(tx))) return [];
    const clinics = await manageableClinics(tx, scope);
    const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
    const rules: RuleRow[] = (await tx
      .select(ruleSelection)
      .from(locationClosedDays)
      .where(inArray(locationClosedDays.id, ids))).filter((r) => nameOf.has(r.locationId));
    return visitsInside(tx, rules, (id) => nameOf.get(id) ?? "", now);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres unique_violation, wherever drizzle put the code. */
function isUniqueViolation(e: unknown): boolean {
  const code =
    (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/**
 * Add a closure: to ONE clinic, or with `locationId: "all"` one closure per
 * clinic the actor may manage (C3: national holidays are entered for every
 * clinic). All or nothing: a duplicate at any clinic refuses the whole save,
 * so a half-written "all clinics" closure never stands. Existing visits inside
 * it are never touched; they are returned for reception to move (C5).
 */
export async function createClosures(
  actor: RequestContext,
  input: ClosedDayInput,
  now: Date = new Date(),
): Promise<{ ids: string[]; affected: AffectedVisit[] }> {
  assertCan(actor.role, "closures:manage");
  const err = closedDayInputError(input, todayInLisbon(now));
  if (err) throw new AdminError("invalid", `closure: ${err}`);
  const scope = await viewerLocationScope(actor);
  const closedFrom = input.closedFrom.trim() === "" ? null : input.closedFrom.trim();
  const closedTo = input.closedTo.trim() === "" ? null : input.closedTo.trim();
  const label = input.label.trim() === "" ? null : input.label.trim();

  return runScoped(actor, async (tx) => {
    if (!(await locationClosedDaysSchemaPresent(tx))) throw new AdminError("unavailable");
    const clinics = await manageableClinics(tx, scope);
    const targets =
      input.locationId === "all" ? clinics : clinics.filter((c) => c.id === input.locationId);
    // A clinic outside the actor's scope reads as missing, as a therapist
    // outside it does in schedule-scope.ts: the actor never learns it exists.
    if (targets.length === 0) throw new AdminError("not_found", "clinic is not yours to manage");

    let rows: { id: string; locationId: string }[];
    try {
      // A SAVEPOINT, so a refused duplicate does not abort the transaction the
      // audit write would otherwise have shared.
      rows = await tx.transaction((sp) =>
        sp
          .insert(locationClosedDays)
          .values(
            targets.map((c) => ({
              tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
              locationId: c.id,
              startsOn: input.startsOn,
              endsOn: input.endsOn,
              closedFrom,
              closedTo,
              kind: input.kind,
              label,
              createdBy: actor.userId, // the INSERT policy requires created_by = auth.uid()
            })),
          )
          .returning({ id: locationClosedDays.id, locationId: locationClosedDays.locationId }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new AdminError("duplicate");
      throw e;
    }
    const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
    const rules: RuleRow[] = rows.map((r) => ({
      id: r.id,
      locationId: r.locationId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      closedFrom,
      closedTo,
      kind: input.kind,
      label,
    }));
    const affected = await visitsInside(tx, rules, (id) => nameOf.get(id) ?? "", now);
    for (const r of rows) {
      await writeAudit(tx, actor, {
        action: "location_closed_day.create",
        entityType: "location_closed_day",
        entityId: r.id,
        // PII-free: ids, dates, wall-clock hours, the kind and a count. The
        // label is free text and stays out of the audit metadata.
        metadata: {
          locationId: r.locationId,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          closedFrom,
          closedTo,
          kind: input.kind,
          overlappingAppointments: affected.filter((v) => v.closureId === r.id).length,
        },
      });
    }
    return { ids: rows.map((r) => r.id), affected };
  });
}

/**
 * Remove a closure that has not started. Frees the dates for booking; no visit
 * is touched. A started closure is refused here with its own code, before the
 * table's DELETE policy would refuse it by deleting nothing.
 */
export async function deleteClosure(actor: RequestContext, id: string, now: Date = new Date()): Promise<void> {
  assertCan(actor.role, "closures:manage");
  if (!UUID_RE.test(id)) throw new AdminError("invalid", "id required");
  const scope = await viewerLocationScope(actor);
  const today = todayInLisbon(now);
  await runScoped(actor, async (tx) => {
    if (!(await locationClosedDaysSchemaPresent(tx))) throw new AdminError("unavailable");
    const [existing] = await tx
      .select(ruleSelection)
      .from(locationClosedDays)
      .where(eq(locationClosedDays.id, id))
      .limit(1);
    if (!existing) throw new AdminError("not_found");
    if (scope && !scope.includes(existing.locationId)) throw new AdminError("not_found");
    if (existing.startsOn <= today) throw new AdminError("already_started");
    const rows = await tx
      .delete(locationClosedDays)
      .where(eq(locationClosedDays.id, id))
      .returning({ id: locationClosedDays.id });
    // Zero rows: the policy's own clock found it started (Lisbon midnight
    // passed between the read and the delete), or another session removed it.
    if (!rows[0]) throw new AdminError("already_started");
    await writeAudit(tx, actor, {
      action: "location_closed_day.delete",
      entityType: "location_closed_day",
      entityId: id,
      metadata: {
        locationId: existing.locationId,
        startsOn: existing.startsOn,
        endsOn: existing.endsOn,
        closedFrom: existing.closedFrom,
        closedTo: existing.closedTo,
        kind: existing.kind,
      },
    });
  });
}
