import { vi, describe, it, expect, beforeEach } from "vitest";

// W4-06 — the consent gate is SERVER-ENFORCED: startConsultationAction refuses
// to proceed (and writes nothing) unless consent === true, regardless of the
// client. These pin that, the role gate, patient existence, and the stub
// create+validate delegation. Node env — deps mocked.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn(), runScoped: vi.fn() }));
vi.mock("@osteojp/auth", () => ({ can: vi.fn() }));
vi.mock("@/lib/patients/actions", () => ({ createPatient: vi.fn() }));
vi.mock("@/lib/patients/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@osteojp/db", () => ({ patients: { id: "patients.id" } }));
// actions.ts now imports the W4-08 signer; stub it so this W4-06 test stays unit-scoped.
vi.mock("@/lib/consultation/audio-storage", () => ({
  signAudioUpload: vi.fn(),
  AudioStorageConfigError: class extends Error {},
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { can } from "@osteojp/auth";
import { createPatient } from "@/lib/patients/actions";
import { writeAudit } from "@/lib/patients/audit";
import { createStubPatientAction, startConsultationAction } from "./actions";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockCan = vi.mocked(can);
const mockCreatePatient = vi.mocked(createPatient);
const mockWriteAudit = vi.mocked(writeAudit);

const ctx = { tenantId: "t1", role: "therapist" as const, userId: "u1" };
const txReturning = (rows: Array<{ id: string }>) => ({
  select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(ctx);
  mockCan.mockReturnValue(true);
  mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([{ id: "pat-1" }]) as never));
});

describe("startConsultationAction — server-enforced consent gate", () => {
  it("rejects consent_required and writes NOTHING when consent is false", async () => {
    const r = await startConsultationAction({ patientId: "pat-1", consent: false });
    expect(r).toEqual({ ok: false, error: "consent_required" });
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("forbids a non-authoring role (reception/admin) before any DB work", async () => {
    mockCan.mockReturnValue(false);
    const r = await startConsultationAction({ patientId: "pat-1", consent: true });
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("with consent + existing patient → writes the PII-free consent audit and returns ok", async () => {
    const r = await startConsultationAction({ patientId: "pat-1", consent: true });
    expect(r).toEqual({ ok: true });
    expect(mockWriteAudit).toHaveBeenCalledTimes(1);
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      expect.objectContaining({ action: "patient.recording_consent", entityId: "pat-1" }),
    );
  });

  it("returns not_found when the patient does not exist in the tenant", async () => {
    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([]) as never));
    const r = await startConsultationAction({ patientId: "ghost", consent: true });
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });
});

describe("createStubPatientAction", () => {
  it("creates a stub via createPatient (name required, phone optional) and returns the id", async () => {
    mockCreatePatient.mockResolvedValue({ id: "new-pat" } as never);
    const r = await createStubPatientAction({ fullName: "Ana", phone: null });
    expect(r).toEqual({ ok: true, patientId: "new-pat" });
    expect(mockCreatePatient).toHaveBeenCalledWith({ fullName: "Ana", phone: null });
  });

  it("surfaces a validation error when the name is empty (createPatient throws)", async () => {
    const err = Object.assign(new Error("fullName is required"), { name: "ValidationError" });
    mockCreatePatient.mockRejectedValue(err);
    const r = await createStubPatientAction({ fullName: "  " });
    expect(r).toEqual({ ok: false, error: "validation" });
  });
});
