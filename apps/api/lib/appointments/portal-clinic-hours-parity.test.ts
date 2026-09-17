/**
 * portal-clinic-hours-parity.test.ts — AGENDA-2100 on the patient side.
 *
 * ==========================================================================
 * THE RULE, AND WHY IT IS SOURCE-LEVEL
 * ==========================================================================
 * Same argument as bookable-parity.test.ts next door: these are raw SQL
 * templates run through service_role, so exercising them needs a live Postgres.
 * The question at stake is not behavioural subtlety - it is "does this predicate
 * appear in all three places", and a source assertion answers exactly that, on
 * every PR, without a seeded database.
 *
 * THE THREE PLACES, and why each one alone is not enough:
 *   1. the advertised slot grid   - what the patient is OFFERED
 *   2. the createBooking guard    - what the confirm ACCEPTS
 *   3. hasWindowConflict          - what a portal RESCHEDULE accepts
 * A predicate in (1) only would advertise correctly and accept anything a
 * crafted request asked for. In (2) and (3) only, the patient would be offered
 * 20:30 and refused at the last step - which is the step-3-vs-guard
 * disagreement store.ts's own header says cannot happen.
 *
 * ==========================================================================
 * WHAT THE PORTAL DID NOT KNOW BEFORE THIS CARD
 * ==========================================================================
 * M2, measured: NO portal query read `opens_at` or `closes_at` at all. The slot
 * grid was expanded from therapist `availability_templates`, so a therapist
 * whose template ran to 22:00 advertised 21:30 at a clinic that shuts at 20:00.
 * The midday closure was the only clinic fact any of these queries carried.
 */
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

/** The helper's call, however the formatter has broken the line. */
const WITHIN_HOURS = /withinClinicHoursExists\s*\(/g;
const CLOSURE = /closureOverlapExists\s*\(/g;

function count(src: string, re: RegExp): number {
  return (src.match(re) ?? []).length;
}

/** The body of one method, up to the next top-level method in the object. */
function bodyOf(name: string): string {
  const start = STORE.indexOf(name);
  if (start === -1) throw new Error(`${name} is not in store.ts`);
  const rest = STORE.slice(start);
  const end = rest.indexOf("\n  },");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("AGENDA-2100: the portal never offers or accepts an hour the clinic is shut for", () => {
  it("defines the helper once, so the three call sites cannot drift apart", () => {
    expect(STORE).toMatch(/function\s+withinClinicHoursExists\s*\(/);
  });

  it("states the 60-minute lead, matching classifyStart in the staff app", () => {
    // The two are the same rule in two languages. If one moves, this fails.
    expect(STORE).toMatch(/interval\s+'60 minutes'/);
  });

  it("bounds the start by opens_at at the bottom and closes_at minus the lead at the top", () => {
    const helper = STORE.slice(STORE.indexOf("function withinClinicHoursExists"));
    const body = helper.slice(0, helper.indexOf("\n}"));
    expect(body).toMatch(/>=\s*l\.opens_at/);
    expect(body).toMatch(/l\.closes_at\s*-\s*interval\s+'60 minutes'/);
  });

  it("no query checks the midday closure without also checking the opening hours", () => {
    // The closure is the clinic fact these queries already carried, so it is the
    // honest enumerator of "which queries care about the building". A query that
    // checks the lunch hour and not the closing hour is the half-state this card
    // ends.
    //
    // COUNTED PER QUERY, NOT ACROSS THE FILE. An earlier version asserted the
    // two totals were equal and went red at 4 against 7: `closureOverlapExists`
    // appears TWICE in each guard - once in the `conflict` disjunction and again
    // as its own `as clinic_closed` column, because a shut building gets its own
    // sentence. Totals were never the question; per-query coverage is.
    for (const name of ["listOpenSlots", "createBooking", "hasWindowConflict"]) {
      const body = bodyOf(name);
      expect(count(body, /closureOverlapExists\s*\(/g), `${name} reads the closure`).toBeGreaterThan(0);
      expect(count(body, /withinClinicHoursExists\s*\(/g), `${name} reads the hours`).toBeGreaterThan(0);
    }
  });

  it("applies it in all THREE places, so the grid and the guards agree", () => {
    expect(count(STORE, WITHIN_HOURS)).toBeGreaterThanOrEqual(3);
  });

  it("the advertised slot grid carries it", () => {
    const grid = bodyOf("listOpenSlots");
    expect(grid).toMatch(WITHIN_HOURS);
  });

  it("the booking confirm guard carries it", () => {
    const booking = bodyOf("createBooking");
    expect(booking).toMatch(WITHIN_HOURS);
  });

  it("the reschedule guard carries it", () => {
    const resched = bodyOf("hasWindowConflict");
    expect(resched).toMatch(WITHIN_HOURS);
  });

  it("the stripper really removes prose, or every assertion above is theatre", () => {
    const pretend = stripComments(`
      // withinClinicHoursExists( in a comment
      /* and withinClinicHoursExists( in a block */
      -- and withinClinicHoursExists( in SQL
      const x = 1;
    `);
    expect(pretend).not.toMatch(WITHIN_HOURS);
  });
});
