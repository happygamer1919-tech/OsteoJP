// Batch scheduling — PURE core (no DB, no server-only, no auth). Consumes the
// `free` intervals produced by getTherapistAvailability (#396) and classifies
// candidate slots into bookable vs busy, deriving a nearest free alternative for
// each busy slot. Kept separate from batch.ts so it unit-tests without the
// server/Next chain. This module NEVER reimplements working-minus-booked math —
// it only reads the already-computed `free` set.

import { lisbonParts } from "./time";
import type { TimeInterval } from "./intervals";
import { expandRecurrence, type RecurrenceSpec } from "./recurrence";

export type BatchAlternative = { startsAt: string; date: string; hhmm: string };
export type BatchFailure = {
  startsAt: string;
  date: string;
  hhmm: string;
  reason: "busy";
  /** Nearest free slot fitting the duration, from the same availability result. */
  nearestAlternative: BatchAlternative | null;
};

/** A resolved candidate slot, annotated with its Lisbon date + hh:mm. */
export type BatchSlot = { startsAt: Date; endsAt: Date; date: string; hhmm: string };

/**
 * The two ways to describe a batch's candidate slots (W2-09):
 *  - recurrence: a rule expanded to N same-time occurrences; or
 *  - explicit:   a concrete per-slot datetime list (each slot its own time and
 *    duration — the Rodica case: every Thursday, a different time per date).
 * Both converge on one BatchSlot[] so the engine runs one booking loop.
 */
/** One concrete slot in the explicit per-slot list (ISO UTC instants). */
export type BatchExplicitSlot = { startsAt: string; endsAt: string };

export type BatchSlotSource =
  | { firstDate: string; hhmm: string; durationMin: number; recurrence: RecurrenceSpec }
  | { slots: BatchExplicitSlot[] };

/** Whether a slot source is the explicit per-slot list (vs a recurrence rule). */
export function isExplicitSlots(source: BatchSlotSource): source is { slots: BatchExplicitSlot[] } {
  return "slots" in source;
}

/** Resolve a slot source into concrete, annotated BatchSlot[]. Pure. */
export function resolveBatchSlots(source: BatchSlotSource): BatchSlot[] {
  if (isExplicitSlots(source)) {
    return source.slots.map((s) => {
      const startsAt = new Date(s.startsAt);
      const endsAt = new Date(s.endsAt);
      return { startsAt, endsAt, ...describeInstant(startsAt) };
    });
  }
  return expandRecurrence(source.firstDate, source.hhmm, source.durationMin, source.recurrence).map(
    (o) => ({ startsAt: o.startsAt, endsAt: o.endsAt, ...describeInstant(o.startsAt) }),
  );
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Lisbon date + "HH:mm" for a UTC instant. */
export function describeInstant(instant: Date): { date: string; hhmm: string } {
  const p = lisbonParts(instant);
  return { date: p.date, hhmm: `${pad(p.hour)}:${pad(p.minute)}` };
}

/**
 * Nearest free slot fitting `durationMin`, closest in time to `want`, across the
 * whole free set. Clamps into each candidate window so the returned start is
 * always bookable. Null when no free window fits the duration.
 */
export function nearestFreeAlternative(
  free: TimeInterval[],
  want: Date,
  durationMin: number,
): BatchAlternative | null {
  const durMs = durationMin * 60_000;
  const wantMs = want.getTime();
  let best: { at: number; dist: number } | null = null;
  for (const f of free) {
    if (f.end.getTime() - f.start.getTime() < durMs) continue; // window too short
    const latest = f.end.getTime() - durMs;
    const cand = Math.min(Math.max(wantMs, f.start.getTime()), latest);
    const dist = Math.abs(cand - wantMs);
    if (!best || dist < best.dist) best = { at: cand, dist };
  }
  if (!best) return null;
  const at = new Date(best.at);
  return { startsAt: at.toISOString(), ...describeInstant(at) };
}

/**
 * PURE classification: partition candidate slots into bookable (fits inside a
 * free interval on its own Lisbon day) and failures (busy, with a nearest
 * alternative from the full free set).
 */
export function classifyBatchSlots(
  slots: BatchSlot[],
  freeByDate: Map<string, TimeInterval[]>,
): { toBook: BatchSlot[]; failures: BatchFailure[] } {
  const allFree: TimeInterval[] = Array.from(freeByDate.values()).flat();
  const toBook: BatchSlot[] = [];
  const failures: BatchFailure[] = [];
  for (const s of slots) {
    const dayFree = freeByDate.get(s.date) ?? [];
    const fits = dayFree.some(
      (f) => f.start.getTime() <= s.startsAt.getTime() && s.endsAt.getTime() <= f.end.getTime(),
    );
    if (fits) {
      toBook.push(s);
    } else {
      // Per-slot duration (explicit slots may each differ; recurrence slots are
      // uniform). Drives the nearest-alternative window length for THIS slot.
      const durationMin = (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000;
      failures.push({
        startsAt: s.startsAt.toISOString(),
        date: s.date,
        hhmm: s.hhmm,
        reason: "busy",
        nearestAlternative: nearestFreeAlternative(allFree, s.startsAt, durationMin),
      });
    }
  }
  return { toBook, failures };
}
