/* ====================================================================== */
/* GUEST-04 - what `guest_booking_requests.requested_starts_at/_ends_at`  */
/* ACTUALLY MEAN under the Option A ruling, in ONE place.                 */
/* ====================================================================== */
/*
 * THE RULING (2026-08-14, strategy + owner). The public guest form collects a
 * PREFERRED DATE and a PREFERRED PERIOD - morning or afternoon - and nothing
 * finer. There is no per-therapist slot grid, no live availability, and no
 * confirmation that any specific time is free. Reception resolves the real slot
 * at confirm, consistent with R-GUEST-1: a guest booking is always a request.
 *
 * THE COLUMNS SHIPPED BEFORE THE RULING DID. 0063 declared
 * `requested_starts_at` / `requested_ends_at` as an exact timestamptz window,
 * on the assumption the form would offer real slots. Option A is authorised
 * WITHOUT a new migration (0064 is not authorized), so the two columns are
 * REINTERPRETED at the write layer: they carry the PERIOD's boundaries, and the
 * pair is an encoding of (date, period) rather than a slot anybody was offered.
 *
 * WHY THE ENCODING LIVES BESIDE THE SCHEMA AND NOT IN EITHER APP. Two different
 * applications touch this pair - apps/api WRITES it from the public form and
 * apps/web READS it onto reception's queue - and they must agree about what a
 * 09:00-13:00 window means. A copy in each app is the duplication that
 * GUEST-02's parity test exists to catch one column over, and the failure would
 * look identical here: reception would read a precise time that nobody typed.
 *
 * THE MOST IMPORTANT THING IN THIS FILE IS THAT DECODING CAN FAIL VISIBLY.
 * `decodeGuestPreferredWindow` returns a DISCRIMINATED UNION, never a period
 * with a fallback. A window that is not one of the two encodings is reported as
 * `exact` and rendered as the timestamp it is - because the alternative, mapping
 * an unrecognised window onto "manhã", is exactly the one-line convenience
 * PORTAL-REHYDRATE §1.3 is about: reception would read an invented preference
 * as a stated one, on a screen that looks entirely normal.
 */

/** The two periods, in the order a day runs. */
export const GUEST_PREFERRED_PERIODS = ["manha", "tarde"] as const;
export type GuestPreferredPeriod = (typeof GUEST_PREFERRED_PERIODS)[number];

/**
 * The period boundaries, in Europe/Lisbon wall-clock hours.
 *
 * SOURCED FROM THE CLINIC'S OWN PUBLISHED HOURS - 09:00 to 19:00, committed at
 * `apps/portal/app/portal/clinics/page.tsx` and printed on osteojp.pt - split at
 * the conventional Portuguese manhã/tarde boundary of 13:00.
 *
 * THESE ARE NOT A CLAIM ABOUT AVAILABILITY. They encode a preference somebody
 * expressed; no therapist's schedule is consulted at any point on this path, and
 * nothing here reserves anything. A guest asking for "tarde" is asking to be
 * called about an afternoon, not being offered 13:00.
 */
export const GUEST_PERIOD_HOURS: Record<
  GuestPreferredPeriod,
  { startHour: number; endHour: number }
> = {
  manha: { startHour: 9, endHour: 13 },
  tarde: { startHour: 13, endHour: 19 },
};

export function isGuestPreferredPeriod(v: unknown): v is GuestPreferredPeriod {
  return (
    typeof v === "string" &&
    (GUEST_PREFERRED_PERIODS as readonly string[]).includes(v)
  );
}

const LISBON = "Europe/Lisbon";

/**
 * `h23` IS LOAD-BEARING, not a formatting preference. Under the default hour
 * cycle several locales render midnight as "24", which would make a midnight
 * instant read as hour 24 of the previous day and shift every derived offset by
 * a day. Pinning the cycle removes the possibility.
 */
