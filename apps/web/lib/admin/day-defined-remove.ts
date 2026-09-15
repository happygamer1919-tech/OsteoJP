import "server-only";
import { and, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { availabilityTemplates, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { scheduleRuleFor } from "@/lib/scheduling/availability";
import {
  dayDefinedRemovalAuditMetadata,
  planDayDefinedRemoval,
  type RemovalOutcome,
  type StoredRow,
} from "@/lib/scheduling/day-defined-removal";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope } from "./schedule-scope";

/**
 * SR-62 PU-3 - remove ONE Dia definido row, and give the day back to Base.
 *
 * THE ONLY WRITER FOR THIS ACTION, and it lives beside the other schedule
 * writers so every future caller passes through the same checks: the
 * capability, the target's scope, the shape of the row, the carve inverse and
 * the audit row, in one transaction.
 *
 * WHAT IT DOES, in order, and the reasoning is in
 * lib/scheduling/day-defined-removal.ts:
 *   1. schedule:manage, then the row by id (active only), then the ROW'S OWN
 *      therapist against the actor's scope - before the shape is looked at, so
 *      an out-of-scope actor learns nothing about a row that is not theirs.
 *   2. refuse anything that is not a one-day row. Base rows have their own
 *      editor; archiving one from here would be a second, unguarded door.
 *   3. plan against EVERY row the therapist has, retired included.
 *   4. a refusal writes NOTHING and returns the reason; the caller shows it.
 *   5. otherwise archive the dated row (never a hard delete), apply the
 *      restore, and write one audit row.
 *
 * IT INSERTS NOTHING. The restore only moves the bounds of rows the carve left
 * behind, or revives the retired row that already holds the restored key. So it
 * cannot create a one-day row, and it cannot collide with
 * `availability_templates_dedupe_uq` on an insert.
 *
 * EVERY UPDATE READS ITS ROW COUNT BACK. An update that matches nothing
 * "succeeds" in SQL; here it throws, and the transaction rolls back rather than
 * committing an audit row that describes writes that did not happen.
 */

export type RemoveDayDefinedResult =
  | { ok: true; date: string; outcome: RemovalOutcome; restored: number }
  | { ok: false; reason: "restore_needs_single_day" | "would_double_cover"; date: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every row for one therapist, active AND retired, in the planner's shape. */
async function readStoredRows(tx: DbTx, userId: string): Promise<StoredRow[]> {
  const rows = await tx
    .select({
      id: availabilityTemplates.id,
      locationId: availabilityTemplates.locationId,
      weekday: availabilityTemplates.weekday,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
      isActive: availabilityTemplates.isActive,
    })
    .from(availabilityTemplates)
    .where(eq(availabilityTemplates.userId, userId));
  return rows.map((r) => ({
    ...r,
    startTime: r.startTime.slice(0, 5),
    endTime: r.endTime.slice(0, 5),
  }));
}

async function setRow(
  tx: DbTx,
  userId: string,
  id: string,
  set: { isActive: boolean } | { validFrom: string | null; validUntil: string | null },
): Promise<void> {
  const rows = await tx
    .update(availabilityTemplates)
    .set(set)
    .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.userId, userId)))
    .returning({ id: availabilityTemplates.id });
  if (!rows[0]) throw new AdminError("not_found", "a row the removal plan named has gone");
}

export async function removeDayDefined(
  actor: RequestContext,
  templateId: string,
): Promise<RemoveDayDefinedResult> {
  assertCan(actor.role, "schedule:manage");
  if (!UUID_RE.test(templateId)) throw new AdminError("invalid", "template id required");
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    const [row] = await tx
      .select({
        userId: availabilityTemplates.userId,
        validFrom: availabilityTemplates.validFrom,
        validUntil: availabilityTemplates.validUntil,
      })
      .from(availabilityTemplates)
      .where(and(eq(availabilityTemplates.id, templateId), eq(availabilityTemplates.isActive, true)))
      .limit(1);
    if (!row) throw new AdminError("not_found");
    await assertTargetInScheduleScope(tx, row.userId, scope);
    if (scheduleRuleFor(row) !== "dia_definido") {
      throw new AdminError("invalid", "only a Dia definido row is removed here");
    }

    const plan = planDayDefinedRemoval(templateId, await readStoredRows(tx, row.userId));
    if (!plan.ok) {
      if (plan.reason === "not_found") throw new AdminError("not_found");
      if (plan.reason === "not_day_defined") {
        throw new AdminError("invalid", "only a Dia definido row is removed here");
      }
      // THE REFUSAL. Nothing has been written, and nothing will be.
      return { ok: false as const, reason: plan.reason, date: plan.date ?? row.validFrom! };
    }

    // Retire before revive, revive before re-bound: a bound change never targets
    // a key another row holds (the planner revives the holder instead), so this
    // order only matters for reading the sequence, not for the constraint.
    await setRow(tx, row.userId, plan.archiveId, { isActive: false });
    for (const id of plan.deactivate) await setRow(tx, row.userId, id, { isActive: false });
    for (const id of plan.activate) await setRow(tx, row.userId, id, { isActive: true });
    for (const b of plan.bounds) {
      await setRow(tx, row.userId, b.id, { validFrom: b.validFrom, validUntil: b.validUntil });
    }

    await writeAudit(tx, actor, {
      action: "availability_template.day_defined_remove",
      entityType: "availability_template",
      entityId: templateId,
      metadata: dayDefinedRemovalAuditMetadata(plan, row.userId),
    });

    return {
      ok: true as const,
      date: plan.date,
      outcome: plan.outcome,
      restored: plan.bounds.length + plan.activate.length,
    };
  });
}
