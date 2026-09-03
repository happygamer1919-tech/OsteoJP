import "server-only";

import type { RequestContext } from "@/lib/auth/context";
import { getTherapistAvailability } from "./day-availability";
import type { ScheduleRule } from "./availability";
import { addDays } from "./time";

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

export type InspectedDay = {
  /** Lisbon calendar date, "yyyy-mm-dd". */
  date: string;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  windows: InspectedWindow[];
  /**
   * time_off spans overlapping the day. THE THIRD LABEL IS NOT A TEMPLATE, and
   * that asymmetry is real rather than a modelling slip: `excecao` comes from a
   * different table, so it is carried separately instead of being flattened
   * into `windows` where it would look like working time.
   */
  exceptions: { start: string; end: string; reason: string }[];
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

  return days.map((day) => ({
    date: day.date,
    weekday: weekdayOf(day.date),
    windows: day.sources.map((w) => ({
      start: hhmm(w.start),
      end: hhmm(w.end),
      locationId: w.locationId,
      locationName: w.locationId ? (locationNames.get(w.locationId) ?? null) : null,
      rule: w.rule,
    })),
    exceptions: day.blocks.map((b) => ({
      start: hhmm(b.start),
      end: hhmm(b.end),
      reason: b.reason,
    })),
  }));
}

/** Inclusive day count, so a period filter can bound itself honestly. */
export function daysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) n++;
  return n;
}
