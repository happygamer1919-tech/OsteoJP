import { vi, describe, it, expect, beforeEach } from "vitest";

// W5-08 — hardDeletePatient: admin-only (settings:manage), server-verified scrypt
// password gate, clinical-records refuse guard (permanent), other-references
// refuse guard, child-first delete (patient_locations, then patients) with a
// PII-free audit row. The real `can` matrix is exercised so the admin-only gate
// is genuinely tested; the password check and DB are mocked. No secret or hash
// is ever asserted on or printed — only the boolean gate outcome.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({
  verifyDeletePassword: vi.fn(),
}));

import { patientLocations, patients } from "@osteojp/db";
import { requireRequestContext, runScoped } from "../auth/context";
import { writeAudit } from "./audit";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { hardDeletePatient } from "./actions";
import type { RequestContext } from "../auth/context";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockVerify = vi.mocked(verifyDeletePassword);
const mockAudit = vi.mocked(writeAudit);

const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

const TARGET = { id: "patient-1", patientNumber: 42, deletedAt: null as Date | null };

// Thenable that also exposes .limit (snapshot uses .limit(1); counts await where()).
function q(rows: unknown[]) {
  return {
    limit: async () => rows,
    then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows).then(res, rej),
  };
}

function makeTx(opts: {
  target?: typeof TARGET | null;
  records?: number;
  // total of the 9 other-reference counts (one bucket is enough to prove refuse)
  references?: number;
  patientDeleted?: { id: string }[];
}) {
  const { target = TARGET, records = 0, references = 0 } = opts;
  // Select order inside hardDeletePatient:
  //   1. snapshot (.limit)
  //   2. clinical_records count
  //   3..11. the 9 other-reference counts (Promise.all)
  const selectQueue: unknown[][] = [
    target ? [target] : [], // snapshot
    [{ n: records }], // clinical_records
    [{ n: references }], // clinicalEpisodes — the rest default to 0
  ];
  let si = 0;
  const stats = { deleteOrder: [] as string[] };
  const tx = {
    select: () => ({
      from: () => ({ where: () => q(selectQueue[si++] ?? [{ n: 0 }]) }),
    }),
    delete: (table: unknown) => {
      const tag =
        table === patientLocations ? "patient_locations" : table === patients ? "patients" : "other";
      stats.deleteOrder.push(tag);
      const rows = tag === "patients" ? (opts.patientDeleted ?? [{ id: target?.id }]) : [];
      return { where: () => ({ returning: async () => rows }) };
    },
  };
  return { tx, stats };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockVerify.mockReset();
  mockAudit.mockReset();
  mockCtx.mockResolvedValue(admin);
});

describe("hardDeletePatient (W5-08)", () => {
  it("refuses a non-admin (settings:manage gate) before any password / DB work", async () => {
    mockCtx.mockResolvedValue(reception);
    const r = await hardDeletePatient("patient-1", "1234");
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("refuses blank input before touching the password gate", async () => {
    const r = await hardDeletePatient("", "");
    expect(r).toEqual({ ok: false, error: "validation" });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("refuses a WRONG password — gate fails, no DB work, patient untouched", async () => {
    mockVerify.mockResolvedValue(false);
    const r = await hardDeletePatient("patient-1", "definitely-not-it");
    expect(r).toEqual({ ok: false, error: "password" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("allows a CORRECT password (clean patient) — deletes child-first with a PII-free audit row", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({});
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeletePatient("patient-1", "correct-horse");
    expect(r).toEqual({ ok: true, id: "patient-1" });

    // Child junction FIRST, then the parent patient row.
    expect(stats.deleteOrder).toEqual(["patient_locations", "patients"]);

    // Exactly one PII-free audit row: ids + patient number + a flag only.
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][2];
    expect(entry.action).toBe("patient.hard_delete");
    expect(entry.entityId).toBe("patient-1");
    expect(entry.metadata).toEqual({ patientNumber: 42, wasSoftDeleted: false });
    // No name / NIF / contact smuggled into the audit blob (rule 7).
    const blob = JSON.stringify(entry.metadata);
    expect(blob.toLowerCase()).not.toContain("name");
    expect(blob.toLowerCase()).not.toContain("nif");
  });

  it("REFUSES a patient with a linked clinical record even with the CORRECT password — nothing deleted", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({ records: 1 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeletePatient("patient-1", "correct-horse");
    expect(r).toEqual({ ok: false, error: "has_clinical_records" });
    expect(stats.deleteOrder).toEqual([]); // guard fired before any delete
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("REFUSES a patient with other linked data (appointments/invoices/…) even with the CORRECT password", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({ references: 3 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeletePatient("patient-1", "correct-horse");
    expect(r).toEqual({ ok: false, error: "has_references" });
    expect(stats.deleteOrder).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("returns not_found for a missing / cross-tenant patient (RLS = 0 rows)", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx } = makeTx({ target: null });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeletePatient("ghost", "correct-horse");
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
