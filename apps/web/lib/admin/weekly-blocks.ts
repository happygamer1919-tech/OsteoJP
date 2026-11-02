import "server-only";
import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { appointments, therapistWeeklyBlocks, timeOff, weeklyBlocksSchemaPresent } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  expandWeeklyRules,
  weeklyRuleInputError,
  type PontualListRow,
  type WeeklyListRow,
  type WeeklyRuleInput,
} from "@/lib/scheduling/weekly-blocks-core";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import {
  assertTargetInScheduleScope,
  manageableTargets,
  resolveScheduleScope,
} from "./schedule-scope";

/**
 * BLOQUEIOS NA AGENDA / FERIAS - the data behind the page.
 *
 * Two lists and two writes:
 *   - REPETICAO SEMANAL: therapist_weekly_blocks (pending migration
 *     NEXT-AFTER-0109_weekly_blocks.sql). Create and delete here, each audited
 *     (CLAUDE.md rule 6). No update: a rule is deleted and added again, as in
 *     Fisiozero.
 *   - PONTUAL: time_off, written through createTimeOffBlock /
 *     deleteTimeOffBlock in ./time-off.ts (mode "intervalo"), so the note rule,
 *     the scope check and the audit are the ones every other block door uses.
 *     Only the LIST is read here, because the page lists every manageable
 *     therapist's blocks in one place, with the raw instants.
 *
 * THE SAME AUTHORITY AS /horarios. `schedule:manage`, and the schedule scope
 * (schedule-scope.ts): a therapist manages their own rules only, a located
 * reception or admin the therapists of their clinics, the owner and an
 * unassigned staffer everyone. Who is LISTED is `manageableTargets`; every
 * write re-checks its one target with `assertTargetInScheduleScope`.
 */

export type BloqueiosData = {
  /** False until the weekly table exists on this database. */
  weeklyAvailable: boolean;
  weekly: WeeklyListRow[];
  pontual: PontualListRow[];
};

/**
 * Both lists for the therapists this actor may manage. `roster` is the page's
 * therapist list (id and display name); members the actor may not manage are
 * dropped from the result, never thrown on (the /horarios crash of the past,
 * manageableTargets' header).
 */
export async function listBloqueios(
  actor: RequestContext,
  roster: readonly { id: string; label: string }[],
): Promise<BloqueiosData & { manageable: string[] }> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  const nameOf = new Map(roster.map((r) => [r.id, r.label]));
  return runScoped(actor, async (tx) => {
    const manageable = [...(await manageableTargets(tx, [...nameOf.keys()], scope))];
    const weeklyAvailable = await weeklyBlocksSchemaPresent(tx);
    if (manageable.length === 0) return { weeklyAvailable, weekly: [], pontual: [], manageable };

    const [weeklyRows, pontualRows] = await Promise.all([
      weeklyAvailable
        ? tx
            .select({
              id: therapistWeeklyBlocks.id,
              userId: therapistWeeklyBlocks.userId,
              weekday: therapistWeeklyBlocks.weekday,
              startTime: therapistWeeklyBlocks.startTime,
              endTime: therapistWeeklyBlocks.endTime,
            })
            .from(therapistWeeklyBlocks)
            .where(inArray(therapistWeeklyBlocks.userId, manageable))
        : Promise.resolve([]),
      tx
        .select({
          id: timeOff.id,
          userId: timeOff.userId,
          startsAt: timeOff.startsAt,
          endsAt: timeOff.endsAt,
          note: timeOff.note,
        })
        .from(timeOff)
        .where(inArray(timeOff.userId, manageable))
        .orderBy(desc(timeOff.startsAt)),
    ]);
    const name = (id: string) => nameOf.get(id) ?? "";
    return {
      weeklyAvailable,
      manageable,
      weekly: weeklyRows.map((r) => ({ ...r, therapistName: name(r.userId) })),
      pontual: pontualRows.map((r) => ({ ...r, therapistName: name(r.userId) })),
    };
  });
}

/** Postgres unique_violation. */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/** How far ahead an added weekly rule looks for appointments it now covers. */
export const WEEKLY_OVERLAP_HORIZON_DAYS = 56;

/**
 * The appointments of `userId` in [now, now + 8 weeks) that a new weekly rule
 * covers. Reported, NEVER cancelled (owner ruling Q-W5-4, the rule time_off's
 * warning follows): the page says "Já havia N marcações" exactly as it does
 * for a PONTUAL block. Same status filter as time-off.ts' warning (anything
 * but cancelled). Ids only: the count is all the page shows.
 */
