import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-04 + W4-01 — a therapist's PRIMARY service is the earliest-created
// therapist_services mapping. Setting a primary NEVER issues an UPDATE (append-
// only, 42501): it delete+inserts so the chosen service is the earliest. W4-01
// extends it to ANY active tenant service — a zero-mapping therapist gets a first
// primary, and an unmapped active service is added and made primary. These pin
// that contract, active-service validation, and admin-only gating (real assertCan).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import {
  getTherapistPrimaryServiceId,
  setTherapistPrimaryService,
} from "./therapist-primary-service";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

// A fake tx for setTherapistPrimaryService. Two selects run in order:
//   (1) active-service validation → `.limit(1)` → [{id}] when active, else [];
//   (2) the therapist's mapped services → `.orderBy()` → oldest-first.
// delete/insert are recorded; `update` must stay untouched (42501-safe).
function setPrimaryTx(mapped: string[], { serviceActive = true } = {}) {
  const calls = { deletes: 0, inserts: [] as Array<Record<string, unknown>>, updates: 0 };
  let selectIdx = 0;
  const tx = {
    select: () => {
      const idx = selectIdx++;
      return {
        from: () => ({
          where: () =>
            idx === 0
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
