// staff-11-horizon-parity.test.mjs - R52 (strategy, 2026-11-02): the STAFF-11 check
// counts schedule hours the way the portal does since R15, a row whose
// [valid_from, valid_until] window overlaps [today, today + OPEN_SLOTS_HORIZON_DAYS] in
// Lisbon.
//
// The check is a plain node script and cannot import the TypeScript constant, so it
// restates it. This file holds the two together:
//   1. the check's horizon equals apps/api's OPEN_SLOTS_HORIZON_DAYS;
//   2. the check's two window conditions are the portal's two (listBookableTherapists
//      and getCatalog), exactly, after whitespace is collapsed, the store's `av.` alias
//      is dropped and its bound `${LISBON}` is replaced by the literal the check uses.
//
// No database. The portal's SQL is proved on a real database by
// packages/db/tests/portal-roster-template-validity.db.test.ts and
// apps/api/lib/appointments/catalog-slot-horizon.db.test.ts; this proves the check reads
// the same text. The frozen gate test scripts/staff-11-jp-one-clinic-check.test.mjs pins
// only the shape of the two bounds, which is why it did not catch the R15 difference.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/staff-11-jp-one-clinic-check.mjs");
const CHECK = readFileSync(SCRIPT, "utf8");
const STORE = readFileSync(join(ROOT, "apps/api/lib/appointments/store.ts"), "utf8");
const BOOKING = readFileSync(join(ROOT, "apps/api/lib/appointments/booking.ts"), "utf8");
const { OPEN_SLOTS_HORIZON_DAYS: CHECK_HORIZON } = await import(SCRIPT);

const collapse = (s) => s.replace(/\s+/g, " ").trim();

function slice(src, start, end, what) {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`${start} not found in ${what}`);
  const to = src.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`${end} not found after ${start} in ${what}`);
  return src.slice(from, to);
}

/** The two window lines of a store query, in the check's spelling. */
function portalWindow(body, what) {
  const LISBON = STORE.match(/^const LISBON = "([^"]+)";$/m)?.[1];
  if (LISBON !== "Europe/Lisbon") throw new Error(`store.ts LISBON is ${LISBON}, the check reads Europe/Lisbon`);
  const lines = body.split("\n").filter((l) => /^\s*and \(av\.valid_(from|until)\s/.test(l));
  if (lines.length !== 2) throw new Error(`${what}: expected 2 window lines, found ${lines.length}`);
  return collapse(lines.join(" ").replace(/\bav\./g, "").replaceAll("${LISBON}", "'Europe/Lisbon'"));
}

/** The check's two window conditions, from its `active_in_window` count. */
function checkWindow() {
  const count = slice(CHECK, "count(*) filter (where is_active\n", "as active_in_window", "the STAFF-11 check");
  const m = collapse(count).match(/^count\(\*\) filter \(where is_active (and .*)\)::int$/);
  if (!m?.[1]) throw new Error(`the check's active_in_window count has an unexpected shape: ${collapse(count)}`);
  return m[1];
}

const roster = () => slice(STORE, "async listBookableTherapists", "order by u.full_name", "store.ts");

test("the check's horizon is apps/api's OPEN_SLOTS_HORIZON_DAYS", () => {
  const portal = Number(BOOKING.match(/^export const OPEN_SLOTS_HORIZON_DAYS = (\d+);$/m)?.[1]);
  assert.ok(Number.isInteger(portal) && portal > 0, "OPEN_SLOTS_HORIZON_DAYS not found in booking.ts");
  assert.equal(CHECK_HORIZON, portal);
});

test("the check's two window conditions are the roster's (listBookableTherapists)", () => {
  assert.equal(checkWindow(), portalWindow(roster(), "listBookableTherapists"));
});

test("the check's two window conditions are the catalogue's (getCatalog)", () => {
  const catalog = slice(STORE, "async getCatalog", "async getBookableService", "store.ts");
  assert.equal(checkWindow(), portalWindow(catalog, "getCatalog"));
});

test("the comparison has teeth: the pre-R52 'valid today' condition does not match the roster", () => {
  const old = collapse(
    "and (valid_from is null or valid_from <= (now() at time zone 'Europe/Lisbon')::date) " +
      "and (valid_until is null or valid_until >= (now() at time zone 'Europe/Lisbon')::date)",
  );
  assert.notEqual(old, portalWindow(roster(), "listBookableTherapists"));
});
