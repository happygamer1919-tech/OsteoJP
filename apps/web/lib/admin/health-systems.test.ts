import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * setHealthSystemActive with the database mocked: asking for the state an
 * entry already has (a double click, two tabs) writes nothing and audits
 * nothing; a real change writes one row and one audit entry; an id the caller
 * cannot read is not_found. The RLS side is in health-systems.db.test.ts.
 */

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  current: [] as { active: boolean }[],
  updates: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  caps: [] as string[],
}));

vi.mock("@osteojp/auth", () => ({
  assertCan: (_role: string, cap: string) => {
    H.caps.push(cap);
  },
}));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_ctx: unknown, cb: (tx: unknown) => unknown) =>
    cb({
      select: () => ({ from: () => ({ where: () => ({ for: async () => H.current }) }) }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          H.updates.push(v);
          return { where: () => ({ returning: async () => [{ id: "hs-1" }] }) };
        },
      }),
    }),
  ),
}));

vi.mock("./audit", () => ({
  writeAudit: vi.fn(async (_tx: unknown, _actor: unknown, entry: Record<string, unknown>) => {
    H.audits.push(entry);
  }),
}));

import { setHealthSystemActive } from "./health-systems";

const actor = { tenantId: "tenant-A", role: "admin", userId: "user-1" } as never;

beforeEach(() => {
  H.current = [];
  H.updates = [];
  H.audits = [];
  H.caps = [];
});

describe("setHealthSystemActive", () => {
  it("is gated on settings:manage", async () => {
    H.current = [{ active: true }];
    await setHealthSystemActive(actor, "hs-1", false);
    expect(H.caps).toEqual(["settings:manage"]);
  });

  it("asking for the state it already has writes nothing and audits nothing", async () => {
    H.current = [{ active: true }];
    await setHealthSystemActive(actor, "hs-1", true);
    H.current = [{ active: false }];
    await setHealthSystemActive(actor, "hs-1", false);
    expect(H.updates).toEqual([]);
    expect(H.audits).toEqual([]);
  });

  it("a real change writes one row and one audit entry with the matching action", async () => {
    H.current = [{ active: true }];
    await setHealthSystemActive(actor, "hs-1", false);
    expect(H.updates).toEqual([{ active: false }]);
    expect(H.audits).toEqual([{ action: "health_system.archive", entityType: "health_system", entityId: "hs-1" }]);
    H.current = [{ active: false }];
    await setHealthSystemActive(actor, "hs-1", true);
    expect(H.audits[1]).toEqual({ action: "health_system.restore", entityType: "health_system", entityId: "hs-1" });
  });

  it("an id the caller cannot read is not_found, and nothing is written", async () => {
    H.current = [];
    await expect(setHealthSystemActive(actor, "hs-x", false)).rejects.toMatchObject({ code: "not_found" });
    expect(H.updates).toEqual([]);
    expect(H.audits).toEqual([]);
  });
});
