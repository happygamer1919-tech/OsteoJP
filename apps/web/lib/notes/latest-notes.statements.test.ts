import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readLatestAppointmentNotes, readLatestPatientNotes } from "./latest-notes";

/**
 * ONE STATEMENT PER READ, WHATEVER THE ROW COUNT.
 *
 * ==========================================================================
 * WHY A COUNT AND NOT A TIMING - THE SAME ARGUMENT PERF-06 MAKES
 * ==========================================================================
 * The thing that regresses here is not a duration, it is a SHAPE: somebody adds
 * a per-row lookup because that is the obvious way to write one, and each list
 * quietly pays fifty round trips instead of one. On a local database that costs
 * a fraction of a millisecond and no timing test notices. On production every
 * one of them crosses the Supabase transaction pooler.
 *
 * The COUNT is exact, it needs no database, and it is the number the dispatch
 * asked about: "if the preview costs a query per row, say so with numbers".
 *
 * ==========================================================================
 * THE ASSERTION IS "ONE", AND IT IS ALSO "ONE FOR FIFTY"
 * ==========================================================================
 * A test that only ran one id would pass on a per-row implementation. Each case
 * below runs a SINGLE id and then FIFTY, and asserts the same count - which is
 * the only pair that distinguishes "one statement" from "one statement each".
 */

/** A drizzle-shaped stub that counts `select()` calls and yields no rows. The
 *  queries' CONTENT is not what this file is about; how many there are is. */
function countingTx() {
  let selects = 0;
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"]) {
    chain[m] = () => chain;
  }
  // Awaiting the builder resolves to the rows, exactly as drizzle's does.
  (chain as { then: unknown }).then = (resolve: (v: unknown[]) => unknown) => resolve([]);
  return {
    tx: {
      select: () => {
        selects += 1;
        return chain;
      },
    },
    count: () => selects,
  };
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);

describe("the note previews are one statement per render, never one per row", () => {
  it("readLatestPatientNotes: 1 statement for 1 patient AND for 50", async () => {
    for (const n of [1, 50]) {
      const { tx, count } = countingTx();
      await readLatestPatientNotes(tx as never, ids(n));
      expect(count(), `${n} patients must still be one statement`).toBe(1);
    }
  });

  it("readLatestAppointmentNotes: 1 statement for 1 marcação AND for 50", async () => {
    for (const n of [1, 50]) {
      const { tx, count } = countingTx();
      await readLatestAppointmentNotes(
        tx as never,
        ids(n).map((id, i) => ({ id, patientId: ids(n)[i]! })),
      );
      expect(count(), `${n} marcações must still be one statement`).toBe(1);
    }
  });

  it("NEITHER READ TOUCHES THE DATABASE FOR AN EMPTY LIST", async () => {
    // A page with no rows must not open a statement to ask about nothing. It is
    // also what keeps the `inArray` below from being handed an empty array,
    // which renders as `in ()` and is a syntax error rather than "no rows".
    const a = countingTx();
    await readLatestPatientNotes(a.tx as never, []);
    expect(a.count()).toBe(0);

    const b = countingTx();
    await readLatestAppointmentNotes(b.tx as never, []);
    expect(b.count()).toBe(0);
  });
});
