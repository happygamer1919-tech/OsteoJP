import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { therapistWeeklyBlocks, timeOff, weeklyBlocksSchemaPresent } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
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

/** Add a weekly rule. Existing appointments under it are never touched. */
export async function createWeeklyBlock(actor: RequestContext, input: WeeklyRuleInput): Promise<{ id: string }> {
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
    await writeAudit(tx, actor, {
      action: "weekly_block.create",
      entityType: "therapist_weekly_block",
      entityId: row.id,
      // PII-free: the weekday only. The therapist is the row's own column.
      metadata: { weekday: input.weekday },
    });
    return { id: row.id };
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
      .select({ userId: therapistWeeklyBlocks.userId, weekday: therapistWeeklyBlocks.weekday })
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
      metadata: { weekday: existing.weekday },
    });
  });
}
