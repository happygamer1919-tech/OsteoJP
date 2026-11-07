// BLOQUEIOS DE REPETICAO SEMANAL - the pure half (no DB, no `server-only`).
//
// A weekly rule (public.therapist_weekly_blocks, pending migration
// NEXT-AFTER-0109_weekly_blocks.sql) says "this therapist, every <weekday>,
// from <start> to <end>", Lisbon wall clock, with no end date. Every staff
// reader of blocked time already speaks `BlockRow` (an absolute UTC span), so
// the rule is EXPANDED into one BlockRow per matching Lisbon date inside the
// range being read, and from there it is a block like any time_off row: it is
// subtracted from free time, drawn as the agenda's hatched band, and reported
// as an overridable `time_off` conflict.
//
// DST-SAFE BY CONSTRUCTION: each date's span is computed from that DATE and the
// wall-clock times through lisbonDateTimeToUtc, the one UTC<->Lisbon bridge.
// 08:00 is 08:00 in Lisbon in July (07:00Z) and in November (08:00Z), and on
// the two clock-change Sundays too. Never "08:00 plus N times 24 hours".
//
// The portal's SQL twin of this expansion is weeklyBlockOverlapExists in
// apps/api/lib/appointments/store.ts; both anchor on the Lisbon date and the
// Lisbon wall clock, so they cannot disagree about which instants a rule covers.

import { lisbonWeekday } from "./availability";
import type { BlockRow } from "./day-availability-core";
import { addDays, lisbonDateTimeToUtc, lisbonParts } from "./time";

/** One row of therapist_weekly_blocks, narrowed to what the rules need. */
export type WeeklyRule = {
  id: string;
  userId: string;
  /** 0 = Sunday .. 6 = Saturday (availability_templates' convention). */
  weekday: number;
  /** Lisbon wall clock, "HH:MM" or "HH:MM:SS". */
  startTime: string;
  endTime: string;
};

/**
 * The `reason` an expanded weekly block carries. Not a time_off_reason enum
 * value on purpose: it never reaches the time_off table, and a reader that maps
 * reasons to labels (conflict-lines.ts) names it as what it is.
 */
export const WEEKLY_BLOCK_REASON = "weekly";

/** Expanded blocks have synthetic ids, `weekly:<ruleId>:<yyyy-mm-dd>`. */
const WEEKLY_ID_PREFIX = "weekly:";

export function weeklyBlockId(ruleId: string, date: string): string {
  return `${WEEKLY_ID_PREFIX}${ruleId}:${date}`;
}

/**
 * True for an expanded weekly block. A screen that offers Editar or Eliminar on
 * a block (the Horarios inspector, the agenda band's deep link) must not send
 * such an id to the time_off actions: there is no time_off row behind it.
 */
export function isWeeklyBlockId(id: string): boolean {
  return id.startsWith(WEEKLY_ID_PREFIX);
}

/**
 * Where a click on a blocked band goes (SCHED-22). A time_off block opens in
 * /horarios on that block (the deep link SCHED-21 built); a weekly block has no
 * time_off row to open, so it goes to the Bloqueios page, where weekly rules
 * are listed and removed.
 */
export function blockEditHref(therapistId: string, blockId: string): string {
  if (isWeeklyBlockId(blockId)) return "/horarios/bloqueios";
  return `/horarios?t=${therapistId}&editBlock=${blockId}`;
}

/** "08:00:00" -> "08:00". */
export function hhmm(t: string): string {
  return t.slice(0, 5);
}

/**
 * Expand weekly rules into absolute spans overlapping [rangeStart, rangeEnd)
 * (half-open, like every block read). One span per rule per matching Lisbon
 * date. `note` is the label the caller wants on the band (the rule has no
 * free-text note of its own).
 */
