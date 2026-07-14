import { vi, describe, it, expect, beforeEach } from "vitest";

// W6-04 - the Pacientes eliminados view is OWNER-ONLY, enforced server-side at
// BOTH the query layer (listDeletedPatients asserts patients:recover) and the
// action layer (the wrappers refuse a non-owner before touching the shared
// patient actions). This pins both.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@/lib/patients/actions", () => ({
  restorePatient: vi.fn(async () => ({ id: "p1" })),
  hardDeletePatient: vi.fn(async () => ({ ok: true, id: "p1" })),
}));

import { ForbiddenError } from "@osteojp/auth";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { restorePatient, hardDeletePatient } from "@/lib/patients/actions";
import { listDeletedPatients } from "@/lib/patients/queries";
import { restoreDeletedPatientAction, permanentDeletePatientAction } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockRestore = vi.mocked(restorePatient);
const mockHardDelete = vi.mocked(hardDeletePatient);

const owner: RequestContext = { tenantId: "t-A", role: "owner", userId: "u-owner" };
const admin: RequestContext = { tenantId: "t-A", role: "admin", userId: "u-admin" };
const therapist: RequestContext = { tenantId: "t-A", role: "therapist", userId: "u-th" };

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockRestore.mockReset();
  mockHardDelete.mockReset();
  mockRestore.mockResolvedValue({ id: "p1" } as never);
  mockHardDelete.mockResolvedValue({ ok: true, id: "p1" } as never);
});

describe("listDeletedPatients query-level owner gate (W6-04)", () => {
  it("throws ForbiddenError for a non-owner (admin)", async () => {
    mockCtx.mockResolvedValue(admin);
    await expect(listDeletedPatients()).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError for a therapist", async () => {
    mockCtx.mockResolvedValue(therapist);
    await expect(listDeletedPatients()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("proceeds for the owner", async () => {
    mockCtx.mockResolvedValue(owner);
    mockRunScoped.mockImplementation((_c, cb) => Promise.resolve(cb({} as never)));
    // The tx callback runs a select chain; stub it to return no rows.
    mockRunScoped.mockResolvedValue([]);
    await expect(listDeletedPatients()).resolves.toEqual([]);
  });
});

describe("recover action-level owner gate (W6-04)", () => {
  it("restoreDeletedPatientAction refuses a non-owner without touching restorePatient", async () => {
    mockCtx.mockResolvedValue(admin);
    const r = await restoreDeletedPatientAction("p1");
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it("restoreDeletedPatientAction restores for the owner", async () => {
    mockCtx.mockResolvedValue(owner);
    const r = await restoreDeletedPatientAction("p1");
    expect(r).toEqual({ ok: true });
    expect(mockRestore).toHaveBeenCalledWith("p1");
  });

  it("permanentDeletePatientAction refuses a non-owner without touching hardDeletePatient", async () => {
    mockCtx.mockResolvedValue(therapist);
    const r = await permanentDeletePatientAction("p1", "1234");
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mockHardDelete).not.toHaveBeenCalled();
  });

  it("permanentDeletePatientAction delegates to hardDeletePatient for the owner", async () => {
    mockCtx.mockResolvedValue(owner);
    const r = await permanentDeletePatientAction("p1", "1234");
    expect(r).toEqual({ ok: true, id: "p1" });
    expect(mockHardDelete).toHaveBeenCalledWith("p1", "1234");
  });
});