const LISBON_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: LISBON,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export type LisbonWallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** One instant, read as Lisbon wall-clock fields. */
export function lisbonWallClock(instant: Date): LisbonWallClock {
  const out: Record<string, number> = {};
  for (const part of LISBON_PARTS.formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** Lisbon's UTC offset, in ms, at a given instant. +0 in winter, +1h in summer. */
function lisbonOffsetMs(instant: Date): number {
  const p = lisbonWallClock(instant);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    instant.getTime()
  );
}

/**
 * The instant at which Lisbon's clock reads the given wall-clock time.
 *
 * TWO PASSES, DELIBERATELY. The first guess uses the offset in force at the
 * NAIVE instant, which is the wrong side of the boundary on the two days a year
 * the offset changes; the second uses the offset in force at the guess and
 * converges. Both period boundaries (09:00, 13:00, 19:00) are hours away from
 * Lisbon's 01:00 UTC transition, so the second pass never fires in practice -
 * it is here so that moving a boundary later does not quietly introduce a
 * once-a-year one-hour error nobody would look for.
 */
function instantAtLisbonWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour);
  const firstPass = naive - lisbonOffsetMs(new Date(naive));
  return new Date(naive - lisbonOffsetMs(new Date(firstPass)));
}

export type CalendarDate = { year: number; month: number; day: number };

/**
 * `YYYY-MM-DD` as a real calendar date, or null.
 *
 * ONE FAILURE MODE, and it is named: the string is not a well-formed calendar
 * date. `2026-02-30` and `2026-13-01` are rejected by the round-trip check
 * rather than silently rolling over into March and January, which is what
 * `new Date()` would do with them.
 */
export function parseCalendarDate(value: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** `YYYY-MM-DD` for a calendar date. */
export function formatCalendarDate(date: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Today's Lisbon calendar date, for "not in the past" checks. */
export function lisbonToday(now: Date): CalendarDate {
  const p = lisbonWallClock(now);
  return { year: p.year, month: p.month, day: p.day };
}

/** Calendar-date ordering. Negative when `a` is earlier than `b`. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return (
    a.year - b.year || a.month - b.month || a.day - b.day
  );
}

/** Whole days from `a` to `b`, for the booking horizon check. */
export function calendarDaysBetween(a: CalendarDate, b: CalendarDate): number {
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/**
 * (date, period) -> the timestamptz pair 0063 stores. Total: every calendar date
 * and every period has an encoding.
 */
export function encodeGuestPreferredWindow(
  date: CalendarDate,
  period: GuestPreferredPeriod,
): { startsAt: Date; endsAt: Date } {
  const { startHour, endHour } = GUEST_PERIOD_HOURS[period];
  return {
    startsAt: instantAtLisbonWallClock(date.year, date.month, date.day, startHour),
    endsAt: instantAtLisbonWallClock(date.year, date.month, date.day, endHour),
  };
}

/**
 * What a stored pair means. A PERIOD when the pair is one of the two encodings
 * above; `exact` for anything else.
 *
 * `exact` IS NOT AN ERROR STATE AND IT IS NOT A FALLBACK EITHER. It is the
 * honest reading of a window that does not encode a period: reception is shown
 * the timestamp itself, labelled as a time, and is never told a period the row
 * does not carry. Nothing in the shipped product can currently write such a row -
 * the public form is the only writer and it always encodes a period - so this
 * arm exists for a row written by hand, by a future caller, or by a version of
 * this file whose boundaries have moved.
 */
export type DecodedGuestWindow =
  | { kind: "period"; dateYmd: string; period: GuestPreferredPeriod }
  | { kind: "exact" };

export function decodeGuestPreferredWindow(
  startsAt: Date,
  endsAt: Date,
): DecodedGuestWindow {
  const s = lisbonWallClock(startsAt);
  const e = lisbonWallClock(endsAt);

  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  const onTheHour =
    s.minute === 0 && s.second === 0 && e.minute === 0 && e.second === 0;
  if (!sameDay || !onTheHour) return { kind: "exact" };

  for (const period of GUEST_PREFERRED_PERIODS) {
    const { startHour, endHour } = GUEST_PERIOD_HOURS[period];
    if (s.hour === startHour && e.hour === endHour) {
      return {
        kind: "period",
        dateYmd: formatCalendarDate({ year: s.year, month: s.month, day: s.day }),
        period,
      };
    }
  }
  return { kind: "exact" };
}