export function expandWeeklyRules(
  rules: readonly WeeklyRule[],
  rangeStart: Date,
  rangeEnd: Date,
  note: string | null = null,
): BlockRow[] {
  if (rules.length === 0 || rangeEnd.getTime() <= rangeStart.getTime()) return [];
  const first = lisbonParts(rangeStart).date;
  // The last instant INSIDE the half-open range decides the last date, so a
  // range ending exactly at a Lisbon midnight does not pull in the next day.
  const last = lisbonParts(new Date(rangeEnd.getTime() - 1)).date;
  const out: BlockRow[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const weekday = lisbonWeekday(date);
    for (const r of rules) {
      if (r.weekday !== weekday) continue;
      const startsAt = lisbonDateTimeToUtc(date, hhmm(r.startTime));
      const endsAt = lisbonDateTimeToUtc(date, hhmm(r.endTime));
      if (endsAt.getTime() <= startsAt.getTime()) continue;
      if (startsAt.getTime() >= rangeEnd.getTime() || endsAt.getTime() <= rangeStart.getTime()) continue;
      out.push({ id: weeklyBlockId(r.id, date), startsAt, endsAt, reason: WEEKLY_BLOCK_REASON, note });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/* ------------------------------------------------------------------ */
/* The Bloqueios page: input, grouping and the two list formats        */
/* ------------------------------------------------------------------ */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WeeklyRuleInput = { userId: string; weekday: number; startTime: string; endTime: string };

/**
 * Validate the REPETICAO SEMANAL form. Returns the error key, or null. The
 * server action and the database (CHECKs) refuse the same things; this is the
 * first of the three, so the reader gets a sentence rather than a constraint.
 */
export function weeklyRuleInputError(i: WeeklyRuleInput): "therapist" | "weekday" | "times" | "order" | null {
  if (!i.userId) return "therapist";
  if (!Number.isInteger(i.weekday) || i.weekday < 0 || i.weekday > 6) return "weekday";
  if (!TIME_RE.test(i.startTime) || !TIME_RE.test(i.endTime)) return "times";
  if (i.endTime <= i.startTime) return "order";
  return null;
}

// The PONTUAL form has no validator here on purpose: it writes through
// createTimeOffBlock (mode "intervalo"), whose resolveWindow and requireNote
// are the one authority for a time_off row, at every door.

/** Fisiozero's weekday order and labels: 2as feiras first, Domingos last. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type WeeklyListRow = WeeklyRule & { therapistName: string };

/**
 * Group the rules under their weekday, Monday first, each group sorted by start
 * time and then by therapist name. Empty weekdays are left out, as in
 * Fisiozero's list (only weekdays that hold a rule get a heading).
 */
export function groupByWeekday(rows: readonly WeeklyListRow[]): { weekday: number; rows: WeeklyListRow[] }[] {
  return WEEKDAY_DISPLAY_ORDER.map((weekday) => ({
    weekday,
    rows: rows
      .filter((r) => r.weekday === weekday)
      .sort(
        (a, b) =>
          hhmm(a.startTime).localeCompare(hhmm(b.startTime)) ||
          hhmm(a.endTime).localeCompare(hhmm(b.endTime)) ||
          a.therapistName.localeCompare(b.therapistName, "pt"),
      ),
  })).filter((g) => g.rows.length > 0);
}

/** "[Terapeuta]: HH:MM -- HH:MM", Fisiozero's line, verbatim in shape. */
export function weeklyLine(r: { therapistName: string; startTime: string; endTime: string }): string {
  return `${r.therapistName}: ${hhmm(r.startTime)} -- ${hhmm(r.endTime)}`;
}

export type PontualListRow = {
  id: string;
  userId: string;
  therapistName: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
};

/** "YYYY-MM-DD (HH:MM:SS)" in Lisbon. */
function lisbonStamp(instant: Date): string {
  const p = lisbonParts(instant);
  const two = (n: number) => String(n).padStart(2, "0");
  const sec = two(new Date(instant).getUTCSeconds());
  return `${p.date} (${two(p.hour)}:${two(p.minute)}:${sec})`;
}

/**
 * "Nome: YYYY-MM-DD (HH:MM:SS) ate YYYY-MM-DD (HH:MM:SS) | Motivo", Fisiozero's
 * line. The two instants are the stored ones, read in Lisbon: a whole-day block
 * written as midnight to the next midnight reads exactly so, rather than being
 * rewritten into a different claim about when it ends. `until` is the
 * localised "ate"; the Motivo part is left out when the block has no note.
 */
export function pontualLine(r: PontualListRow, until: string): string {
  const base = `${r.therapistName}: ${lisbonStamp(r.startsAt)} ${until} ${lisbonStamp(r.endsAt)}`;
  const note = r.note?.trim();
  return note ? `${base} | ${note}` : base;
}

/** Newest first: the latest start on top, ties by the latest end, then name. */
export function sortNewestFirst<T extends { startsAt: Date; endsAt: Date; therapistName: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.startsAt.getTime() - a.startsAt.getTime() ||
      b.endsAt.getTime() - a.endsAt.getTime() ||
      a.therapistName.localeCompare(b.therapistName, "pt"),
  );
}

/** Lower case, accents folded, whitespace collapsed: "Férias" finds "ferias". */
export function foldForFilter(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The "Filtrar..." box: every whitespace-separated term must occur somewhere in
 * the line (name, dates, times or Motivo), accent- and case-insensitively. An
 * empty query keeps every line.
 */
export function matchesFilter(line: string, query: string): boolean {
  const terms = foldForFilter(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const hay = foldForFilter(line);
  return terms.every((t) => hay.includes(t));
}
