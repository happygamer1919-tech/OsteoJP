// Batch scheduling — PURE core (no DB, no server-only, no auth). Consumes the
// `free` intervals produced by getTherapistAvailability (#396) and classifies
// candidate slots into bookable vs busy, deriving a nearest free alternative for
// each busy slot. Kept separate from batch.ts so it unit-tests without the
// server/Next chain. This module NEVER reimplements working-minus-booked math —
// it only reads the already-computed `free` set.

import { lisbonParts } from "./time";
import type { TimeInterval } from "./intervals";

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
  durationMin: number,
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
