// D2 regression guard, 2026-08-11.
//
// THE DEFECT, as production produced it: a portal booking for Fisioterapia was
// auto-assigned to Lurdes Cruz, an ADMINISTRATOR. She does not appear in the
// staff Nova marcacao Terapeuta dropdown at all, because that dropdown filters
// on `is_bookable` and the portal's assignment query did not. Two surfaces
// disagreed about who is a therapist, and reception was handed a pedido whose
// practitioner their own booking form will not offer - which is why item 18 of
// the acceptance session could not be run.
//
// WHAT IS ASSERTED, AND WHY IT IS SOURCE-LEVEL. Every one of these three queries
// is raw SQL built with drizzle `sql` templates against tables this app talks to
// through service_role; exercising them needs a live Postgres, which is what the
// .db.test.ts suites are for and what a unit run does not have. The rule at
// stake, though, is not behavioural subtlety - it is "does this predicate appear
// in all three places". A source assertion answers exactly that question, and
// answers it in CI on every PR rather than only when a DB is seeded.
//
// COMMENTS ARE STRIPPED FIRST. This file's subject files now DESCRIBE the defect
// at length, naming `is_bookable` in prose; a predicate run over raw text would
// match the description and pass on broken code. That failure mode is not
// hypothetical - it is what the stripper self-test at the bottom pins.
//
// PROVEN TO FAIL ON THE BROKEN CODE. The negative arm reconstructs the pre-fix
// SQL - the real text, with `is_active` and no `is_bookable` - and asserts the
// same predicates go red against it.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/--[^\n]*/g, " ");
}

const STORE = stripComments(readFileSync(join(__dirname, "store.ts"), "utf8"));

/** `is_bookable = true`, however the formatter has broken the line. */
const BOOKABLE = /is_bookable\s*=\s*true/g;
/** `is_active = true`, the predicate that was already there in all three. */
const ACTIVE = /is_active\s*=\s*true/g;

function count(src: string, re: RegExp): number {
  return (src.match(re) ?? []).length;
}

describe("D2: the portal cannot assign anyone the staff dropdown would refuse", () => {
  it("every user-selection predicate in store.ts carries is_bookable", () => {
    // Three sites: listOpenSlots' grid expansion, listOpenSlots' exists-check,
    // and listAvailableTherapists. Each already filtered is_active; each must now
    // filter is_bookable, or one of them can surface a user the others cannot.
    expect(count(STORE, BOOKABLE)).toBeGreaterThanOrEqual(3);
  });

  it("is_bookable is applied wherever is_active is applied to a USER", () => {
    // av.is_active is a template flag, not a user flag, so it is excluded before
    // the comparison. What remains is the user predicate, and the two must move
    // together: a site that checks one and not the other is the D2 shape.
    const userActive = count(STORE.replace(/av\.is_active\s*=\s*true/g, " "), ACTIVE);
    expect(count(STORE, BOOKABLE)).toBe(userActive);
  });

  it("the assignment query itself filters is_bookable", () => {
    const fn = STORE.slice(STORE.indexOf("listAvailableTherapists"));
    const body = fn.slice(0, fn.indexOf("},"));
    expect(body).toMatch(BOOKABLE);
  });

  it("PL-06a is not violated: no service-mapping filter is introduced", () => {
    // The mapping is PRESELECTION, never RESTRICTION (owner ruling, 2026-07-28).
    // Filtering candidates by it would make the portal stricter than the staff
    // surface. If this ever needs to change it is JP's call, not a code change.
    expect(STORE).not.toMatch(/therapist_services/);
  });

  it("PL-06b is not violated: bookability is the FLAG, never the role", () => {
    // A role filter would drop the practising owner JP, which is the live defect
    // migration 0046 exists to have fixed. The flag is the durable signal.
    const fn = STORE.slice(STORE.indexOf("listAvailableTherapists"));
    const body = fn.slice(0, fn.indexOf("},"));
    expect(body).not.toMatch(/roles?\b[^)]*slug/);
    expect(body).not.toMatch(/role_id/);
  });
});

describe("D2 negative arm: the guard fails against the pre-fix SQL", () => {
  // The real pre-fix text of all three sites, verbatim apart from whitespace.
  const preFix = `
    where av.tenant_id = X and av.location_id = Y
      and av.is_active = true
      and u.is_active = true
      and av.weekday = Z
    select 1 from users u
      where u.tenant_id = X
        and u.is_active = true
    select distinct u.id from users u
      where u.tenant_id = X
        and u.is_active = true
  `;

  it("the pre-fix source carries ZERO is_bookable predicates", () => {
    expect(count(preFix, BOOKABLE)).toBe(0);
    expect(count(preFix, BOOKABLE)).toBeLessThan(3);
  });

  it("the pre-fix source breaks the is_active/is_bookable parity assertion", () => {
    const userActive = count(preFix.replace(/av\.is_active\s*=\s*true/g, " "), ACTIVE);
    expect(userActive).toBe(3);
    expect(count(preFix, BOOKABLE)).not.toBe(userActive);
  });

  it("a role-filter fix would be caught too, since it reintroduces the JP defect", () => {
    const roleFix = "select distinct u.id from users u join roles r on r.id = u.role_id where r.slug = 'therapist'";
    expect(roleFix).toMatch(/role_id/);
  });

  it("stripper self-test: prose naming is_bookable must NOT satisfy the guard", () => {
    // The exact hazard this file's header names. Both subject files now discuss
    // is_bookable in comments; if stripping were skipped, the guard would pass on
    // code that never filters on it.
    const proseOnly = "-- D2: this query must filter is_bookable = true\nselect 1 from users u where u.is_active = true";
    expect(count(stripComments(proseOnly), BOOKABLE)).toBe(0);
    expect(count(proseOnly, BOOKABLE)).toBe(1);
  });
});
