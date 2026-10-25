import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-04 + W4-01 — a therapist's PRIMARY service is the earliest-created
// therapist_services mapping. Setting a primary NEVER issues an UPDATE (append-
// only, 42501): it delete+inserts so the chosen service is the earliest. W4-01
// extends it to ANY active tenant service — a zero-mapping therapist gets a first
// primary, and an unmapped active service is added and made primary. These pin
// that contract, active-service validation, and admin-only gating (real assertCan).

vi.mock("server-only", () => ({}));
// PL-09 Phase 4: the location guard is a no-op here (owner / unassigned
// admin); the scoped cases run against a real database in
// staff-scope-saves.db.test.ts.
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null),
  resolveViewerLocationIds: vi.fn(async () => []),
}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import {
  getTherapistPrimaryServiceId,
  setTherapistPrimaryService,
  setTherapistServices,
} from "./therapist-primary-service";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

// A fake tx for setTherapistPrimaryService. Three selects run in order:
//   (0) the member lock → `.for("no key update")` → [{id}] (Q-M review);
//   (1) active-service validation → `.limit(1)` → [{id}] when active, else [];
//   (2) the therapist's mapped services → `.orderBy()` → oldest-first.
// delete/insert are recorded; `update` must stay untouched (42501-safe).
function setPrimaryTx(mapped: string[], { serviceActive = true } = {}) {
  const calls = { deletes: 0, inserts: [] as Array<Record<string, unknown>>, updates: 0, locks: [] as unknown[] };
  let selectIdx = 0;
  const tx = {
    select: () => {
      const idx = selectIdx++;
      return {
        from: () => ({
          where: () =>
            idx === 0
              ? { for: async (mode: unknown) => { calls.locks.push(mode); return [{ id: "ther-1" }]; } }
              : idx === 1
                ? { limit: async () => (serviceActive ? [{ id: "svc" }] : []) }
                : { orderBy: async () => mapped.map((serviceId) => ({ serviceId })) },
        }),
      };
    },
    delete: () => ({ where: async () => { calls.deletes++; } }),
    insert: () => ({ values: async (v: Record<string, unknown>) => { calls.inserts.push(v); } }),
    update: () => { calls.updates++; return { set: () => ({ where: async () => {} }) }; },
  };
  return { tx, calls };
}

const serviceIdsOf = (inserts: Array<Record<string, unknown>>) => inserts.map((i) => i.serviceId);

beforeEach(() => {
  mockRunScoped.mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("setTherapistPrimaryService (W3-04 + W4-01)", () => {
  it("re-designates via delete+insert (primary first), NEVER UPDATE", async () => {
    const { tx, calls } = setPrimaryTx(["svc-a", "svc-b"]); // a currently primary (oldest)
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistPrimaryService(admin, "ther-1", "svc-b");

    expect(calls.updates).toBe(0); // <-- no UPDATE against therapist_services
    expect(calls.deletes).toBe(1); // delete-all, then re-insert in order
    expect(serviceIdsOf(calls.inserts)).toEqual(["svc-b", "svc-a"]); // chosen first
    expect(calls.inserts[0]).toMatchObject({ tenantId: "tenant-A", therapistUserId: "ther-1" });
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(calls.locks).toEqual(["no key update"]); // the member row is locked first
  });

  it("zero-mapping therapist: INSERT the first service, becomes primary (no delete, no UPDATE)", async () => {
    const { tx, calls } = setPrimaryTx([]); // no existing mappings (Catarina-Vieira case)
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistPrimaryService(admin, "ther-1", "svc");

    expect(calls.deletes).toBe(0); // nothing to delete
    expect(serviceIdsOf(calls.inserts)).toEqual(["svc"]);
    expect(calls.updates).toBe(0);
  });

  it("adds an unmapped active service and makes it primary", async () => {
    const { tx, calls } = setPrimaryTx(["svc-a"]); // has svc-a; assign a NEW one
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistPrimaryService(admin, "ther-1", "svc");

    expect(calls.deletes).toBe(1);
    expect(serviceIdsOf(calls.inserts)).toEqual(["svc", "svc-a"]); // new one first = primary
    expect(calls.updates).toBe(0);
  });

  it("is a no-op when the chosen service is already primary (earliest)", async () => {
    const { tx, calls } = setPrimaryTx(["svc", "svc-b"]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistPrimaryService(admin, "ther-1", "svc"); // already earliest

    expect(calls.deletes).toBe(0);
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toBe(0);
  });

  it("rejects an inactive / forged service id", async () => {
    const { tx } = setPrimaryTx(["svc-a"], { serviceActive: false });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(
      setTherapistPrimaryService(admin, "ther-1", "svc-x"),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses a non-admin (users:manage gate, server-enforced)", async () => {
    await expect(
      setTherapistPrimaryService(reception, "ther-1", "svc-b"),
    ).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled(); // rejected before any DB work
  });
});

describe("getTherapistPrimaryServiceId (W3-04)", () => {
  it("returns the earliest mapped service (the primary)", async () => {
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit: async () => [{ serviceId: "svc-a" }] }) }),
        }),
      }),
    };
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(getTherapistPrimaryServiceId(admin, "ther-1")).resolves.toBe("svc-a");
  });

  it("returns null when the therapist has no mapped service", async () => {
    const tx = {
      select: () => ({
        from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
      }),
    };
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(getTherapistPrimaryServiceId(admin, "ther-1")).resolves.toBeNull();
  });
});

