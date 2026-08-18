import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The location scope this module applies. Mocked so the two arms of the ruling
 * can be asserted without a database: what is on trial here is WHO the server
 * answers and with WHICH rows, not how a Drizzle query is built.
 */
const viewerLocationScope = vi.fn<(ctx: unknown) => Promise<string[] | null>>();
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: (ctx: unknown) => viewerLocationScope(ctx),
}));

/**
 * The tenant's pending guest requests, as rows. `runScoped` hands the query
 * builder below to the module; the builder records the predicate it was given
 * and answers from this fixture, so a missing location filter shows up as EXTRA
 * ROWS RETURNED rather than as a shape assertion nobody can read.
 */
const LV = "loc-lv";
const CB = "loc-cb";
const ROWS = [
  { id: "g-lv", locationId: LV, fullName: "ZZ Guest LV", phone: "+351910000001" },
  { id: "g-cb", locationId: CB, fullName: "ZZ Guest CB", phone: "+351910000002" },
];

/** Location ids the module asked to be restricted to, or null if it asked for none. */
let requestedLocations: string[] | null = null;

/** The role `guest-convert.ts`'s server actions will resolve for themselves. */
let actingRole: RequestContext["role"] = "reception";

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(tx()),
  // The convert actions take no ctx argument - they resolve their own from the
  // session, so the role has to arrive this way rather than as a parameter.
  requireRequestContext: async () => ({
    tenantId: "tenant-1",
    role: actingRole,
    userId: `user-${actingRole}`,
  }),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    // `inArray` is the ONLY place this module can express a location
    // restriction, so intercepting it records whether one was expressed at all.
    // A fix that dropped the filter would leave this null and the row-count
    // assertions below would fail with the other clinic's guest in the list.
    inArray: (_col: unknown, values: string[]) => {
      requestedLocations = values;
      return actual.sql`true`;
    },
  };
});

/** Minimal query-builder stand-in: enough surface for both functions. */
function tx() {
  const rows = () =>
    requestedLocations === null
      ? ROWS
      : ROWS.filter((r) => requestedLocations!.includes(r.locationId));
  const listChain = {
    from: () => listChain,
    leftJoin: () => listChain,
    where: () => listChain,
    // `guest-convert.ts` looks the request up by id before doing anything.
    // Empty means `not_found`, which is exactly what the front-desk arm below
    // wants: it asserts the caller is NOT refused, not that a convert succeeds.
    limit: async () => [],
    orderBy: async () =>
      rows().map((r) => ({
        ...r,
        phoneE164: r.phone,
        serviceName: null,
        locationName: r.locationId,
        requestedStartsAt: new Date("2026-08-22T08:00:00Z"),
        requestedEndsAt: new Date("2026-08-22T12:00:00Z"),
        createdAt: new Date("2026-08-18T08:00:00Z"),
        matches: 0,
      })),
  };
  const countChain = {
    from: () => countChain,
    where: async () => [{ n: rows().length }],
  };
  return {
    select: (shape: Record<string, unknown>) =>
      "n" in shape ? countChain : listChain,
  };
}

import {
  listPendingGuestRequests,
  countPendingGuestRequests,
} from "./guest-requests";
import { ForbiddenError } from "@osteojp/auth";
import type { RequestContext } from "@/lib/auth/context";

const ctxFor = (role: RequestContext["role"]): RequestContext => ({
  tenantId: "tenant-1",
  role,
  userId: `user-${role}`,
});

beforeEach(() => {
  requestedLocations = null;
  viewerLocationScope.mockReset();
  viewerLocationScope.mockResolvedValue(null);
});

/**
 * ==========================================================================
 * SEC-01 - the guest queue is owner, admin and reception. A therapist gets
 * NOTHING. Owner ruling, 2026-08-18, after it was observed on deployed prod.
 * ==========================================================================
 *
 * WHAT WAS OBSERVED: a therapist assigned to two clinics opened /notificacoes
 * and saw the whole "Pedidos de novos clientes" section - names, phone numbers
 * and convert buttons - for the ENTIRE TENANT, including requests submitted by
 * other staff.
 *
 * THE TWO ARMS BELOW ARE THE RULING, and the second is the one that is easy to
 * forget. Refusing the therapist without proving reception still WORKS would
 * pass by breaking the feature; proving reception works without refusing the
 * therapist is the defect. Both, or neither is worth anything.
 */
