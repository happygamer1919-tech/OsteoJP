// Date / week / slot helpers for the agenda.
//
// The DB stores every instant as timestamptz (UTC). The clinic thinks in
// Europe/Lisbon wall-clock. This module is the ONLY place that bridges the
// two, so timezone handling stays in one tested spot.
//
// Conventions:
//   - A "date string" is a Lisbon calendar day in ISO form: "yyyy-mm-dd".
//   - Week starts Monday; the week view renders Monday–Friday (matches the
//     agenda wireframe). The day view renders a single day.
//   - Calendar arithmetic uses UTC noon as a DST-proof anchor; only the
//     UTC<->Lisbon conversions consult the real zone offset.

import type { Locale } from "@osteojp/i18n";

export const LISBON_TZ = "Europe/Lisbon";
export const SLOT_MINUTES = 30;
export const DAY_START_HOUR = 8; // first visible row
export const DAY_END_HOUR = 20; // last visible row (exclusive end label)
export const WEEK_DAYS = 6; // Mon–Sat (W3-08, DECISIONS 2026-07-05 real clinic schedule)

const BCP47: Record<Locale, string> = { pt: "pt-PT", en: "en-GB" };

/* ------------------------------------------------------------------ */
/* Calendar arithmetic (timezone-independent)                          */
/* ------------------------------------------------------------------ */

function parse(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m, d];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar date `n` days from `dateStr` (n may be negative). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = parse(dateStr);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Calendar date `n` months from `dateStr`, clamping the day to the target
 * month's length (e.g. Jan 31 + 1 month → Feb 28). Used for monthly recurrence.
 */
export function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = parse(dateStr);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0–11
  const daysInMonth = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, daysInMonth))}`;
}

/** 0 = Monday … 6 = Sunday, for a calendar date. */
export function isoWeekdayMon0(dateStr: string): number {
  const [y, m, d] = parse(dateStr);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `dateStr`. */
export function startOfWeekMonday(dateStr: string): string {
  return addDays(dateStr, -isoWeekdayMon0(dateStr));
}

/** The Lisbon calendar dates rendered for a given view + anchor. */
export function viewDates(view: AgendaView, anchor: string): string[] {
  if (view === "day") return [anchor];
  const monday = startOfWeekMonday(anchor);
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(monday, i));
}

export type AgendaView = "day" | "week";

/* ------------------------------------------------------------------ */
/* UTC <-> Lisbon                                                      */
/* ------------------------------------------------------------------ */

/** Offset (ms) such that lisbonWallClock = utcInstant + offset, at `instant`. */
function lisbonOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: LISBON_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) m[p.type] = p.value;
  const asUtc = Date.UTC(
    +m.year,
    +m.month - 1,
    +m.day,
    +m.hour,
    +m.minute,
    +m.second,
  );
  return asUtc - instant.getTime();
}

/** UTC instant of 00:00 Europe/Lisbon on the given calendar date. */
export function lisbonMidnightUtc(dateStr: string): Date {
  const [y, m, d] = parse(dateStr);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0); // midnight treated as UTC
  const offset = lisbonOffsetMs(new Date(guess));
  return new Date(guess - offset);
}

/** Lisbon wall-clock parts of a UTC instant. */
export function lisbonParts(instant: Date): {
  date: string;
  hour: number;
  minute: number;
} {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) m[p.type] = p.value;
  return {
    date: `${m.year}-${m.month}-${m.day}`,
    hour: +m.hour,
    minute: +m.minute,
  };
}

/** Minutes since Lisbon midnight for a UTC instant (for vertical placement). */
export function lisbonMinutesFromMidnight(instant: Date): number {
  const { hour, minute } = lisbonParts(instant);
  return hour * 60 + minute;
}

/** Half-open UTC range covering every day rendered by view + anchor. */
export function rangeForView(
  view: AgendaView,
  anchor: string,
): { startUtc: Date; endUtc: Date } {
  const dates = viewDates(view, anchor);
  return {
    startUtc: lisbonMidnightUtc(dates[0]),
    endUtc: lisbonMidnightUtc(addDays(dates[dates.length - 1], 1)),
  };
}

/** Combine a Lisbon calendar date + "HH:mm" into a UTC instant. */
export function lisbonDateTimeToUtc(dateStr: string, hhmm: string): Date {
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(lisbonMidnightUtc(dateStr).getTime() + (h * 60 + min) * 60_000);
}

/* ------------------------------------------------------------------ */
/* Display formatting (Lisbon)                                         */
/* ------------------------------------------------------------------ */

function utcNoon(dateStr: string): Date {
  const [y, m, d] = parse(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "Seg 14" — short weekday + day-of-month. */
export function formatDayHeader(dateStr: string, locale: Locale): string {
  const wd = new Intl.DateTimeFormat(BCP47[locale], {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(utcNoon(dateStr))
    .replace(/\.$/, "");
  const day = parse(dateStr)[2];
  const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
  return `${cap} ${day}`;
}

/**
 * Toolbar date-range label. Always rendered in pt-PT (the clinic locale) and
 * with NO hyphen/en-dash separator: Intl's range dash is swapped for the
 * Portuguese connector "a" (e.g. "8 a 12 de junho de 2026").
 */
export function formatAnchorLabel(view: AgendaView, anchor: string): string {
  const fmt = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  if (view === "day") return fmt.format(utcNoon(anchor));
  const dates = viewDates(view, anchor);
  return fmt
    .formatRange(utcNoon(dates[0]), utcNoon(dates[dates.length - 1]))
    // Replace the locale range separator (en/em dash, etc.) with the PT
    // connector "a"; the brand forbids em/en dashes in copy.
    .replace(/\s*[‐‑‒–—―−-]\s*/u, " a ");
}

/**
 * "09:30" Lisbon wall-clock, 24-hour, locale-independent. Used for every time on
 * the agenda (gutter, blocks, conflict list) so the axis is uniformly 24h and
 * never resolves to a 12-hour locale.
 */
export function formatTimeOfDay(instant: Date): string {
  const { hour, minute } = lisbonParts(instant);
  return `${pad(hour)}:${pad(minute)}`;
}

/** "HH:mm" for a slot row index. */
export function slotLabel(minutesFromMidnight: number): string {
  return `${pad(Math.floor(minutesFromMidnight / 60))}:${pad(minutesFromMidnight % 60)}`;
}

/** Today's Lisbon calendar date. */
export function todayInLisbon(now: Date = new Date()): string {
  return lisbonParts(now).date;
}

/** Ordered list of slot start-minutes for the visible day window. */
export function daySlots(): number[] {
  const slots: number[] = [];
  for (let m = DAY_START_HOUR * 60; m < DAY_END_HOUR * 60; m += SLOT_MINUTES) {
    slots.push(m);
  }
  return slots;
}
