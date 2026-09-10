import "server-only";

import type { RequestContext } from "@/lib/auth/context";
import { getTherapistAvailability } from "./day-availability";
import { noFreeReason } from "./day-availability-core";
import type { ScheduleRule } from "./availability";
import { addDays, lisbonMidnightUtc } from "./time";

/**
 * SCHED-09 — the schedule inspector's read.
 *
 * ==========================================================================
 * IT CALLS `getTherapistAvailability` AND NOTHING ELSE, WHICH IS THE POINT.
 * ==========================================================================
 * The dispatch's condition was that the inspector render from the SAME resolver
 * the agenda uses, "because an inspector that computes its own answer proves
 * nothing". So this module does no filtering, no weekday arithmetic and no
 * validity logic of its own: it asks the resolver what each day resolves to and
 * formats the answer. If the agenda is wrong, the inspector is wrong in exactly
 * the same way - which is the only behaviour that makes it evidence.
 *
 * THE ONLY THING IT ADDS is names: the resolver deals in ids, and a screen that
 * says "loc-8f2a" answers nothing.
 */

export type InspectedWindow = {
  /** Lisbon "HH:mm". */
  start: string;
  end: string;
  locationId: string | null;
  locationName: string | null;
  rule: ScheduleRule;
};

/**
 * SCHED-21 - one block AS IT FALLS ON ONE DAY.
 *
 * CLIPPED, which is the whole difference from what shipped. The old shape
 * carried the row's RAW starts_at/ends_at, so a five-day absence printed an
 * identical `00:00-00:00` under every day it touched - three lines that were
 * one row, each showing the same two midnights. Clipping to the day means the
 * times on a row are the times ON THAT DAY, and `continuesBefore` /
 * `continuesAfter` say that the block is bigger than the row rather than
 * leaving the reader to infer it from a suspicious pair of zeros.
 */
export type InspectedBlock = {
  blockId: string;
  /** Lisbon "HH:mm", clipped to this day. */
  start: string;
  end: string;
  /** True when the clip covers the whole day, which is what a `prolongada`
   *  block looks like from inside one of its days. Rendered as a word rather
   *  than as `00:00-00:00`, which is the string that confused the outage. */
  allDay: boolean;
  /** The block began before this day / runs past it. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  reason: string;
  note: string | null;
};

export type InspectedDay = {
  /** Lisbon calendar date, "yyyy-mm-dd". */
  date: string;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  windows: InspectedWindow[];
  /**
   * time_off spans as they fall ON THIS DAY. Still carried separately from
   * `windows` - `excecao` comes from a different table and flattening it in
   * would make an absence look like working time - but no longer rendered in a
   * separate appendix at the bottom of the table, which is what let a blocked
   * day and its block sit twenty rows apart.
   */
  blocks: InspectedBlock[];
  /**
   * SCHED-21 - THE FIELD THE INSPECTOR USED TO THROW AWAY.
   *
   * `getTherapistAvailability` returns `free` = working minus booked minus
   * blocks. It is the ONLY field that reconciles the windows with the blocks,
   * and `inspectSchedule` discarded it - which is exactly how this screen came
   * to print a green "Dia definido 09:00-20:00" chip on a day the agenda
   * treated as 100% unbookable.
   *
   * True when the day HAS hours and a block has taken all of them.
   */
  fullyBlocked: boolean;
};

const hhmm = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const weekdayOf = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
};

/**
 * Every day in [from, to] for one therapist, with the windows that produced it.
 *
 * `locationNames` is passed in rather than queried here: the caller already
 * holds the tenant's locations for its filters, and a second query would be a
 * second answer to "what is this clinic called".
 */
export async function inspectSchedule(
  actor: RequestContext,
  args: {
    therapistId: string;
    from: string;
    to: string;
    locationNames: Map<string, string>;
  },
): Promise<InspectedDay[]> {
  const { therapistId, from, to, locationNames } = args;
  if (to < from) return [];

  const days = await getTherapistAvailability(actor, { therapistId, from, to });

  return days.map((day) => {
    // The day's own bounds, so a multi-day block can be cut down to the part
    // that actually falls here.
    const dayStart = lisbonMidnightUtc(day.date).getTime();
    const dayEnd = lisbonMidnightUtc(addDays(day.date, 1)).getTime();

    return {
      date: day.date,
      weekday: weekdayOf(day.date),
      windows: day.sources.map((w) => ({
        start: hhmm(w.start),
        end: hhmm(w.end),
        locationId: w.locationId,
        locationName: w.locationId ? (locationNames.get(w.locationId) ?? null) : null,
        rule: w.rule,
      })),
      blocks: day.blocks.map((b) => {
        const rawStart = new Date(b.start).getTime();
        const rawEnd = new Date(b.end).getTime();
        const start = Math.max(rawStart, dayStart);
        const end = Math.min(rawEnd, dayEnd);
        return {
          blockId: b.blockId,
          start: hhmm(new Date(start).toISOString()),
          end: hhmm(new Date(end).toISOString()),
          allDay: start <= dayStart && end >= dayEnd,
          continuesBefore: rawStart < dayStart,
          continuesAfter: rawEnd > dayEnd,
          reason: b.reason,
          note: b.note,
        };
      }),
      // Computed by the SAME function the availability panel uses, so the two
      // screens cannot disagree about whether a block took the day.
      fullyBlocked: noFreeReason(day) === "blocked",
    };
  });
}

/** Inclusive day count, so a period filter can bound itself honestly. */
export function daysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) n++;
  return n;
}