describe("SEC-01 arm 1 - a therapist is REFUSED, and refused rather than emptied", () => {
  it("throws from the list rather than returning an empty array", async () => {
    // AN EMPTY ARRAY WOULD BE THE WRONG FIX and it is worth saying why, because
    // it is the one a hurried patch reaches for. `[]` is a VALID ANSWER that
    // every caller renders as "no requests today" - indistinguishable from a
    // genuinely quiet queue. A throw cannot be mistaken for data by anything.
    await expect(listPendingGuestRequests(ctxFor("therapist"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("throws from the COUNT too, so the badge cannot leak what the list will not", async () => {
    // The count returns no names, which is exactly why it is easy to leave open.
    // It is still an answer to "how many strangers has this clinic collected
    // contact details for", given to a role that may not know the queue exists.
    await expect(countPendingGuestRequests(ctxFor("therapist"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("never reaches the database - the refusal is before any query", async () => {
    // The capability check must precede the read, not filter its output. If the
    // rows were fetched and then discarded they would still have been fetched.
    await expect(listPendingGuestRequests(ctxFor("therapist"))).rejects.toThrow();
    expect(viewerLocationScope).not.toHaveBeenCalled();
  });
});

describe("SEC-01 arm 2 - owner, admin and reception still get their queue", () => {
  for (const role of ["owner", "admin", "reception"] as const) {
    it(`${role} reads the queue`, async () => {
      const out = await listPendingGuestRequests(ctxFor(role));
      expect(out.map((r) => r.id)).toEqual(["g-lv", "g-cb"]);
    });
  }

  it("an UNASSIGNED receptionist is unrestricted, mirroring STAFF-02 and PL-09", async () => {
    // The documented fallback, and a decision rather than an oversight: nobody
    // is locked out mid-onboarding, and assigning a location in Equipa makes the
    // restriction take effect. `viewerLocationScope` returns null for an
    // unassigned staffer, which is what this asserts the module honours.
    viewerLocationScope.mockResolvedValue(null);

    const out = await listPendingGuestRequests(ctxFor("reception"));
    expect(out).toHaveLength(2);
    expect(requestedLocations).toBeNull();
  });

  it("a LOCATED receptionist sees only their own clinic's requests", async () => {
    viewerLocationScope.mockResolvedValue([LV]);

    const out = await listPendingGuestRequests(ctxFor("reception"));
    expect(out.map((r) => r.id)).toEqual(["g-lv"]);
    expect(requestedLocations).toEqual([LV]);
  });

  it("the COUNT is scoped the same way, so the badge cannot disagree with the list", async () => {
    // A badge counting the other clinic's requests, over a list that omits them,
    // is its own defect: reception would open a shorter list than the number
    // promised and have no way to find the difference.
    viewerLocationScope.mockResolvedValue([LV]);

    const n = await countPendingGuestRequests(ctxFor("reception"));
    const list = await listPendingGuestRequests(ctxFor("reception"));
    expect(n).toBe(1);
    expect(n).toBe(list.length);
  });

  it("the owner is NOT location-restricted", async () => {
    viewerLocationScope.mockResolvedValue(null);

    const out = await listPendingGuestRequests(ctxFor("owner"));
    expect(out).toHaveLength(2);
  });
});

/**
 * ==========================================================================
 * SEC-01 arm 3 - the READ gate and the WRITE gate are ONE definition.
 * ==========================================================================
 * `guest-convert.ts` refuses a non-front-desk caller with
 * `{ok:false, error:"forbidden"}`, and it used to do so from a HARDCODED role
 * list while this file's read gate used a capability. Two copies of the same
 * rule drift silently - the failure `bookingLocationScope` documents in its own
 * header for the location scope - and a drift here would mean a role that can
 * SEE the queue but not work it, or worse, work it without seeing it.
 *
 * THE HISTORY IS THE INTERESTING PART. The hardcoded list was DELIBERATE and its
 * comment predicted this defect exactly: "every role holds `patients:write` and
 * `appointments:write`, so a capability gate here would refuse nobody and would
 * READ LIKE A CONTROL WHILE BEING ONE." That is precisely what
 * `appointments:read` was doing on the READ path one file away. The write path
 * saw the trap; the read path walked into it.
 */
describe("SEC-01 arm 3 - convert and read agree, by construction", () => {
  it("the convert actions refuse exactly the role the queue refuses", async () => {
    const { listGuestRequestMatches, convertGuestRequest } = await import(
      "./guest-convert"
    );

    actingRole = "therapist";

    // Refused by BOTH server actions, and the shapes differ on purpose: an
    // action returns `forbidden` to a client component that renders it, while
    // the read THROWS because nothing may mistake its answer for data.
    await expect(listGuestRequestMatches("req-1")).resolves.toMatchObject({
      ok: false,
      error: "forbidden",
    });
    await expect(
      convertGuestRequest("req-1", { kind: "new_patient" }),
    ).resolves.toMatchObject({ ok: false, error: "forbidden" });
    await expect(listPendingGuestRequests(ctxFor("therapist"))).rejects.toThrow();
  });

  it("front desk is NOT refused by either, so the gate is not simply closed", async () => {
    // The half that stops this passing by breaking the feature. A gate that
    // refuses everybody satisfies every assertion above it.
    const { listGuestRequestMatches } = await import("./guest-convert");

    for (const role of ["owner", "admin", "reception"] as const) {
      actingRole = role;
      const out = await listGuestRequestMatches("req-1");
      expect(out).not.toMatchObject({ ok: false, error: "forbidden" });
    }
  });
});