// Q-M (owner ruling, 2026-10-20): reception ticks SEVERAL services per
// therapist. The patient app offers a therapist only for a mapped service; the
// staff agenda preselects the PRIMARY (earliest row) and must not move. A fake
// tx for setTherapistServices. Three selects run in order:
//   (0) the member lock → `.for("no key update")` → [{id}], or [] for a member this
//       actor cannot see;
//   (1) the therapist's mapped services → `.orderBy()` → oldest-first;
//   (2) the tenant's ACTIVE services → awaited straight off `.where()`.
// Inserts record their values and whether they carried onConflictDoNothing.
function setServicesTx(mapped: string[], active: string[], { memberVisible = true } = {}) {
  const calls = {
    deletes: 0,
    inserts: [] as Array<Record<string, unknown>>,
    onConflictDoNothing: 0,
    updates: 0,
    locks: [] as unknown[],
  };
  let selectIdx = 0;
  const tx = {
    select: () => {
      const idx = selectIdx++;
      return {
        from: () => ({
          where: () =>
            idx === 0
              ? { for: async (mode: unknown) => { calls.locks.push(mode); return memberVisible ? [{ id: "ther-1" }] : []; } }
              : idx === 1
                ? { orderBy: async () => mapped.map((serviceId) => ({ serviceId })) }
                : Promise.resolve(active.map((id) => ({ id }))),
        }),
      };
    },
    delete: () => ({ where: async () => { calls.deletes++; } }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        calls.inserts.push(v);
        return { onConflictDoNothing: async () => { calls.onConflictDoNothing++; } };
      },
    }),
    update: () => { calls.updates++; return { set: () => ({ where: async () => {} }) }; },
  };
  return { tx, calls };
}

const ACTIVE = ["svc-primary", "svc-b", "svc-c", "svc-d"];

describe("setTherapistServices (Q-M): several services, the primary never moves", () => {
  it("ticking several services INSERTS each new one and never touches the primary row", async () => {
    const { tx, calls } = setServicesTx(["svc-primary"], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistServices(admin, "ther-1", ["svc-b", "svc-c"]);

    expect(calls.deletes).toBe(0); // the primary row is not deleted and re-inserted
    expect(calls.updates).toBe(0);
    expect(serviceIdsOf(calls.inserts)).toEqual(["svc-b", "svc-c"]);
    expect(serviceIdsOf(calls.inserts)).not.toContain("svc-primary");
    // A double submit is a no-op on the unique key, never an error.
    expect(calls.onConflictDoNothing).toBe(2);
    expect(calls.locks).toEqual(["no key update"]);
    expect(calls.inserts[0]).toMatchObject({ tenantId: "tenant-A", therapistUserId: "ther-1" });
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      admin,
      expect.objectContaining({
        action: "therapist.services.set",
        metadata: { added: 2, removed: 0, total: 3 },
      }),
    );
  });

  it("unticking a service DELETES that row only; the primary survives a post that omits it", async () => {
    // The primary checkbox is disabled, so a real post never carries it.
    const { tx, calls } = setServicesTx(["svc-primary", "svc-b", "svc-c"], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistServices(admin, "ther-1", ["svc-c"]);

    expect(calls.deletes).toBe(1); // svc-b only
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toBe(0);
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      admin,
      expect.objectContaining({ metadata: { added: 0, removed: 1, total: 2 } }),
    );
  });

  it("an empty post removes every ticked extra and still keeps the primary", async () => {
    const { tx, calls } = setServicesTx(["svc-primary", "svc-b"], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistServices(admin, "ther-1", []);

    expect(calls.deletes).toBe(1);
    expect(calls.inserts).toHaveLength(0);
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      admin,
      expect.objectContaining({ metadata: { added: 0, removed: 1, total: 1 } }),
    );
  });

  it("is a no-op (no write, no audit) when nothing changed", async () => {
    const { tx, calls } = setServicesTx(["svc-primary", "svc-b"], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistServices(admin, "ther-1", ["svc-b", "svc-primary"]);

    expect(calls.deletes).toBe(0);
    expect(calls.inserts).toHaveLength(0);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("a mapping to an ARCHIVED service is not on the form, so it is kept", async () => {
    const { tx, calls } = setServicesTx(["svc-primary", "svc-archived"], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistServices(admin, "ther-1", ["svc-b"]);

    expect(calls.deletes).toBe(0);
    expect(serviceIdsOf(calls.inserts)).toEqual(["svc-b"]);
  });

  it("refuses a therapist with no primary yet (the primary is chosen first, deliberately)", async () => {
    const { tx, calls } = setServicesTx([], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(setTherapistServices(admin, "ther-1", ["svc-b"])).rejects.toMatchObject({
      code: "invalid",
    });
    expect(calls.inserts).toHaveLength(0);
  });

  it("refuses an inactive or forged service id, writing nothing", async () => {
    const { tx, calls } = setServicesTx(["svc-primary"], ACTIVE);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(
      setTherapistServices(admin, "ther-1", ["svc-b", "svc-forged"]),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toBe(0);
  });

  it("refuses every role without users:manage (reception, therapist), before any DB work", async () => {
    const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "ther-1" };
    for (const actor of [reception, therapist]) {
      await expect(setTherapistServices(actor, "ther-1", ["svc-b"])).rejects.toThrow();
    }
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("refuses a member this actor cannot see (another tenant's id), writing nothing", async () => {
    const { tx, calls } = setServicesTx(["svc-primary"], ACTIVE, { memberVisible: false });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(setTherapistServices(admin, "ther-x", ["svc-b"])).rejects.toMatchObject({
      code: "not_found",
    });
    expect(calls.inserts).toHaveLength(0);
    expect(calls.deletes).toBe(0);
  });
});
