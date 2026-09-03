import type { InspectedDay } from "./schedule-inspection";

/**
 * SCHED-10 - what an inline edit on ONE inspector row means, as pure functions.
 *
 * ==========================================================================
 * THE WINDOW IS ONE DAY, AND THAT IS THE WHOLE OF THE CARD'S WARNING.
 * ==========================================================================
 * `day-by-day.ts` states it in its own header: inside [startDate, endDate] the
 * grid is the COMPLETE truth, so a date with no entry means the therapist does
 * NOT work - not "unchanged". A single-day edit therefore has to open a
 * single-day window, or it silently blanks every other day it spans. That is not
 * a hypothetical; it is what the exhaustive-window semantics mean.
 *
 * So `dayEditPlan` never returns a window wider than the day being edited, and
 * `singleDayWindow` is asserted in both directions by the tests beside this
 * file. No new storage, no new write path: this is the dia a dia call with one
 * entry, which is what the dispatch and the card both asked for.
 *
 * THERE IS NO "NOT WORKING" HERE, AND THAT IS THE WRITE PATH'S RULING RATHER
 * THAN AN OMISSION. `applyDayByDaySchedule` REFUSES an empty entry list, in its
 * own words: "AN EMPTY WINDOW IS REFUSED RATHER THAN TREATED AS 'WORKS NO DAYS'.
 * The two are indistinguishable in the payload, one of them is a mis-click, and
 * the deliberate version has its own tool: blocked time removes availability
 * without touching the schedule that resumes afterwards."
 *
 * The first draft of this editor offered a "Trabalha neste dia" checkbox that
 * cleared the day, and it was refused at the server with a generic error - the
 * screen offering something the system does not do, which is worse than not
 * offering it. The editor now sets HOURS and CLINIC for one day and points at
 * Bloquear horário for an absence.
 */

export type DayEditDraft = {
  locationId: string;
  startTime: string;
  endTime: string;
};

export type DayEditPlan = {
  startDate: string;
  endDate: string;
  entries: { date: string; locationId: string; startTime: string; endTime: string }[];
};

/** i18n keys for every reason this edit cannot be saved, in form order. */
export function dayEditBlockingReasons(draft: DayEditDraft): string[] {
  const reasons: string[] = [];
  if (draft.locationId === "") reasons.push("inspector.editBlockNoClinic");
  if (draft.endTime <= draft.startTime) reasons.push("inspector.editBlockEndNotAfterStart");
  return reasons;
}

/**
 * The dia a dia call for one day. `date` bounds BOTH ends of the window - see
 * the header.
 */
export function dayEditPlan(date: string, draft: DayEditDraft): DayEditPlan {
  return {
    startDate: date,
    endDate: date,
    // ALWAYS ONE ENTRY. An empty list is refused by the write path (see the
    // header), so producing one here would move a known refusal to the server
    // and surface it as a generic error.
    entries: [
      {
        date,
        locationId: draft.locationId,
        startTime: draft.startTime,
        endTime: draft.endTime,
      },
    ],
  };
}

/** True when a plan governs exactly one calendar day. The invariant, testable. */
export function isSingleDayWindow(plan: DayEditPlan): boolean {
  return plan.startDate === plan.endDate && plan.entries.every((e) => e.date === plan.startDate);
}

/**
 * The draft a row opens with: the day's FIRST window, or a sensible empty shift
 * when the therapist does not work that day.
 *
 * IT READS THE RESOLVED DAY rather than the underlying rows, because the
 * inspector renders the resolver's answer and an edit form that started from
 * something else would be a second opinion on the same screen - which is what
 * SCHED-09 was built to avoid.
 */
export function draftFromDay(day: InspectedDay, fallbackLocationId: string): DayEditDraft {
  const first = day.windows[0];
  if (!first) {
    // A day with no hours opens on an ordinary shift, which is what somebody
    // opening the editor on a blank day is about to type anyway.
    return { locationId: fallbackLocationId, startTime: "09:00", endTime: "17:00" };
  }
  return {
    locationId: first.locationId ?? fallbackLocationId,
    startTime: first.start,
    endTime: first.end,
  };
}
