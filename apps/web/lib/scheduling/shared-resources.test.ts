import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * U6 - tenantSharedResourceIdsFor: the ids "Marcar novamente" needs on screen.
 *
 * A therapist gets the id of every machine listSharedResourcesTx returns (the
 * list the server's create rule reads); owner, admin and reception get
 * undefined, and for them no read is made at all. The database is a fake that
 * answers the machine query and counts the transactions opened.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ transactions: 0 }));

vi.mock("@osteojp/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@osteojp/db")>()),
  sharedResourceSchemaPresent: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    h.transactions += 1;
    return fn({
      execute: async () => [
        { id: "nesa-cb", label: "NESA", location_ids: ["loc-cb"] },
        { id: "nesa-lv", label: "NESA", location_ids: ["loc-lv"] },
      ],
    });
  }),
}));

import type { RequestContext, Role } from "@osteojp/auth";
import { tenantSharedResourceIdsFor } from "./shared-resources";

const ctx = (role: Role): RequestContext => ({ tenantId: "t-1", role, userId: "u-1" });

beforeEach(() => {
  h.transactions = 0;
});

describe("tenantSharedResourceIdsFor (U6)", () => {
  it("a therapist gets the id of every machine in the tenant, in one read", async () => {
    expect(await tenantSharedResourceIdsFor(ctx("therapist"))).toEqual(["nesa-cb", "nesa-lv"]);
    expect(h.transactions).toBe(1);
  });

  it.each(["reception", "admin", "owner"] as const)("%s gets undefined, and no read is made", async (role) => {
    expect(await tenantSharedResourceIdsFor(ctx(role))).toBeUndefined();
    expect(h.transactions).toBe(0);
  });
});
