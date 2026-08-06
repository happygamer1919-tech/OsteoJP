/**
 * THE REFUSAL TEST Decision B will not ship without.
 *
 * WAVE-13.md, LOOP 4 step 4: delete the allowlist, replace both call sites with
 * `patient_bookable`, "**and** add the `internalOnly` check at
 * `getBookableService`, **and** add the refusal test. Not staged, not
 * follow-up. One PR." And §1.4: "Deleting the allowlist is what removes the
 * mask over an existing exposure. The two must land together or neither lands."
 *
 * THE EXPOSURE, PRECISELY. The catalog list has filtered `internal_only` out of
 * the patient wizard since W12-26, so a patient never SAW "Diversos". But
 * `getBookableService` — the function BOTH patient write paths resolve a service
 * id through — did not select the column and did not check it. A patient never
 * needed to see the id to send it. What actually stopped them was the name
 * allowlist, by accident: "Diversos" was not one of the four names. Delete the
 * allowlist without adding this check and the accident goes with it.
 *
 * THREE LAYERS, because each catches something the others cannot:
 *   1. THE PREDICATE, exhaustively, with the negative arms that prove every
 *      clause is load-bearing. Removing any one of the three changes an answer
 *      here — which is the "must fail if the check is removed" demonstration,
 *      made mechanical instead of manual.
 *   2. THE COLUMNS ARE ACTUALLY SELECTED. A unit test cannot catch the classic
 *      version of this bug: forget the column in the `select`, and `row.internalOnly`
 *      is `undefined`, which is falsy, so the check passes for every row and the
 *      test suite stays green. This asserts the query names both columns.
 *   3. BOTH WRITE PATHS GO THROUGH IT. A refusal in a function nothing calls
 *      refuses nothing.
 *
 * The end-to-end version against real rows lives in `patient-bookable.db.test.ts`,
 * which needs a live Postgres. These three run everywhere, every time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isServiceBookableByPatient } from "./services";

const HERE = __dirname;

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** A row as `getBookableService` selects it: everything permissive. */
const OK = { isActive: true, patientBookable: true, internalOnly: false };

describe("isServiceBookableByPatient — the whole rule", () => {
  it("allows an active, patient-bookable, non-internal service", () => {
    expect(isServiceBookableByPatient(OK)).toBe(true);
  });

  it("REFUSES an internal_only service, even when everything else says yes", () => {
    // "Diversos" — the accounting row. Staff-bookable, never patient-bookable.
    expect(isServiceBookableByPatient({ ...OK, internalOnly: true })).toBe(false);
  });

  it("REFUSES a service JP has not opened to patients", () => {
    // NESA, R.P.G., 1.ª consulta, Pilates Aula Experimental — the four the
    // ruling deliberately leaves off.
    expect(isServiceBookableByPatient({ ...OK, patientBookable: false })).toBe(false);
  });

  it("REFUSES an inactive service", () => {
    // The three rows literally named "-" in the production catalog.
    expect(isServiceBookableByPatient({ ...OK, isActive: false })).toBe(false);
  });

  it("refuses when internal_only is combined with patient_bookable — the dangerous row", () => {
    // This combination is REACHABLE: nothing in the schema forbids a row that is
    // both. A rule that only checked patient_bookable would let it through, and
    // it is exactly the row a mis-click in an admin screen produces.
    expect(isServiceBookableByPatient({ ...OK, internalOnly: true, patientBookable: true })).toBe(
      false,
    );
  });

  it("every clause is load-bearing (the negative arms)", () => {
    // Each flip changes the answer, so no clause is decoration. If a future edit
    // drops one, one of these becomes true and this fails.
    const flips = [
      { ...OK, isActive: false },
      { ...OK, patientBookable: false },
      { ...OK, internalOnly: true },
    ];
    expect(flips.map(isServiceBookableByPatient)).toEqual([false, false, false]);
  });
});

describe("the columns the rule reads are actually SELECTED", () => {
  const store = code(join(HERE, "store.ts"));

  // The one failure a unit test cannot see: an unselected column arrives as
  // `undefined`, which is falsy, so `!row.internalOnly` passes for every row and
  // nothing goes red. Before W13-04 this query selected neither column.
  it("getBookableService selects internalOnly", () => {
    expect(store).toContain("internalOnly: services.internalOnly");
  });

  it("getBookableService selects patientBookable", () => {
    expect(store).toContain("patientBookable: services.patientBookable");
  });

  it("the catalog list filters on the column in SQL", () => {
    expect(store).toContain("eq(services.patientBookable, true)");
    expect(store).toContain("eq(services.internalOnly, false)");
  });

  it("the deleted allowlist is gone from the store", () => {
    expect(store).not.toContain("isBookableServiceName");
    expect(store).not.toContain("BOOKABLE_SERVICE_NAMES");
  });
});

describe("both patient write paths resolve through the guarded function", () => {
  const booking = code(join(HERE, "booking.ts"));

  it("book and reschedule and the slot list all call getBookableService", () => {
    // A refusal inside a function nobody calls refuses nothing. Three call
    // sites: listOpenSlots, bookAppointment, rescheduleAppointment.
    const calls = booking.match(/getBookableService\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("neither write path resolves a service any other way", () => {
    // The failure this prevents is a second lookup added later that skips the
    // rule — the shape the catalog query and getBookableService already were.
    expect(booking).not.toMatch(/from\(services\)/);
    expect(booking).not.toContain("isBookableServiceName");
  });
});

describe("the allowlist is gone from the repo, not merely unused", () => {
  const services = code(join(HERE, "services.ts"));

  for (const symbol of [
    "BOOKABLE_SERVICE_NAMES",
    "isBookableServiceName",
    "PHYSIO_WRAPPER_SERVICE_NAMES",
  ]) {
    it(`${symbol} no longer exists`, () => {
      expect(services).not.toContain(symbol);
    });
  }

  it("normalizeServiceName SURVIVES — it is a utility, not the rule", () => {
    // Migration 0057's backfill SQL is written to agree with it, and
    // patient-bookable.db.test.ts proves that against a real database.
    expect(services).toContain("export function normalizeServiceName");
  });
});
