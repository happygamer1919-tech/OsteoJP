import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  locationSaturdayHoursPresent,
  readLocationSaturdayHours,
  resetLocationSaturdayHoursCache,
} from "../src/location-saturday";

/**
 * HOR-01 - a clinic's Saturday hours are read only while BOTH their columns
 * exist (HOR-02 adds `saturday_opens_at` and `saturday_closes_at` together),
 * a clinic has Saturday hours only when BOTH ends are set, and a column that
 * DISAPPEARS under a running process (a rolled-back migration after "present"
 * was cached) costs one empty answer, not a broken booking.
 *
 * The executor is a recorder: it answers the catalogue question with the
 * columns the case says exist, and the column read with the case's rows or with
 * a 42703 wrapped the way an ORM wraps a driver error.
 */
const dialect = new PgDialect();
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const C = "00000000-0000-4000-8000-0000000000c3";

type Row = { id: string; saturday_opens_at: string | null; saturday_closes_at: string | null };
const BOTH = ["saturday_opens_at", "saturday_closes_at"];
const DEFAULT_ROWS: Row[] = [{ id: A, saturday_opens_at: "09:00:00", saturday_closes_at: "13:00:00" }];

function executor(opts: { columns: string[]; read: "rows" | "42703" | "other"; rows?: Row[] }) {
  const seen: string[] = [];
  let savepoints = 0;
  const run = async (q: SQL) => {
    const text = dialect.sqlToQuery(q).sql;
    if (text.includes("information_schema.columns")) {
      seen.push("catalogue");
      return opts.columns.map((column_name) => ({ column_name }));
    }
    seen.push("read");
    if (opts.read === "42703") {
      throw Object.assign(new Error("Failed query"), {
        cause: Object.assign(new Error('column "saturday_opens_at" does not exist'), { code: "42703" }),
      });
    }
    if (opts.read === "other") throw Object.assign(new Error("boom"), { code: "57014" });
    return opts.rows ?? DEFAULT_ROWS;
  };
  const db = {
    execute: run,
    transaction: async <T,>(fn: (tx: { execute: typeof run }) => Promise<T>) => {
      savepoints++;
      return fn({ execute: run });
    },
  };
  return { db, seen, savepoints: () => savepoints };
}

beforeEach(() => resetLocationSaturdayHoursCache());

describe("locationSaturdayHoursPresent", () => {
  it("both columns: present", async () => {
    expect(await locationSaturdayHoursPresent(executor({ columns: BOTH, read: "rows" }).db as never)).toBe(true);
  });

  it.each([
    ["only the closing column", ["saturday_closes_at"]],
    ["only the opening column", ["saturday_opens_at"]],
    ["neither", []],
  ])("%s: absent", async (_why, columns) => {
    expect(await locationSaturdayHoursPresent(executor({ columns, read: "rows" }).db as never)).toBe(false);
  });
});

describe("readLocationSaturdayHours", () => {
  it("columns absent: every clinic reads null, and the columns are never named", async () => {
    const x = executor({ columns: [], read: "rows" });
    expect(await readLocationSaturdayHours(x.db as never, [A, B])).toEqual(
      new Map([
        [A, null],
        [B, null],
      ]),
    );
    expect(x.seen).toEqual(["catalogue"]);
  });

  it("only the closing column exists: no Saturday anywhere, and no read is attempted", async () => {
    const x = executor({ columns: ["saturday_closes_at"], read: "rows" });
    expect(await readLocationSaturdayHours(x.db as never, [A])).toEqual(new Map([[A, null]]));
    expect(x.seen).toEqual(["catalogue"]);
  });

  it("both present: both ends are read, inside a savepoint", async () => {
    const x = executor({ columns: BOTH, read: "rows" });
    expect(await readLocationSaturdayHours(x.db as never, [A, B])).toEqual(
      new Map([
        [A, { opensAt: "09:00:00", closesAt: "13:00:00" }],
        [B, null],
      ]),
    );
    expect(x.savepoints()).toBe(1);
  });

  it("both present, either end NULL: that clinic has no Saturday, never a half-day", async () => {
    const x = executor({
      columns: BOTH,
      read: "rows",
      rows: [
        { id: A, saturday_opens_at: null, saturday_closes_at: "13:00:00" },
        { id: B, saturday_opens_at: "09:00:00", saturday_closes_at: null },
        { id: C, saturday_opens_at: null, saturday_closes_at: null },
      ],
    });
    expect(await readLocationSaturdayHours(x.db as never, [A, B, C])).toEqual(
      new Map([
        [A, null],
        [B, null],
        [C, null],
      ]),
    );
  });

  it("42703 after 'present' was cached: null for every clinic, the cache is cleared, no throw", async () => {
    const x = executor({ columns: BOTH, read: "42703" });
    expect(await readLocationSaturdayHours(x.db as never, [A])).toEqual(new Map([[A, null]]));
    // Cleared AND marked absent: the next ask within the minute does not touch
    // the database at all, so a broken column is not re-queried on every booking.
    const before = x.seen.length;
    expect(await locationSaturdayHoursPresent(x.db as never)).toBe(false);
    expect(x.seen.length).toBe(before);
  });

  it("any OTHER error is not swallowed", async () => {
    const x = executor({ columns: BOTH, read: "other" });
    await expect(readLocationSaturdayHours(x.db as never, [A])).rejects.toThrow("boom");
  });
});
