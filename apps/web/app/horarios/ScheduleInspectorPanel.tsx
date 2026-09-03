"use client";

import { useRouter } from "next/navigation";

import { ScheduleInspector } from "./ScheduleInspector";
import { applyDayByDayScheduleAction } from "./actions";
import { dayEditPlan, isSingleDayWindow, type DayEditDraft } from "@/lib/scheduling/inspector-edit";
import type { InspectedDay } from "@/lib/scheduling/schedule-inspection";

/**
 * SCHED-09 — the client half of the inspector: it owns the router and nothing
 * else.
 *
 * THE FILTERS LIVE IN THE URL rather than in component state, so the view is
 * LINKABLE - "look at JP, two weeks" is a URL somebody can paste into a message
 * - and so the day rows stay SERVER-rendered from the resolver. Client state
 * would have meant fetching the schedule in the browser, which is a second path
 * to the same answer and the thing SR-37 forbids.
 */
export function ScheduleInspectorPanel({
  days,
  therapists,
  therapistId,
  period,
  locations,
}: {
  days: InspectedDay[];
  therapists: { id: string; label: string }[];
  therapistId: string;
  period: string;
  /** SCHED-10: the clinics an edited day can be moved to. */
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const go = (next: { t?: string; p?: string }) => {
    const params = new URLSearchParams();
    params.set("t", next.t ?? therapistId);
    params.set("p", next.p ?? period);
    router.push(`/horarios?${params.toString()}`);
  };
  /**
   * SCHED-10 - the inline edit, through the EXISTING dia a dia write.
   *
   * NO NEW STORAGE AND NO NEW PATH: `applyDayByDayScheduleAction` already turns
   * a named date into an availability_templates row bounded to that single day,
   * with the coverage invariant checked on the way in. This is that call with
   * one entry.
   *
   * THE WINDOW IS ASSERTED HERE, not assumed. day-by-day's window is EXHAUSTIVE
   * - inside [startDate, endDate] a date with no entry means NOT WORKING - so a
   * window wider than the edited day would silently blank the days around it.
   * `dayEditPlan` builds a one-day window and this refuses to send anything
   * else, because the cost of being wrong is a therapist's week disappearing
   * and nothing on screen saying so.
   */
  const onSaveDay = async (date: string, draft: DayEditDraft, opts: { replace?: boolean }) => {
    const plan = dayEditPlan(date, draft);
    if (!isSingleDayWindow(plan)) {
      return { ok: false, error: "window_not_single_day" };
    }
    const res = await applyDayByDayScheduleAction({
      userId: therapistId,
      startDate: plan.startDate,
      endDate: plan.endDate,
      entries: plan.entries,
      replace: opts.replace,
    });
    // THE INSPECTOR RE-RENDERS FROM THE RESOLVER rather than from this result:
    // refresh re-runs the server component, which asks getTherapistAvailability
    // again. A client-side patch of the rows would be a second answer to the
    // question SCHED-09 exists to answer once.
    if (res.ok) router.refresh();
    return { ok: res.ok, collisionDates: res.collisionDates, error: res.error };
  };

  return (
    <ScheduleInspector
      days={days}
      therapists={therapists}
      therapistId={therapistId}
      period={period}
      locations={locations}
      onTherapistChange={(t) => go({ t })}
      onPeriodChange={(p) => go({ p })}
      onSaveDay={onSaveDay}
    />
  );
}
