import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// W13-07 / LOOP 7 — PG8 SYNC. THE SINGLE-SOURCE ENFORCEMENT POINT.
//
// PG8 asks that a portal booking and a staff booking stay in step. The DB-gated
// suites already prove the BEHAVIOUR at the database:
//
//   packages/db/tests/portal-booking-slot-parity.test.ts:268
//     a booked window drops out of the offered list
//   packages/db/tests/slot-lock-concurrency.test.ts:264,274
//     two writers contending for one window, only one survives
//
// WHAT NEITHER OF THEM PROVES, AND WHAT THIS FILE IS FOR. The parity suite
// RE-STATES the availability SQL rather than importing it — its own header says
// so: "apps/api is not a shared package this wave, so the availability-list
// query and the validator predicates below are duplicated MINIMALLY from
// apps/api/lib/appointments/store.ts ... TODO(@osteojp/scheduling): when
// store.ts moves into a shared package, import the real builders here and
// delete these re-statements."
//
// So the single-source guarantee — that the list a patient is OFFERED and the
// check their booking is VALIDATED against come from one place — is currently a
// COMMENT plus a duplicated fixture. A second availability computation added
// anywhere would not redden any existing test; it would simply make the parity
// suite's duplication describe one of the two implementations.
//
// THAT IS THE GAP THIS CLOSES, and it is the same shape as LOOP 6's MN-01:
// per-behaviour tests prove the paths somebody thought of, and a structural scan
// from the filesystem catches the one written next month.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

/** Strip comments and literals before matching.
 *
 * LOAD-BEARING HERE FOR THE SAME REASON AS THE EXPOSURE SUITE. Every file this
 * test reads carries long design comments that NAME `listOpenSlots`,
 * `revalidatePath` and `availabilityCoversExists` in prose without calling them
 * — `booking.ts:189` and `store.ts:382` both discuss `listOpenSlots` in
 * comments, and `slots.ts`'s header names it while deliberately NOT using it.
 * Matching raw text would grade a file by what it talks about.
 */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const STORE = "apps/api/lib/appointments/store.ts";
const BOOKING = "apps/api/lib/appointments/booking.ts";
const SLOTS_ROUTE = "apps/api/app/api/v1/booking/slots/route.ts";
const PORTAL_SLOTS = "apps/portal/app/portal/booking/slots.ts";

describe("W13-07 — availability has exactly ONE implementation", () => {
  it("is reading the files it thinks it is (guards against a vacuous pass)", () => {
    // Without this, every assertion below passes on an empty string if a file
    // is moved or renamed, and the suite goes green while proving nothing.
    for (const p of [STORE, BOOKING, SLOTS_ROUTE, PORTAL_SLOTS]) {
      expect(read(p).length, p).toBeGreaterThan(200);
    }
  });

  it("only the store DEFINES the slot query — the availability predicates live in one file", () => {
    // `availabilityCoversExists` is the predicate that decides whether a
    // therapist's template covers a window. A second definition anywhere is a
    // second answer to the same question, which is the P1 incident shape:
    // offered at step 3, rejected at step 4.
    const definers = [STORE, BOOKING, SLOTS_ROUTE].filter((p) =>
      /function\s+availabilityCoversExists/.test(strip(read(p))),
    );
    expect(definers).toEqual([STORE]);
  });

  it("the patient slot ROUTE computes nothing — it delegates to the orchestration", () => {
    const src = strip(read(SLOTS_ROUTE));
    expect(src).toMatch(/listOpenSlots\s*\(/);

    // NO QUERY OF ITS OWN. A route that grew one would be a second availability
    // source with no test between it and the validator.
    //
    // MATCHED ON THE CALL SHAPE, NOT ON THE SQL TEXT, AND THAT IS A CORRECTION.
    // The first version of this assertion searched for /select ... from/ on the
    // STRIPPED source — and `strip()` blanks template literals, which is exactly
    // where SQL lives in this codebase. It was therefore unfalsifiable: a
    // negative arm that inserted a real `db.execute(\`select ... \`)` into this
    // route did NOT redden it. Caught by running the arm, which is the only
    // reason to run them. Query-builder call shapes are identifiers and survive
    // stripping, so they can actually fail.
    for (const shape of [/\bdb\s*\.\s*execute\s*\(/, /getDbAdmin\s*\(/, /\bsql\s*`/, /\.\s*from\s*\(/]) {
      expect(src, `slot route must not query directly: ${shape}`).not.toMatch(shape);
    }
  });

  it("the orchestration delegates to the store rather than querying directly", () => {
    const src = strip(read(BOOKING));
    expect(src).toMatch(/store\.listOpenSlots\s*\(/);
  });

  it("the PORTAL never computes availability client-side", () => {
    // `slots.ts` states this in its header as an intention. This makes it a
    // test: display helpers only, no filtering of the API's answer.
    const src = strip(read(PORTAL_SLOTS));
    expect(src).not.toMatch(/availabilityCovers|apptOverlap|timeOffOverlap/);
    expect(src).not.toMatch(/\.filter\s*\(/);
  });
});

describe("W13-07 — the cross-app hop is UNBOUNDED, and that is structural", () => {
  it("apps/api cannot invalidate the staff agenda, because it never tries", () => {
    // THE FINDING THIS SUITE EXISTS TO PIN. A portal booking is written by
    // apps/api. The staff agenda is rendered by apps/web, a SEPARATE Next.js
    // deployment. `revalidatePath` is per-deployment, so apps/api could not
    // invalidate /agenda even if it called it — and it does not call it.
    //
    // The consequence is the PG8 DoD's own clause: "Any hop whose latency is
    // unbounded (a cache with no revalidation trigger, a poll) is named as
    // such rather than reported with a lucky measurement." An agenda already
    // open in a browser learns about a portal booking only when a human
    // navigates or refreshes. There is no push and no poll.
    //
    // This assertion PINS THE FACT rather than the fix. If someone later adds
    // a real invalidation channel, this test goes red and the trace document
    // must be updated to match — which is the point.
    const api = ["apps/api/lib/appointments/booking.ts", "apps/api/lib/appointments/store.ts", SLOTS_ROUTE];
    for (const p of api) {
      expect(strip(read(p)), p).not.toMatch(/revalidatePath|revalidateTag/);
    }
  });

  it("the staff side DOES invalidate its own agenda, so the gap is one-directional", () => {
    // Negative control for the assertion above: staff writes DO revalidate.
    // Without this, "apps/api does not call revalidatePath" would be consistent
    // with nothing anywhere calling it, and the finding would be about a
    // mechanism this project does not use rather than about a cross-app
    // boundary.
    const src = strip(read("apps/web/lib/scheduling/actions.ts"));
    expect(src).toMatch(/revalidatePath\s*\(/);
  });

  it("the portal reads uncached, so its own direction has no stale-cache hop", () => {
    // The staff -> portal direction is bounded: every portal API read is
    // `cache: 'no-store'`, so the next read reflects the write. Asserted so the
    // trace's asymmetry is a tested fact, not a claim.
    const src = read("apps/portal/lib/api/client.ts");
    expect(src).toMatch(/cache:\s*['"]no-store['"]/);
    expect(src).not.toMatch(/next:\s*\{\s*revalidate/);
  });
});
