// DATED CLINIC CLOSURES (Tier C 0114) - PURE core (no DB, no server-only).
//
// A closure is "this clinic is shut on every Lisbon date from `startsOn` to
// `endsOn` inclusive, the whole day, or from `closedFrom` to `closedTo` on EACH
// of those dates". This file is the arithmetic every staff reader uses: the
// refusal (checkClinicClosure), the availability read (buildDay) and the agenda
// band. The patient portal's twin is `closedDayOverlapExists` in
// apps/api/lib/appointments/store.ts, which does the same arithmetic in SQL, in
// Europe/Lisbon, inside Postgres; the two anchor on the same Lisbon dates and
// the same wall clock, and the DB-gated parity test holds them to one table of
// cases.
//
// A CLOSURE IS NOT A BLOCK. A time_off row is one person, at every clinic, and
// "Guardar mesmo assim" overrides it. A closure is the BUILDING, it is never
// overridden (owner, C1, 2026-11-05), and its refusal names the clinic.

import { addDays, lisbonDateTimeToUtc, lisbonMidnightUtc, lisbonParts } from "./time";
import type { TimeInterval } from "./intervals";

/** The four kinds the table's CHECK allows, in the form's order. */
export const CLOSED_DAY_KINDS = ["feriado_nacional", "feriado_municipal", "encerramento", "outro"] as const;
export type ClosedDayKind = (typeof CLOSED_DAY_KINDS)[number];

export function isClosedDayKind(v: unknown): v is ClosedDayKind {
  return typeof v === "string" && (CLOSED_DAY_KINDS as readonly string[]).includes(v);
}

/** The longest range one closure may span: ends_on - starts_on <= 92 (the table's typo guard). */
export const MAX_RANGE_DAYS = 92;
/** The table's label limit. */
export const MAX_LABEL_CHARS = 80;

/** One closure as every reader holds it. Dates "yyyy-mm-dd"; times "HH:MM" or "HH:MM:SS". */
export type ClosedDayRule = {
  id: string;
  startsOn: string;
  endsOn: string;
  /** Both null = the whole day. */
  closedFrom: string | null;
  closedTo: string | null;
  kind: string;
  label: string | null;
};

/**
 * The refusal payload a `clinic_closed` result carries. `from`/`to` are the
 * lunch closure's hours, or a dated closure's partial hours ("" for a whole
 * day). `closedDay` is present only when a DATED closure refused, so the
 * sentence can say "closed on this day" instead of "closed every day".
 */
export type ClinicClosurePayload = {
  locationName: string;
  from: string;
  to: string;
  closedDay?: { kind: string; label: string | null; wholeDay: boolean };
};

/** Does this closure cover the Lisbon calendar date? (both ends inclusive) */
export function coversDate(rule: Pick<ClosedDayRule, "startsOn" | "endsOn">, date: string): boolean {
  return rule.startsOn <= date && date <= rule.endsOn;
}

/** True for a whole-day closure. A half-set pair never reaches here (the table refuses it), and is read as whole day rather than guessed. */
export function isWholeDay(rule: Pick<ClosedDayRule, "closedFrom" | "closedTo">): boolean {
  return !rule.closedFrom || !rule.closedTo;
}

/**
 * The closed span of one closure on ONE Lisbon date, as UTC instants, or null
 * when the closure does not cover that date.
 *
 * A WHOLE DAY IS LISBON MIDNIGHT TO THE NEXT LISBON MIDNIGHT, so it is 23 hours
 * on the last Sunday of March and 25 on the last Sunday of October, exactly as
 * the portal's `(day::date)::timestamp at time zone 'Europe/Lisbon'` reads it.
 * A partial day is the wall-clock pair on that date, converted at the target
 * instant (`lisbonDateTimeToUtc` takes the offset where it lands).
 */
export function closedIntervalOn(rule: ClosedDayRule, date: string): TimeInterval | null {
  if (!coversDate(rule, date)) return null;
  if (isWholeDay(rule)) {
    return { start: lisbonMidnightUtc(date), end: lisbonMidnightUtc(addDays(date, 1)) };
  }
  return {
    start: lisbonDateTimeToUtc(date, rule.closedFrom!.slice(0, 5)),
    end: lisbonDateTimeToUtc(date, rule.closedTo!.slice(0, 5)),
  };
}

/** Every closed span on one Lisbon date, from any number of closures. */
export function closedDayIntervals(rules: readonly ClosedDayRule[], date: string): TimeInterval[] {
  const out: TimeInterval[] = [];
  for (const r of rules) {
    const i = closedIntervalOn(r, date);
    if (i) out.push(i);
  }
  return out;
}

