"use client";

import { useRouter } from "next/navigation";

import { ScheduleInspector } from "./ScheduleInspector";
import { applyDayByDayScheduleAction, deleteTimeOffBlockAction } from "./actions";
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

  /**
   * SCHED-21 - REMOVING A BLOCK FROM THE ROW THAT SHOWS IT.
   *
   * It calls the SAME server action the Bloquear horario modal's Eliminar
   * button calls. That matters more than the convenience: `deleteTimeOffBlock`
   * re-checks schedule:manage and the own-location scope inside, and writes the
   * `time_off.delete` audit row. A second delete path that skipped either would
   * be a hole opened for a button.
   *
   * The action redirects to /horarios, so the inspector re-renders from the
   * resolver and the row disappears because the BLOCK is gone, not because a
   * client patched the list.
   */
  const onRemoveBlock = (blockId: string) => {
    const fd = new FormData();
    fd.set("id", blockId);
    fd.set("userId", therapistId);
    void deleteTimeOffBlockAction(fd);
  };

  /**
   * SCHED-21 - EDITING GOES TO THE FORM THAT ALREADY EDITS BLOCKS.
   *
   * A second editor for one row would be a second opinion about what a block
   * is - two forms writing time_off, free to disagree about modes and about
   * what an empty note means. The row instead opens the Bloquear horario dialog
   * for this therapist with this block already selected, through the URL, so
   * the state is linkable and survives the refresh the delete above triggers.
   */
  const onEditBlock = (blockId: string) => {
    const params = new URLSearchParams();
    params.set("t", therapistId);
    params.set("p", period);
    params.set("editBlock", blockId);
    router.push(`/horarios?${params.toString()}#inspetor`);
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
      onRemoveBlock={onRemoveBlock}
      onEditBlock={onEditBlock}
    />
  );
}
