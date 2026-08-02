import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// W3 / Y2 — the patient slot sweep must never OFFER a slot in the past.
//
// Why this file exists. Migration 0052 makes a no_show release its slot. The
// owner's question was whether a past no_show, now freed, becomes bookable. The
// behavioural half is proven in booking.test.ts: bookAppointment and
// rescheduleAppointment both refuse a past start even when the store reports the
// window conflict-free, which is exactly the post-0052 condition.
//
// This file pins the OTHER half - that a past slot is never offered in the first
// place - which lives in raw SQL inside store.ts and is therefore invisible to
// the unit tests. It is a static guard, deliberately: exercising the sweep needs
// a live Postgres, and the failure mode we are guarding against is somebody
// deleting a line, which a text assertion catches exactly as well as a live
// query would.
//
// "Past dates are handled elsewhere" is precisely the assumption this workstream
// disproved four times. This makes "elsewhere" a test.

const STORE = join(__dirname, "store.ts");

/** The sweep's SQL with comments stripped, so a doc line cannot satisfy a check. */
function sweepSql(): string {
  const src = readFileSync(STORE, "utf-8");
  const start = src.indexOf("async listOpenSlots");
  expect(start, "listOpenSlots not found in store.ts").toBeGreaterThan(-1);

  // Bounded to the next store method so an unrelated query cannot satisfy these.
  const rest = src.slice(start);
  const end = rest.indexOf("\n  async ", 1);
  const body = end === -1 ? rest : rest.slice(0, end);

  return body
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("W3/Y2: the patient slot sweep is floored at now", () => {
  const sql = sweepSql();

  it("guards against a vacuous pass: the sweep body was actually extracted", () => {
    // If the slicing broke, every assertion below would test an empty string.
    expect(sql.length).toBeGreaterThan(200);
    expect(sql).toContain("generate_series");
  });

  it("carries a hard floor on the candidate slot start", () => {
    // `where s.starts_at > <now>` - the line that makes a past slot
    // undiscoverable regardless of what freed it.
    expect(
      /where\s+s\.starts_at\s*>\s*\$\{nowIso\}/.test(sql),
      "The `s.starts_at > nowIso` floor is missing from listOpenSlots. Without " +
        "it, a slot freed in the past (e.g. by a no_show under migration 0052) " +
        "would be OFFERED to patients. Restore it, or replace it with an " +
        "equivalent floor and update this test deliberately.",
    ).toBe(true);
  });

  it("generates its day grid FORWARD from today, never from an earlier date", () => {
    // Second, independent floor: even if the row filter were removed, the grid
    // itself starts at now::date. Both must be present.
    expect(
      /generate_series\(\s*\n?\s*\(\$\{nowIso\}::timestamptz at time zone/.test(sql),
      "The day grid no longer starts at now::date in listOpenSlots.",
    ).toBe(true);
  });

  it("bounds the grid by the horizon rather than running unbounded", () => {
    expect(sql).toContain("horizonDays");
  });
});
