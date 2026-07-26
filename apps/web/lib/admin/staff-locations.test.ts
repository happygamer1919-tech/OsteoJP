import { vi, describe, it, expect, beforeEach } from "vitest";

// W12-40-Q2 — the staff_locations write layer (#663 shipped it read-only).
// These pin: membership is an exact add/remove diff with cross-tenant id
// rejection; colour is an allowlisted UPDATE that no-ops when unchanged and
// requires an existing membership; both are users:manage-gated (real assertCan)
// and audited. runScoped + writeAudit are stubbed; the drizzle schema + the
// palette allowlist are REAL.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import { locations } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { listStaffLocations, setStaffColor, setStaffLocations } from "./staff-locations";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

// tx for setStaffLocations: two selects branch on the table —
//   from(locations)      → validation, returns the ids that exist in-tenant;
//   from(staffLocations) → the member's current memberships.
// insert/delete are recorded; update must stay untouched.
function setLocsTx(current: string[], validLocationIds: string[]) {
  const calls = {
    inserts: [] as Array<Record<string, unknown>>,
    deletes: 0,
    updates: 0,
  };
  const tx = {
    select: () => ({
      from: (tbl: unknown) => ({
        where: async () =>
          tbl === locations
            ? validLocationIds.map((id) => ({ id }))
            : current.map((locationId) => ({ locationId })),
      }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        calls.inserts.push(v);
      },
    }),
    delete: () => ({
      where: async () => {
        calls.deletes++;
      },
    }),
    update: () => {
      calls.updates++;
      return { set: () => ({ where: async () => {} }) };
    },
  };
  return { tx, calls };
}

// tx for setStaffColor: one select(.limit) returns the membership row (or none).
function setColorTx(found: boolean, currentColor: string | null = null) {
  const calls = { updates: [] as Array<Record<string, unknown>> };
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (found ? [{ id: "sl-1", color: currentColor }] : []),
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        calls.updates.push(v);
        return { where: async () => {} };
      },
    }),
  };
  return { tx, calls };
}

const locOf = (inserts: Array<Record<string, unknown>>) => inserts.map((i) => i.locationId);

beforeEach(() => {
  mockRunScoped.mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("setStaffLocations (W12-40-Q2)", () => {
  it("adds the missing and removes the absent, then audits once", async () => {
    const { tx, calls } = setLocsTx(["loc-a"], ["loc-a", "loc-b"]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setStaffLocations(admin, "ther-1", ["loc-b"]); // drop loc-a, add loc-b

    expect(locOf(calls.inserts)).toEqual(["loc-b"]);
    expect(calls.inserts[0]).toMatchObject({ tenantId: "tenant-A", userId: "ther-1" });
    expect(calls.deletes).toBe(1);
    expect(calls.updates).toBe(0);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("clears all memberships when the wanted set is empty (validation skipped)", async () => {
    const { tx, calls } = setLocsTx(["loc-a"], []);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setStaffLocations(admin, "ther-1", []);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toBe(1);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("is a no-op (no writes, no audit) when the set is unchanged", async () => {
    const { tx, calls } = setLocsTx(["loc-a"], ["loc-a"]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setStaffLocations(admin, "ther-1", ["loc-a"]);

    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toBe(0);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("rejects an unknown / cross-tenant location id (nothing written)", async () => {
    const { tx, calls } = setLocsTx(["loc-a"], []); // loc-x is not a valid tenant location
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(setStaffLocations(admin, "ther-1", ["loc-x"])).rejects.toMatchObject({
      code: "invalid",
    });
    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toBe(0);
  });

  it("refuses a non-admin before any DB work (users:manage gate)", async () => {
    await expect(setStaffLocations(reception, "ther-1", ["loc-a"])).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("setStaffColor (W12-40-Q2)", () => {
  it("sets a valid palette colour on the membership and audits", async () => {
    const { tx, calls } = setColorTx(true, null);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setStaffColor(admin, "ther-1", "loc-a", "forest");

    expect(calls.updates).toEqual([{ color: "forest" }]);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("clears the colour (null) back to the FNV fallback", async () => {
    const { tx, calls } = setColorTx(true, "forest");
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setStaffColor(admin, "ther-1", "loc-a", null);

    expect(calls.updates).toEqual([{ color: null }]);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the colour is unchanged", async () => {
    const { tx, calls } = setColorTx(true, "forest");
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setStaffColor(admin, "ther-1", "loc-a", "forest");

    expect(calls.updates).toHaveLength(0);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a colour outside the W12-21 palette before any DB work", async () => {
    await expect(setStaffColor(admin, "ther-1", "loc-a", "not-a-colour")).rejects.toMatchObject({
      code: "invalid",
    });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("rejects when the member does not belong to that location", async () => {
    const { tx } = setColorTx(false);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(setStaffColor(admin, "ther-1", "loc-a", "forest")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a non-admin before any DB work (users:manage gate)", async () => {
    await expect(setStaffColor(reception, "ther-1", "loc-a", "forest")).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("listStaffLocations (W12-40-Q2)", () => {
  it("groups memberships (+colour) by user, oldest-first", async () => {
    const tx = {
      select: () => ({
        from: () => ({
          orderBy: async () => [
            { userId: "u1", locationId: "l1", color: "forest" },
            { userId: "u1", locationId: "l2", color: null },
            { userId: "u2", locationId: "l1", color: "cyan" },
          ],
        }),
      }),
    };
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const byUser = await listStaffLocations(admin);

    expect(byUser.get("u1")).toEqual([
      { locationId: "l1", color: "forest" },
      { locationId: "l2", color: null },
    ]);
    expect(byUser.get("u2")).toEqual([{ locationId: "l1", color: "cyan" }]);
  });
});
