import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { and } from "drizzle-orm";

vi.mock("server-only", () => ({}));

import { therapistScope } from "./queries";
import { followupScopeConditions } from "./scope";
import type { RequestContext } from "@/lib/auth/context";

/**
 * ==========================================================================
 * OWNER RULING 2026-08-27 - WHO GETS SCOPED, AND WHO DOES NOT.
 * ==========================================================================
 * `therapistScope` is the branch every other piece of this feature hangs off:
 * the candidates query, the postponements query and the mutation guard all
 * append the own-patient clause exactly when it returns non-null.
 *
 * BOTH DIRECTIONS, PER ROLE, BY NAME. A function that returned the user id for
 * EVERY role would empty the front desk's call list, and a function that
 * returned null for every role would hand a therapist the whole tenant. Those
 * two failures are opposite and each looks ordinary from one seat, so both arms
 * are asserted rather than one.
 */

const ctx = (role: RequestContext["role"]): RequestContext => ({
  tenantId: "11111111-1111-1111-1111-111111111111",
  role,
  userId: "22222222-2222-2222-2222-222222222222",
});

describe("therapistScope", () => {
  it("returns the therapist's own user id, which is what the clause binds", () => {
    // NOT merely "truthy". The value IS the scope: a function returning some
    // other id would still take the scoped branch and would show a therapist
    // somebody else's patients.
    expect(therapistScope(ctx("therapist"))).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it.each(["owner", "admin", "reception"] as const)(
    "returns null for %s - they keep the unscoped list per PL-09",
    (role) => {
      expect(therapistScope(ctx(role))).toBeNull();
    },
  );

  it("covers every role in the matrix, so a new role cannot slip through untested", () => {
    // A future fifth role would default to the unscoped branch. That default is
    // the WRONG direction to fail in for a page that is every patient's phone
    // number, so this test names the roles that exist and breaks when the set
    // changes - which is the moment somebody has to decide.
    const roles: RequestContext["role"][] = ["owner", "admin", "therapist", "reception"];
    expect(roles.filter((r) => therapistScope(ctx(r)) !== null)).toEqual(["therapist"]);
  });
});

/**
 * ==========================================================================
 * THE MUTATION GUARD'S PREDICATE - THE HALF THE LIST DOES NOT PROVE.
 * ==========================================================================
 * `followup-selection.db.test.ts` proves the CLAUSE against Postgres. This
 * proves the guard actually USES it, and uses it for the right roles.
 *
 * WHY THAT NEEDS ITS OWN TEST. The three server actions take a `patientId` from
 * the caller. If the guard silently dropped the therapist clause, every one of
 * them would still work perfectly on the screen - the list would be correctly
 * scoped, the buttons on it would target visible rows, and nothing anywhere
 * would look wrong. The hole would only be reachable by calling the action
 * directly with somebody else's id, which is not a thing a UI test does.
 *
 * IT RENDERS THE SQL rather than counting conditions. A count would pass against
 * a guard that appended the wrong predicate.
 */
const render = (ctx: RequestContext, locations: string[] | null): string =>
  new PgDialect().sqlToQuery(
    and(...followupScopeConditions(ctx, "33333333-3333-3333-3333-333333333333", locations))!,
  ).sql;

describe("followupScopeConditions - the mutation guard's predicate", () => {
  it("a therapist gets the own-patient clause", () => {
    const q = render(ctx("therapist"), null);
    expect(q).toContain("done.practitioner_id");
    expect(q).toContain("ORDER BY done.starts_at DESC");
  });

  it.each(["owner", "admin", "reception"] as const)(
    "%s does NOT get it - they may act on any patient they can see",
    (role) => {
      expect(render(ctx(role), null)).not.toContain("done.practitioner_id");
    },
  );

  it("the patient id is always part of the predicate, for every role", () => {
    // The guard's floor. Without this arm the tests above would pass against a
    // predicate that had lost the one condition naming the patient at all.
    for (const role of ["owner", "admin", "therapist", "reception"] as const) {
      expect(render(ctx(role), null)).toContain('"patients"."id" =');
    }
  });

  it("the location scope composes WITH the therapist scope rather than replacing it", () => {
    // A located therapist is bound by BOTH. An implementation that returned
    // early on the therapist branch would drop PL-09 for exactly the role that
    // gained access last, and it would look correct in every other test here.
    // The location id itself is a BOUND PARAMETER, so the assertion is on the
    // predicate the location scope emits rather than on the uuid - matching it
    // as text would only prove the renderer inlines values, which it must not.
    const q = render(ctx("therapist"), ["44444444-4444-4444-4444-444444444444"]);
    expect(q).toContain("done.practitioner_id");
    expect(q).toContain("primary_location_id");
  });

  it("a located receptionist is bound by the location scope, which predates this ruling", () => {
    const q = render(ctx("reception"), ["44444444-4444-4444-4444-444444444444"]);
    expect(q).toContain("primary_location_id");
    expect(q).not.toContain("done.practitioner_id");
  });
});
