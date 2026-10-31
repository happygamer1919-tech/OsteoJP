import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  locationSaturdayColumnPresent,
  readLocationSaturdayClosesAt,
  resetLocationSaturdayColumnCache,
} from "../src/location-saturday";

/**
 * HOR-01 - the Saturday closing time is read only while its column exists, and
 * a column that DISAPPEARS under a running process (a rolled-back migration
 * after "present" was cached) costs one empty answer, not a broken booking.
 *
 * The executor is a recorder: it answers the catalogue question with what the
 * case says, and the column read with rows or with a 42703 wrapped the way an
 * ORM wraps a driver error.
 */
const dialect = new PgDialect();
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";

function executor(opts: { catalogue: boolean; read: "rows" | "42703" | "other" }) {
  const seen: string[] = [];
  let savepoints = 0;
  const run = async (q: SQL) => {
    const text = dialect.sqlToQuery(q).sql;
    if (text.includes("information_schema.columns")) {
      seen.push("catalogue");
      return [{ present: opts.catalogue }];
    }
    seen.push("read");
    if (opts.read === "42703") {
      throw Object.assign(new Error("Failed query"), {
        cause: Object.assign(new Error('column "saturday_closes_at" does not exist'), { code: "42703" }),
      });
    }
    if (opts.read === "other") throw Object.assign(new Error("boom"), { code: "57014" });
    return [{ id: A, saturday_closes_at: "13:00:00" }];
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

beforeEach(() => resetLocationSaturdayColumnCache());

describe("readLocationSaturdayClosesAt", () => {
  it("column absent: every clinic reads null, and the column is never named", async () => {
    const x = executor({ catalogue: false, read: "rows" });
    expect(await readLocationSaturdayClosesAt(x.db as never, [A, B])).toEqual(
      new Map([
        [A, null],
        [B, null],
      ]),
    );
    expect(x.seen).toEqual(["catalogue"]);
  });

  it("column present: the value is read, inside a savepoint", async () => {
    const x = executor({ catalogue: true, read: "rows" });
    expect(await readLocationSaturdayClosesAt(x.db as never, [A, B])).toEqual(
      new Map([
        [A, "13:00:00"],
        [B, null],
      ]),
    );
    expect(x.savepoints()).toBe(1);
  });

  it("42703 after 'present' was cached: null for every clinic, the cache is cleared, no throw", async () => {
    const x = executor({ catalogue: true, read: "42703" });
    expect(await readLocationSaturdayClosesAt(x.db as never, [A])).toEqual(new Map([[A, null]]));
    // Cleared AND marked absent: the next ask within the minute does not touch
    // the database at all, so a broken column is not re-queried on every booking.
    const before = x.seen.length;
    expect(await locationSaturdayColumnPresent(x.db as never)).toBe(false);
    expect(x.seen.length).toBe(before);
  });

  it("any OTHER error is not swallowed", async () => {
    const x = executor({ catalogue: true, read: "other" });
    await expect(readLocationSaturdayClosesAt(x.db as never, [A])).rejects.toThrow("boom");
  });
});
