import "server-only";
import { assertCan } from "@osteojp/auth";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { addDays } from "@/lib/scheduling/time";
import {
  planAlternatingWeeks,
  type AlternatingWeeksPlan,
} from "@/lib/scheduling/alternating-weeks";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope } from "./schedule-scope";
import {
  affectedAppointments,
  assertPlanWritable,
  readActiveRows,
  writeSchedulePlan,
  type AffectedAppointment,
  type ScheduleWindowResult,
} from "./schedule-window-write";

/**
 * ITEM 5 - apply an alternating-week pattern to one therapist's schedule.
 *
 * LAYER 2 IS THE SAME TABLE AS LAYER 1, carrying `valid_from` / `valid_until`.
 * No migration: those columns already exist and every consumer already honours
 * them (day-availability-core.ts via isWithinValidity; the portal booking guard
 * in SQL at apps/api/lib/appointments/store.ts). The weekly setup REMAINS layer
 * 1 and the default - the pattern is a window carved into it, never a
 * replacement.
 *
 * THE INVARIANT IS ENFORCED BEFORE ANY WRITE, AND THAT PLACEMENT IS THE DESIGN.
 * The owner ratified a write-time invariant over read-time precedence precisely
 * so no consumer has to disambiguate anything: four consumers, two of them SQL,
 * would have meant four copies of a precedence rule and the drift that produced
 * migration 0059. Checking the PROJECTED rows means a violation is refused while
 * the transaction has written nothing, rather than discovered halfway through an
 * insert loop.
 *
 * THE CARVE AND THE WRITE ARE SHARED WITH THE DAY-BY-DAY GRID (schedule-window*).
 * SCHED-05 is why: re-running a pattern over a window it already covered bounded
 * its OWN dated rows backwards and left them dead. A re-run now refuses and names
 * the dates, and `replace` supersedes them by deactivation.
 */

export type { AffectedAppointment };

export type ApplyAlternatingResult =
  | ({ ok: true } & ScheduleWindowResult)
  /** Dated rows already occupy this window. NOTHING was written. */
  | { ok: false; reason: "collision"; dates: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** R-SCHED-1: the horizon is three months. A little slack for month lengths. */
const MAX_HORIZON_DAYS = 100;

function validate(plan: AlternatingWeeksPlan): void {
  if (!DATE_RE.test(plan.startDate) || !DATE_RE.test(plan.endDate)) {
    throw new AdminError("invalid", "dates must be yyyy-mm-dd");
  }
  if (plan.endDate < plan.startDate) {
    throw new AdminError("invalid", "endDate must be on or after startDate");
  }
  if (plan.endDate > addDays(plan.startDate, MAX_HORIZON_DAYS)) {
    throw new AdminError("invalid", "the scheduling horizon is three months");
  }
  if (plan.weekdays.length === 0) throw new AdminError("invalid", "pick at least one weekday");
  if (plan.weekdays.some((d) => d < 0 || d > 6)) {
    throw new AdminError("invalid", "weekday must be 0-6");
  }
  if (plan.endTime <= plan.startTime) {
    throw new AdminError("invalid", "end must be after start");
  }
  if (plan.locationAId === plan.locationBId) {
    // Not a technical constraint - the same clinic both weeks is just a weekly
    // schedule, and expressing it as a pattern would write 65 rows to say what
    // one row already says.
    throw new AdminError("invalid", "the two weeks must be at different clinics");
  }
}

export async function applyAlternatingWeeks(
  actor: RequestContext,
  userId: string,
  plan: AlternatingWeeksPlan,
  opts: { replace?: boolean } = {},
): Promise<ApplyAlternatingResult> {
  assertCan(actor.role, "schedule:manage");
  validate(plan);
  const scope = await resolveScheduleScope(actor);

  return runScoped(actor, async (tx) => {
    await assertTargetInScheduleScope(tx, userId, scope);

    const existing = await readActiveRows(tx, userId);
    const write = planAlternatingWeeks(plan, existing, opts);

    // THE RE-RUN REFUSAL (SCHED-05). Dated rows in this window are somebody's
    // entered schedule - this mode's own previous run, or the day-by-day grid's.
    // Writing over them is a second decision, taken with the dates in view.
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
      action: "availability_template.alternating_weeks",
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
