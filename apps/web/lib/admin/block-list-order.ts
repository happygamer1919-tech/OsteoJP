/**
 * SCHED-22 - WHICH BLOCKS A PERSON IS ACTUALLY LOOKING FOR.
 *
 * ==========================================================================
 * THE MEASUREMENT THIS EXISTS FOR
 * ==========================================================================
 * On production, on 2026-09-10: one therapist held THIRTY-FIVE time_off rows,
 * NINETEEN of them already in the past. `listTimeOffBlocksForRoster` orders by
 * starts_at ASCENDING and filters nothing, so the block causing the outage sat
 * below nineteen dead entries inside a scrolling dialog whose create form
 * dominates the panel.
 *
 * The owner reported that there was NO UI ANYWHERE to remove a block. There was.
 * It was under nineteen rows about last month.
 *
 * ==========================================================================
 * WHY THIS IS A PURE FUNCTION AND NOT AN `ORDER BY` CHANGE
 * ==========================================================================
 * "Expired" is a fact about NOW, and the query runs on the server while the
 * dialog is read some seconds later. Sorting in SQL would push a clock reading
 * into the database and leave the two halves of the answer - the order and the
 * collapse - in different layers, free to drift about where the boundary is.
 * One function, one boundary, one clock, and a test can hand it any clock it
 * likes.
 *
 * A BLOCK IS EXPIRED WHEN IT HAS ENDED, not when it started. A block running
 * from yesterday to next Friday is the most urgent thing in the list; sorting by
 * start would bury it among last month's, and collapsing by start would hide it
 * outright. `endDate` is inclusive (see viewFor in time-off.ts), so the
 * comparison is against the END of that day.
 */

/** The fields this ordering needs. Structural, so both the view type and a test
 *  fixture satisfy it without importing each other. */
export type OrderableBlock = {
  id: string;
  /** Lisbon "yyyy-mm-dd". */
  startDate: string;
  /** Lisbon "yyyy-mm-dd", INCLUSIVE. */
  endDate: string;
};

export type BlockPartition<T> = {
  /** Ends today or later. Soonest first: the next thing to happen leads. */
  upcoming: T[];
  /** Ended before today. Most recent first: if you are looking back, you are
   *  almost always looking at the thing that just finished. */
  expired: T[];
};

/**
 * Split a therapist's blocks into what is still to come and what is done.
 *
 * `today` is a Lisbon calendar date, passed in rather than read here: a function
 * that reads the clock cannot be tested at a boundary, and every boundary in
 * this file is a date boundary.
 */
export function partitionBlocks<T extends OrderableBlock>(
  blocks: readonly T[],
  today: string,
): BlockPartition<T> {
  const upcoming: T[] = [];
  const expired: T[] = [];
  for (const b of blocks) {
    // Inclusive end: a block whose last day IS today has not expired.
    (b.endDate >= today ? upcoming : expired).push(b);
  }
  upcoming.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  expired.sort((a, b) => (a.startDate > b.startDate ? -1 : a.startDate < b.startDate ? 1 : 0));
  return { upcoming, expired };
}
