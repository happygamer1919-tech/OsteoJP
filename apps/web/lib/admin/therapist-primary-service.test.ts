import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-04 — a therapist's PRIMARY service is the earliest-created therapist_services
// mapping. Re-designation must NEVER issue an UPDATE against therapist_services
// (append-only, UPDATE 42501-throws): it delete+inserts the OTHER mapped rows so
// the chosen service becomes the earliest. These tests pin that contract, the
// tenant-scoped read, mapped-only validation, and admin-only gating (real
// assertCan, not a stub).

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

// A fake tx for setTherapistPrimaryService: the ordered select returns `mapped`
// (oldest-first), and delete/insert/update are recorded. `update` must stay
// untouched — that is the 42501-safe guarantee.
function setPrimaryTx(mapped: string[]) {
  const calls = { deletes: 0, inserts: [] as Array<Record<string, unknown>>, updates: 0 };
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => mapped.map((serviceId) => ({ serviceId })) }),
      }),
    }),
    delete: () => ({ where: async () => { calls.deletes++; } }),
    insert: () => ({ values: async (v: Record<string, unknown>) => { calls.inserts.push(v); } }),
    update: () => { calls.updates++; return { set: () => ({ where: async () => {} }) }; },
  };
  return { tx, calls };
}

beforeEach(() => {
  mockRunScoped.mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("setTherapistPrimaryService (W3-04)", () => {
  it("re-designates by delete+insert of the OTHER mapped rows — never UPDATE", async () => {
    const { tx, calls } = setPrimaryTx(["svc-a", "svc-b"]); // a is currently primary (oldest)
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistPrimaryService(admin, "ther-1", "svc-b");

    // Only the non-chosen service (svc-a) is bumped; svc-b is left untouched.
    expect(calls.updates).toBe(0); // <-- no UPDATE against therapist_services
    expect(calls.deletes).toBe(1);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toMatchObject({
      tenantId: "tenant-A",
      therapistUserId: "ther-1",
      serviceId: "svc-a",
    });
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the chosen service is already primary (earliest)", async () => {
    const { tx, calls } = setPrimaryTx(["svc-a", "svc-b"]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await setTherapistPrimaryService(admin, "ther-1", "svc-a"); // already earliest

    expect(calls.deletes).toBe(0);
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toBe(0);
  });

  it("rejects a service the therapist is not mapped to", async () => {
    const { tx } = setPrimaryTx(["svc-a", "svc-b"]);
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