async function appointmentsUnderRule(
  tx: Parameters<Parameters<typeof runScoped>[1]>[0],
  input: WeeklyRuleInput,
  now: Date,
): Promise<{ id: string }[]> {
  const until = new Date(now.getTime() + WEEKLY_OVERLAP_HORIZON_DAYS * 86_400_000);
  const spans = expandWeeklyRules([{ id: "new", ...input }], now, until);
  if (spans.length === 0) return [];
  const rows = await tx
    .select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.practitionerId, input.userId),
        ne(appointments.status, "cancelled"),
        lt(appointments.startsAt, until),
        gt(appointments.endsAt, now),
      ),
    );
  return rows
    .filter((a) => spans.some((b) => a.startsAt < b.endsAt && a.endsAt > b.startsAt))
    .map((a) => ({ id: a.id }));
}

/**
 * Add a weekly rule. Existing appointments under it are never touched; those
 * in the next 8 weeks are counted and returned so the page can warn.
 */
export async function createWeeklyBlock(
  actor: RequestContext,
  input: WeeklyRuleInput,
  now: Date = new Date(),
): Promise<{ id: string; overlaps: { id: string }[] }> {
  assertCan(actor.role, "schedule:manage");
  const err = weeklyRuleInputError(input);
  if (err) throw new AdminError("invalid", `weekly rule: ${err}`);
  const scope = await resolveScheduleScope(actor);
  return runScoped(actor, async (tx) => {
    if (!(await weeklyBlocksSchemaPresent(tx))) throw new AdminError("unavailable");
    await assertTargetInScheduleScope(tx, input.userId, scope);
    let row: { id: string } | undefined;
    try {
      // A SAVEPOINT, so a refused duplicate does not abort the transaction the
      // audit write would otherwise have shared.
      [row] = await tx.transaction((sp) =>
        sp
          .insert(therapistWeeklyBlocks)
          .values({
            tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
            userId: input.userId,
            weekday: input.weekday,
            startTime: input.startTime,
            endTime: input.endTime,
            createdBy: actor.userId, // the INSERT policy requires created_by = auth.uid()
          })
          .returning({ id: therapistWeeklyBlocks.id }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new AdminError("duplicate");
      throw e;
    }
    if (!row) throw new AdminError("invalid");
    const overlaps = await appointmentsUnderRule(tx, input, now);
    await writeAudit(tx, actor, {
      action: "weekly_block.create",
      entityType: "therapist_weekly_block",
      entityId: row.id,
      // PII-free: ids, the weekday, the two wall-clock times and a count.
      metadata: {
        userId: input.userId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
        overlappingAppointments: overlaps.length,
      },
    });
    return { id: row.id, overlaps };
  });
}

/** Remove a weekly rule. Frees availability only; no appointment is touched. */
export async function deleteWeeklyBlock(actor: RequestContext, id: string): Promise<void> {
  assertCan(actor.role, "schedule:manage");
  if (!id) throw new AdminError("invalid", "id required");
  const scope = await resolveScheduleScope(actor);
  await runScoped(actor, async (tx) => {
    if (!(await weeklyBlocksSchemaPresent(tx))) throw new AdminError("unavailable");
    const [existing] = await tx
      .select({
        userId: therapistWeeklyBlocks.userId,
        weekday: therapistWeeklyBlocks.weekday,
        startTime: therapistWeeklyBlocks.startTime,
        endTime: therapistWeeklyBlocks.endTime,
      })
      .from(therapistWeeklyBlocks)
      .where(eq(therapistWeeklyBlocks.id, id))
      .limit(1);
    if (!existing) throw new AdminError("not_found");
    await assertTargetInScheduleScope(tx, existing.userId, scope);
    const rows = await tx
      .delete(therapistWeeklyBlocks)
      .where(and(eq(therapistWeeklyBlocks.id, id), eq(therapistWeeklyBlocks.userId, existing.userId)))
      .returning({ id: therapistWeeklyBlocks.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "weekly_block.delete",
      entityType: "therapist_weekly_block",
      entityId: id,
      metadata: {
        userId: existing.userId,
        weekday: existing.weekday,
        startTime: existing.startTime.slice(0, 5),
        endTime: existing.endTime.slice(0, 5),
      },
    });
  });
}
