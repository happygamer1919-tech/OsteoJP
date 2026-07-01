// Pure interval-set math for the availability query.
//
// No DB, no timezone logic, no `server-only` here so the rules stay
// unit-testable in isolation (mirrors overlap.ts / availability.ts). Callers
// pass absolute instants (Date); this module only does set arithmetic on
// half-open intervals [start, end): the end instant is exclusive, so a
// 09:00-10:00 booking sits back-to-back with a 10:00-11:00 booking without
// overlapping. This matches overlap.ts and how the agenda renders.
//
// The availability query is: working windows MINUS booked appointments = free.
// `subtractIntervals` is that subtraction; `mergeIntervals` normalises either
// side first (a therapist can have split shifts, and bookings can touch).

export type TimeInterval = { start: Date; end: Date };

/**
 * Merge overlapping and adjacent intervals into a minimal, sorted set.
 *
 * Adjacent means touching at an instant (prev.end === next.start): under the
 * half-open convention those describe one continuous span, so they collapse
 * into a single interval. Zero-length and inverted intervals (end <= start)
 * carry no time and are dropped. Input is not mutated.
 */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const valid = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (valid.length === 0) return [];

  const out: TimeInterval[] = [{ start: valid[0].start, end: valid[0].end }];
  for (let i = 1; i < valid.length; i++) {
    const last = out[out.length - 1];
    const cur = valid[i];
    // <= (not <) so adjacent intervals merge, per the half-open convention.
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/**
 * Subtract `cuts` from `base`, returning the parts of `base` left uncovered.
 *
 * Both sides are normalised with mergeIntervals first, so the result is a
 * minimal, sorted, non-overlapping set. Cuts outside `base` have no effect; a
 * cut fully covering a base interval removes it; a cut inside one splits it in
 * two. Zero-length remainders are dropped. Neither input is mutated.
 *
 * This is the free-time computation: base = working windows, cuts = booked
 * appointments, result = free intervals.
 */
export function subtractIntervals(
  base: TimeInterval[],
  cuts: TimeInterval[],
): TimeInterval[] {
  const merged = mergeIntervals(base);
  const holes = mergeIntervals(cuts);
  if (holes.length === 0) return merged;

  const out: TimeInterval[] = [];
  for (const span of merged) {
    // Cursor walks left-to-right across `span`, emitting the gaps between the
    // cuts that intersect it. `holes` is sorted, so a single pass suffices.
    let cursor = span.start.getTime();
    const spanEnd = span.end.getTime();
    for (const hole of holes) {
      const hs = hole.start.getTime();
      const he = hole.end.getTime();
      if (he <= cursor) continue; // hole ends before the remaining span
      if (hs >= spanEnd) break; // hole (and all later ones) start after span
      if (hs > cursor) out.push({ start: new Date(cursor), end: new Date(hs) });
      if (he > cursor) cursor = he; // advance past this cut
      if (cursor >= spanEnd) break;
    }
    if (cursor < spanEnd) out.push({ start: new Date(cursor), end: new Date(spanEnd) });
  }
  return out;
}