/** The Lisbon dates a window touches, from its start's date to its end's date. */
export function lisbonDatesTouched(startsAt: Date, endsAt: Date): string[] {
  const first = lisbonParts(startsAt).date;
  const last = lisbonParts(endsAt).date;
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The first closure a booking window runs through, or null.
 *
 * ANY OVERLAP COUNTS, half-open, as the lunch closure's `overlapsClosure` and
 * the portal's fragment: a visit ending exactly at `closedFrom` is allowed,
 * one ending a minute later is refused. EVERY Lisbon date the window touches is
 * read, not only the start's: a visit running past midnight into a closed day
 * is refused (the portal reads every date in the same way).
 */
export function closedDayOverlap(
  rules: readonly ClosedDayRule[],
  startsAt: Date,
  endsAt: Date,
): ClosedDayRule | null {
  for (const date of lisbonDatesTouched(startsAt, endsAt)) {
    for (const r of rules) {
      const i = closedIntervalOn(r, date);
      if (i && i.start < endsAt && startsAt < i.end) return r;
    }
  }
  return null;
}

/** The refusal payload for a dated closure. */
export function closedDayPayload(locationName: string, rule: ClosedDayRule): ClinicClosurePayload {
  const wholeDay = isWholeDay(rule);
  return {
    locationName,
    from: wholeDay ? "" : rule.closedFrom!.slice(0, 5),
    to: wholeDay ? "" : rule.closedTo!.slice(0, 5),
    closedDay: { kind: rule.kind, label: rule.label, wholeDay },
  };
}

/**
 * The agenda band for one closure on one date, in minutes from Lisbon midnight
 * (0 to 1440 for a whole day), or null when it does not cover the date.
 */
export function closedBandOn(
  rule: ClosedDayRule,
  date: string,
): { startMin: number; endMin: number } | null {
  if (!coversDate(rule, date)) return null;
  if (isWholeDay(rule)) return { startMin: 0, endMin: 24 * 60 };
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  return { startMin: toMin(rule.closedFrom!), endMin: toMin(rule.closedTo!) };
}

/** One band per closure per displayed date, as the agenda draws it. */
export type ClosedDayBand = { startMin: number; endMin: number; kind: string; label: string | null };

/** The agenda's dated-closure bands over the displayed dates, keyed by Lisbon date. */
export function closedDayBandsByDate(
  rules: readonly ClosedDayRule[],
  dates: readonly string[],
): Record<string, ClosedDayBand[]> {
  const out: Record<string, ClosedDayBand[]> = {};
  for (const date of dates) {
    for (const r of rules) {
      const band = closedBandOn(r, date);
      if (!band) continue;
      (out[date] ??= []).push({ ...band, kind: r.kind, label: r.label });
    }
  }
  return out;
}

/**
 * One closure band as the agenda renderers hold it (the shape of the lunch
 * closure's `closure` prop): minutes from Lisbon midnight, and the text the
 * band shows (the clinic, and the closure's reason for a dated one).
 */
export type AgendaClosure = {
  startMin: number;
  endMin: number;
  locationName: string;
  /** A dated closure's reason (its label, or its kind's name); absent for the lunch closure. */
  reason?: string | null;
};
/** The dated closures of the selected clinic, per displayed Lisbon date. */
export type AgendaClosedDays = Readonly<Record<string, readonly AgendaClosure[]>>;

/**
 * Every closure band to draw on ONE date: the daily lunch closure (the same
 * on every date) and that date's dated closures. ONE function for the desktop
 * grid, the phone week and the week list, so the three cannot disagree about
 * which dates the clinic is shut.
 */
export function agendaClosuresOn(
  date: string,
  closure: AgendaClosure | null | undefined,
  closedDays: AgendaClosedDays | undefined,
): AgendaClosure[] {
  return [...(closure ? [closure] : []), ...(closedDays?.[date] ?? [])];
}

/* ====================================================================== */
/* THE FORM'S INPUT                                                       */
/* ====================================================================== */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ClosedDayInput = {
  /** One clinic id, or "all": one closure per clinic the actor may manage. */
  locationId: string;
  startsOn: string;
  endsOn: string;
  /** Both "" = the whole day. */
  closedFrom: string;
  closedTo: string;
  kind: string;
  label: string;
};

/** Days between two "yyyy-mm-dd" dates (b - a), on the calendar, DST-free. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000);
}

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

/**
 * Why a form input is refused, or null. The same rules as the table's CHECKs,
 * checked first so the page can name the box, never a raw database error.
 * `today` is the Lisbon date: a closure must start today or later (a past
 * closure would be history staff could not delete again).
 */
export function closedDayInputError(input: ClosedDayInput, today: string): string | null {
  if (!input.locationId) return "location";
  if (!isRealDate(input.startsOn) || !isRealDate(input.endsOn)) return "dates";
  if (input.startsOn > input.endsOn) return "range_order";
  if (daysBetween(input.startsOn, input.endsOn) > MAX_RANGE_DAYS) return "range_length";
  if (input.startsOn < today) return "past";
  const from = input.closedFrom.trim();
  const to = input.closedTo.trim();
  if ((from === "") !== (to === "")) return "hours_pair";
  if (from !== "") {
    if (!TIME_RE.test(from) || !TIME_RE.test(to)) return "hours";
    if (from >= to) return "hours_order";
  }
  if (!isClosedDayKind(input.kind)) return "kind";
  const label = input.label.trim();
  if (label.length > MAX_LABEL_CHARS) return "label";
  return null;
}
