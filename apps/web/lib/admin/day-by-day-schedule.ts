import "server-only";
import { assertCan } from "@osteojp/auth";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { addDays } from "@/lib/scheduling/time";
import { planDayByDay, type DayByDayPlan } from "@/lib/scheduling/day-by-day";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope } from "./schedule-scope";
import {
  affectedAppointments,
  assertPlanWritable,
  readActiveRows,
  writeSchedulePlan,
  type ScheduleWindowResult,
} from "./schedule-window-write";

/**
 * SCHED-04 (ITEM B) - apply a day-by-day schedule window to one therapist.
 *
 * The third entry mode. Mode 1 is the weekly schedule, mode 2 the alternating
 * pattern, and this one is for the period that follows no rule: the dates are
 * named one at a time because nothing generates them.
 *
 * NO MIGRATION. It writes the same rows layer 2 has always written - one
 * availability_templates row per date, valid_from === valid_until === the date -
 * and both consumers already honour those columns. is_active, which the replace
 * path uses, has been on the table since it was created.
 *
 * THE WINDOW IS EXHAUSTIVE: inside it, the grid is the therapist's complete
 * schedule and an unset day is a day not worked. The reasoning is in
 * lib/scheduling/day-by-day.ts, and it is forced by the row model rather than
 * chosen. The panel therefore renders every date in the window, so that
 * statement is on screen rather than implied.
 */

export type ApplyDayByDayResult =
  | ({ ok: true } & ScheduleWindowResult)
  /** Dated rows already occupy this window. NOTHING was written. */
  | { ok: false; reason: "collision"; dates: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The same horizon as the alternating pattern (R-SCHED-1), one definition. */
const MAX_HORIZON_DAYS = 100;

function validate(plan: DayByDayPlan): void {
  if (!DATE_RE.test(plan.startDate) || !DATE_RE.test(plan.endDate)) {
    throw new AdminError("invalid", "dates must be yyyy-mm-dd");
  }
  if (plan.endDate < plan.startDate) {
    throw new AdminError("invalid", "endDate must be on or after startDate");
  }
  if (plan.endDate > addDays(plan.startDate, MAX_HORIZON_DAYS)) {
    throw new AdminError("invalid", "the scheduling horizon is three months");
  }
  // AN EMPTY WINDOW IS REFUSED RATHER THAN TREATED AS "WORKS NO DAYS". The two
  // are indistinguishable in the payload, one of them is a mis-click, and the
  // deliberate version has its own tool: blocked time removes availability
  // without touching the schedule that resumes afterwards.
  if (plan.entries.length === 0) {
    throw new AdminError("invalid", "set at least one day");
  }
  for (const e of plan.entries) {
    if (!DATE_RE.test(e.date)) throw new AdminError("invalid", "dates must be yyyy-mm-dd");
    // Outside the window is a mistake, not an instruction: the person was
    // looking at a window, so a date beyond it is not something to clamp.
    if (e.date < plan.startDate || e.date > plan.endDate) {
      throw new AdminError("invalid", "every day must fall inside the window");
    }
    if (!e.locationId) throw new AdminError("invalid", "every day needs a clinic");
    if (e.endTime <= e.startTime) throw new AdminError("invalid", "end must be after start");
  }
}

export async function applyDayByDaySchedule(
  actor: RequestContext,
  userId: string,
  plan: DayByDayPlan,
  opts: { replace?: boolean } = {},
): Promise<ApplyDayByDayResult> {
  assertCan(actor.role, "schedule:manage");
  validate(plan);
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, userId, scope);

    const existing = await readActiveRows(tx, userId);
    const write = planDayByDay(plan, existing, opts);

    // THE REFUSAL, AND IT IS THE RATIFIED BEHAVIOUR RATHER THAN A SAFETY NET.
    // Dated rows in this window are work somebody entered by hand. They are
    // named back to the caller and nothing is written; replacing them is a
    // separate, explicit action taken with those dates on screen.
    if (write.collisions.length > 0 && !opts.replace) {
      return {
        ok: false as const,
        reason: "collision" as const,
        dates: [...new Set(write.collisions.map((c) => c.date))].sort(),
      };
    }

    assertPlanWritable(existing, write);
    await writeSchedulePlan(tx, actor.tenantId, userId, write);

    await writeAudit(tx, actor, {
      action: "availability_template.day_by_day",
      entityType: "availability_template",
      entityId: userId,
    });

    return {
      ok: true as const,
      created: write.created.length,
      carved: write.carved.length,
      superseded: write.deactivate.length,
      affected: await affectedAppointments(tx, userId, plan.startDate, plan.endDate),
    };
  });
}
