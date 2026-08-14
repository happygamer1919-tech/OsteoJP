import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// W13-06 / LOOP 6 — PG6 EXPOSURE. THE STRUCTURAL ENFORCEMENT POINT.
//
// PG6's literal text is "every MUST-NEVER row has an enforcement point". This
// file is the enforcement point for MUST-NEVER row MN-01, the row every other
// MUST-NEVER row stands on:
//
//   A PATIENT-FACING ROUTE MUST NEVER SERVE A CALLER WITHOUT A VERIFIED
//   PATIENT PRINCIPAL.
//
// WHY THIS IS A REPO-WIDE SCAN AND NOT A PER-ROUTE TEST, which is the whole
// design and the reason it is worth reading before changing it. Per-route tests
// prove the routes SOMEBODY THOUGHT OF. They cannot fail for a route added next
// month, and a route added next month is exactly how this class of hole appears.
// The same argument migration 0061 made for a state-level constraint over three
// application checks: patching the paths you found leaves the fourth to be
// written later. This test enumerates the surface from the FILESYSTEM, so a new
// route is in scope the moment it exists, and it fails until someone has made a
// decision about it. Format precedent: `apps/api/lib/appointments/write-paths.test.ts`,
// which does the same for appointment writers.
//
// THE ALLOWLIST BELOW RECORDS A DECISION PER ROUTE, NOT AN INVENTORY. Do not
// silence a failure by pasting a path into it. Every entry carries the reason
// that route may run before authentication, and the reason is auditable.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const V1_ROOT = join(REPO_ROOT, "apps", "api", "app", "api", "v1");
const MATRIX = join(REPO_ROOT, "docs", "recon", "W13-06-exposure-matrix.md");

/**
 * Routes that legitimately run BEFORE a patient principal exists, each with the
 * reason.
 *
 * FOUR OF THEM ARE ONE FLOW: you cannot present a credential you are in the act
 * of obtaining. THE FIFTH IS A DIFFERENT ARGUMENT ENTIRELY and is worth reading
 * as such rather than being filed beside them - `booking/guest` has no
 * credential to obtain, because the caller is not a patient and may never
 * become one. Its safety comes from what it can WRITE (one non-clinical table,
 * always as a request) rather than from who it can prove itself to be.
 *
 * EVERY ONE OF THEM IS RATE LIMITED, which is what stands in for authentication
 * on an unauthenticated surface. That is asserted below, not assumed — an
 * unauthenticated route with no limiter is the SMS-pump defect
 * (`SEC-otp-unauthenticated-sms-pump`) and it has happened here once already.
 */
const PRE_AUTH: Record<string, string> = {
  "auth/otp/request":
    "mints the credential. Authenticating it would be circular. Rate limited per IP, per phone, and by two global send ceilings.",
  "auth/otp/verify":
    "exchanges the code for the session. The code IS the credential being proven. Rate limited per IP and by a per-code attempt cap.",
  "auth/otp/trusted":
    "spends the 30-day device token, which is itself a credential, verified server-side against the device row. Rate limited per IP.",
  "auth/otp/revoke":
    "authenticated BY THE DEVICE COOKIE itself, deliberately, so a patient can revoke without a session. Rate limited per IP.",
  // ITEM 6. The FIRST entry here that is not part of the OTP flow, so the
  // comment above ("these are the only four, and they are all one flow") no
  // longer describes the set - see the amended note.
  "booking/guest":
    "ITEM 6 guest booking. The caller is BY DEFINITION not a patient - the flow exists for people who have no record and no account - so there is no principal to present and requiring one would refuse every legitimate use. It writes ONLY to guest_booking_requests, never to a clinical table, every row is a REQUEST a human confirms (R-GUEST-1), and it answers identically whether or not the phone matches a patient so it is not a patient-list oracle. Rate limited per IP, per phone, and by two tenant-wide ceilings, all on the DURABLE store.",
  // GUEST-04, Option A. The SIXTH entry, and the SECOND that is not part of the
  // OTP flow. It is also the only READ on this list.
  "booking/guest/catalog":
    "GUEST-04 Option A, the ONE unauthenticated READ the guest form is allowed. It returns what can be booked and where - service id + name, location id + name - all of which is already published on osteojp.pt and on the portal's own public Clinicas page. Nothing about any PERSON is reachable through it: no patient, no therapist, no appointment, no schedule, no price. It applies the same four predicates as the authenticated catalog (tenant, active, not internal_only, patient_bookable) so it can never offer a stranger something a logged-in patient may not book. tenantId is an unverified query parameter because the route runs before authentication and there is no token to derive one from; an unknown tenant answers with empty lists, so it is not an oracle. Rate limited per IP on the DURABLE store, two windows.",
};

/** Strip comments before matching anything.
 *
 * NOT CEREMONY, AND THIS IS THE FILE WHERE IT MATTERS MOST. Route files in this
 * app carry long design comments that NAME the very symbols asserted below —
 * `apps/api/lib/auth/patient.ts` discusses `getPatientPrincipal` for forty
 * lines without calling it, and several routes cite `unauthorized()` in prose.
 * Matching raw text would pass a route that only MENTIONS authentication, which
 * is the textbook vacuous guard: an assertion that cannot fail is worse than no
 * assertion, because it is counted as coverage.
 *
 * Block comments are stripped first, then line comments, then string literals
 * are blanked — a route could otherwise satisfy this test with a log message.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** Every `route.ts` under `app/api/v1`, as a slash-joined route path. */
function enumerateRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) enumerateRoutes(full, acc);
    else if (entry === "route.ts") {
      acc.push(relative(V1_ROOT, join(full, "..")).split(sep).join("/"));
    }
  }
  return acc.sort();
}

/** The refusal, in both spellings this repo uses: with and without a brace. */
const GUARD = /if\s*\(\s*!\s*\w+\s*\)\s*\{?\s*(return|throw)/;

const ROUTES = enumerateRoutes(V1_ROOT);
const sourceOf = (route: string) =>
  stripComments(readFileSync(join(V1_ROOT, route, "route.ts"), "utf8"));

const AUTHENTICATED = ROUTES.filter((r) => !(r in PRE_AUTH));

describe("W13-06 MN-01 — no patient-facing route serves an unverified caller", () => {
  it("finds the patient-facing surface at all (guards against a vacuous pass)", () => {
    // WITHOUT THIS, every assertion below passes on an empty array. A refactor
    // that moves the routes elsewhere would turn this whole file green while
    // proving nothing, which is the failure mode this suite exists to prevent.
    expect(ROUTES.length).toBeGreaterThanOrEqual(19);
    expect(AUTHENTICATED.length).toBeGreaterThanOrEqual(15);
  });

  it.each(AUTHENTICATED)("%s calls getPatientPrincipal in CODE, not in a comment", (route) => {
    expect(sourceOf(route)).toMatch(/getPatientPrincipal\s*\(/);
  });

  it.each(AUTHENTICATED)("%s REFUSES when the principal is absent", (route) => {
    // `if (!principal) return ...` and `if (!principal) { return ... }` are both
    // live in this repo, so the brace is optional. A route that resolves a
    // principal and never checks it compiles fine under strict TS whenever the
    // value is only passed onward as a nullable — the compiler is not the guard
    // here, this is.
    expect(sourceOf(route)).toMatch(GUARD);
  });

  it.each(AUTHENTICATED)("%s refuses BEFORE it does any other awaited work", (route) => {
    const src = sourceOf(route);
    // ANCHOR ON THE CALL, NOT THE IMPORT. `indexOf("getPatientPrincipal")` finds
    // the import line first, and measuring from there makes the call itself look
    // like "work done before the guard" — the assertion would then fail on every
    // correct route, which is how it was first written and how it was caught.
    const call = src.indexOf("await getPatientPrincipal");
    expect(call, "route must AWAIT getPatientPrincipal").toBeGreaterThanOrEqual(0);
    const after = src.slice(call + "await getPatientPrincipal".length);

    const guard = after.search(GUARD);
    expect(guard, "no refusal guard after the principal is resolved").toBeGreaterThanOrEqual(0);

    // The defect this catches is real and has a name in this repo: authenticate,
    // do the work, check afterwards. The work is what leaks.
    const nextAwait = after.search(/\bawait\b/);
    if (nextAwait >= 0) expect(guard).toBeLessThan(nextAwait);
  });
});

describe("W13-06 MN-01b — the pre-authentication allowlist is exact", () => {
  it("no route runs unauthenticated without an entry recording WHY", () => {
    // The failure message names the offender, because the next person to see
    // this red is adding a route and needs to know what decision is being asked
    // of them, not merely that something is wrong.
    const undeclared = ROUTES.filter(
      (r) => r in PRE_AUTH === false && !/getPatientPrincipal\s*\(/.test(sourceOf(r)),
    );
    expect(undeclared).toEqual([]);
  });

  it("every allowlisted route still exists — a stale exemption is a hole", () => {
    // An entry outliving its route is an exemption nobody is watching, ready to
    // silently cover a future route that reuses the path.
    expect(Object.keys(PRE_AUTH).filter((r) => !ROUTES.includes(r))).toEqual([]);
  });

  it("every allowlisted route is rate limited, since nothing else bounds it", () => {
    for (const route of Object.keys(PRE_AUTH)) {
      expect(sourceOf(route), route).toMatch(/checkDurableRateLimit\s*\(/);
    }
  });

  it("every allowlist entry carries a non-trivial reason", () => {
    for (const [route, reason] of Object.entries(PRE_AUTH)) {
      expect(reason.length, route).toBeGreaterThan(40);
    }
  });
});

describe("W13-06 — the committed matrix stays in step with the surface", () => {
  it("names every patient-facing route, so a new route forces a matrix row", () => {
    // THE MATRIX IS THE PG6 DELIVERABLE AND A DOCUMENT ROTS SILENTLY. This is
    // the only thing that makes it fail loudly instead: add a route, and the
    // matrix must gain a row before CI is green again.
    const doc = readFileSync(MATRIX, "utf8");
    expect(ROUTES.filter((r) => !doc.includes(r))).toEqual([]);
  });
});
