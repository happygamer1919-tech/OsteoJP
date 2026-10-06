/**
 * R45 - which locations the dialog offers for a MANUAL declaration.
 *
 * The list is the tenant's active locations narrowed by the write scope every
 * booking answers to (bookingLocationScope, STAFF-02). That helper is run here
 * for real, over fake staff_locations, so each role it distinguishes is checked
 * against what it actually returns. generate.test.ts checks the refusal on the
 * same predicate; this list is the courtesy and that refusal is the control.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  /** staff_locations: user id -> the location ids that user is assigned to. */
  staffLocations: {} as Record<string, string[]>,
}));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (actor: { userId: string }, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve((db.staffLocations[actor.userId] ?? []).map((locationId) => ({ locationId }))),
        }),
      }),
    }),
  ),
}));
// The ACTIVE locations of the tenant, as the existing query returns them
// (archived ones are not in it). Named in full: a factory replaces the module.
vi.mock("@/lib/invoices/queries", () => ({ listActiveLocations: vi.fn() }));

import type { RequestContext } from "@osteojp/auth";
import { listActiveLocations } from "@/lib/invoices/queries";
import { listDeclaracaoLocations } from "./declaracao-locations";

const LV = { id: "00000000-0000-4000-8000-0000000000a1", name: "OsteoJP (LV)" };
const CB = { id: "00000000-0000-4000-8000-0000000000a2", name: "OsteoJP (CB)" };
const MN = { id: "00000000-0000-4000-8000-0000000000a3", name: "OsteoJP (Montemor-o-Novo)" };
const ARCHIVED_ID = "00000000-0000-4000-8000-0000000000a4";

const actor = (role: RequestContext["role"], userId = `user-${role}`): RequestContext => ({
  tenantId: "tenant-1",
  role,
  userId,
});

beforeEach(() => {
  db.staffLocations = {};
  vi.mocked(listActiveLocations).mockReset().mockResolvedValue([CB, LV, MN]);
});

describe("listDeclaracaoLocations - the staff member's own active locations, under their stored names", () => {
  it("the owner is offered every active location", async () => {
    db.staffLocations["user-owner"] = [LV.id];
    expect(await listDeclaracaoLocations(actor("owner"))).toEqual([CB, LV, MN]);
  });

  it.each(["therapist", "reception", "admin"] as const)(
    "a %s assigned to ONE location is offered that one only",
    async (role) => {
      db.staffLocations[`user-${role}`] = [CB.id];
      expect(await listDeclaracaoLocations(actor(role))).toEqual([CB]);
    },
  );

  it.each(["therapist", "reception", "admin"] as const)(
    "a %s assigned to two is offered those two, and not the third",
    async (role) => {
      db.staffLocations[`user-${role}`] = [LV.id, CB.id];
      expect(await listDeclaracaoLocations(actor(role))).toEqual([CB, LV]);
    },
  );

  it.each(["therapist", "reception", "admin"] as const)(
    "an UNASSIGNED %s is offered every active location (the scope helper's fallback)",
    async (role) => {
      expect(await listDeclaracaoLocations(actor(role))).toEqual([CB, LV, MN]);
    },
  );

  it("a location with no carimbo is still OFFERED: choosing it is what shows the notice", async () => {
    db.staffLocations["user-reception"] = [MN.id];
    expect(await listDeclaracaoLocations(actor("reception"))).toEqual([MN]);
  });

  it("an assignment to an archived location offers nothing: only active locations are listed", async () => {
    db.staffLocations["user-reception"] = [ARCHIVED_ID];
    expect(await listDeclaracaoLocations(actor("reception"))).toEqual([]);
  });

  it("carries the id and the stored name, and nothing else", async () => {
    vi.mocked(listActiveLocations).mockResolvedValue([{ ...LV, extra: "x" } as never]);
    expect(await listDeclaracaoLocations(actor("owner"))).toEqual([{ id: LV.id, name: "OsteoJP (LV)" }]);
  });
});
