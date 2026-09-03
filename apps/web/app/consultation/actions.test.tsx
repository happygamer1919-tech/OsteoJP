import { vi, describe, it, expect, beforeEach } from "vitest";

// W4-06 — the consent gate is SERVER-ENFORCED: startConsultationAction refuses
// to proceed (and writes nothing) unless consent === true, regardless of the
// client. These pin that, the role gate, patient existence, and the stub
// create+validate delegation. Node env — deps mocked.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn(), runScoped: vi.fn() }));
vi.mock("@osteojp/auth", () => ({ can: vi.fn() }));
// PL-31 — the stub path deliberately goes through createStubPatient, NOT
// createPatient: a NIF is mandatory to create a ficha, and routing the
// walk-in quick-create through the normal path blocked start-consultation
// entirely (caught by CI on the first PL-31 run).
vi.mock("@/lib/patients/actions", () => ({ createStubPatient: vi.fn() }));
vi.mock("@/lib/patients/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@osteojp/db", () => ({ patients: { id: "patients.id" } }));
// actions.ts imports the W4-08 signer + W4-09 webhook; stub them so this test
// stays unit-scoped.
vi.mock("@/lib/consultation/audio-storage", () => ({
  AUDIO_FILENAME: "consultation.webm",
  signAudioUpload: vi.fn(),
  signAudioDownload: vi.fn(),
  AudioStorageConfigError: class extends Error {},
}));
// buildM1Payload is the REAL one — a stub that spread its input would not have
// caught the two fields 0064 adds, nor a frozen field going missing.
vi.mock("@/lib/consultation/m1-webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/consultation/m1-webhook")>()),
  fireM1Webhook: vi.fn(),
}));
// 0064 — the persistence seam. Mocked so this stays unit-scoped; it is the same
// module fire-attempt writes the outcome through, so the marks are visible here.
vi.mock("@/lib/consultation/consultation-store", () => ({
  persistConsultation: vi.fn(),
  markDelivered: vi.fn(),
  markPending: vi.fn(),
  markNeedsAttention: vi.fn(),
  SCAN_LIMIT: 100,
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { can } from "@osteojp/auth";
import { createStubPatient } from "@/lib/patients/actions";
import { writeAudit } from "@/lib/patients/audit";
import { signAudioDownload } from "@/lib/consultation/audio-storage";
import { fireM1Webhook } from "@/lib/consultation/m1-webhook";
import {
  markDelivered,
  markPending,
  persistConsultation,
} from "@/lib/consultation/consultation-store";
import {
  createStubPatientAction,
  fireConsultationWebhookAction,
  startConsultationAction,
} from "./actions";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockCan = vi.mocked(can);
const mockCreatePatient = vi.mocked(createStubPatient);
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
  it("creates a stub via createStubPatient (name required, phone optional) and returns the id", async () => {
    mockCreatePatient.mockResolvedValue({ ok: true, patient: { id: "new-pat" } } as never);
    const r = await createStubPatientAction({ fullName: "Ana", phone: null });
    expect(r).toEqual({ ok: true, patientId: "new-pat" });
    expect(mockCreatePatient).toHaveBeenCalledWith({ fullName: "Ana", phone: null });
  });

  // INC-nif-validationerror-at-the-desk: the empty name is now RETURNED by
  // createStubPatient, not thrown out of it. The action's job changed with it -
  // it reads a result instead of catching an exception.
  it("surfaces a validation error when the name is empty (createStubPatient REFUSES)", async () => {
    mockCreatePatient.mockResolvedValue({
      ok: false,
      error: { field: "fullName", message: "fullName is required" },
    } as never);
    const r = await createStubPatientAction({ fullName: "  " });
    expect(r).toEqual({ ok: false, error: "validation", message: "fullName is required" });
  });

  // THE SENTENCE IS CARRIED, and this is the assertion that says why the shape
  // changed at all: the caller has one box and needs the words, not a code.
  it("carries the refusal MESSAGE through, rather than collapsing it to a code", async () => {
    mockCreatePatient.mockResolvedValue({
      ok: false,
      error: { field: "nif", message: "NIF inválido: o dígito de controlo não confere." },
    } as never);
    const r = await createStubPatientAction({ fullName: "Ana" });
    expect(r).toEqual({
      ok: false,
      error: "validation",
      message: "NIF inválido: o dígito de controlo não confere.",
    });
  });

  // THE THROWING ARM IS KEPT AND STILL MEANS WHAT IT MEANT. A role failure, or
  // any exception from a path that has not been converted, must not be reported
  // to the therapist as something they typed wrong.
  it("a THROWN non-validation failure is still forbidden, not validation", async () => {
    mockCreatePatient.mockRejectedValue(new Error("permission denied"));
    const r = await createStubPatientAction({ fullName: "Ana" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("fireConsultationWebhookAction (W4-09, + 0064 persist-before-fire)", () => {
  const mockSignDownload = vi.mocked(signAudioDownload);
  const mockFire = vi.mocked(fireM1Webhook);
  const mockPersist = vi.mocked(persistConsultation);
  const OK_INPUT = {
    objectKey: "t1/p1/ts/consultation.webm",
    patientId: "p1",
    consultationStartedAt: "2026-07-07T01:00:00.000Z",
    consultationEndedAt: "2026-07-07T01:30:00.000Z",
  };

  beforeEach(() => {
    mockCtx.mockResolvedValue(ctx); // tenantId: "t1"
    mockCan.mockReturnValue(true);
    mockSignDownload.mockResolvedValue("https://s3/get?sig");
    mockFire.mockResolvedValue({ ok: true, status: 200 });
    mockPersist.mockResolvedValue({ id: "c-1", attemptCount: 0, fireStatus: "pending" });
  });

  it("forbids a non-authoring role, and writes nothing", async () => {
    mockCan.mockReturnValue(false);
    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(mockFire).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("rejects an object key not prefixed by the caller's tenant (forged), and writes nothing", async () => {
    await expect(
      fireConsultationWebhookAction({ ...OK_INPUT, objectKey: "OTHER-TENANT/p1/ts/consultation.webm" }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(mockFire).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("validates required fields", async () => {
    await expect(
      fireConsultationWebhookAction({ ...OK_INPUT, consultationEndedAt: "" }),
    ).resolves.toEqual({ ok: false, error: "validation" });
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("signs a 1h GET and fires the webhook → ok", async () => {
    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({ ok: true });
    expect(mockSignDownload).toHaveBeenCalledWith("t1/p1/ts/consultation.webm", 3600);
    expect(mockFire).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markDelivered)).toHaveBeenCalledWith("c-1", 1, expect.any(Date));
  });

  // ---- 0064 ----------------------------------------------------------------

  it("PERSISTS BEFORE IT FIRES, with the tenant and doctor from the JWT", async () => {
    // The ordering IS the fix. Firing first and persisting after would lose the
    // consultation on exactly the crash this card exists for.
    await fireConsultationWebhookAction(OK_INPUT);

    expect(mockPersist).toHaveBeenCalledWith({
      tenantId: "t1", // JWT, never the payload
      patientId: "p1",
      doctorId: "u1", // JWT, never client-supplied
      audioObjectKey: "t1/p1/ts/consultation.webm",
      consultationStartedAt: "2026-07-07T01:00:00.000Z",
      consultationEndedAt: "2026-07-07T01:30:00.000Z",
    });
    expect(mockPersist.mock.invocationCallOrder[0]).toBeLessThan(
      mockFire.mock.invocationCallOrder[0],
    );
  });

  it("a failed fire returns `pending` with the row id — the retry has something to find", async () => {
    mockFire.mockResolvedValue({ ok: false, status: 500 });
    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({
      ok: false,
      error: "pending",
      consultationId: "c-1",
    });
    expect(vi.mocked(markPending)).toHaveBeenCalledWith("c-1", 1, expect.any(Date), "http_500");
  });

  it("A FAILED PERSIST IS `not_persisted`, NOT `pending`, and never fires", async () => {
    // The distinction the client copy depends on. Collapsing this into the
    // pending branch is what made "O processamento será retomado" a promise
    // nothing kept: there is no row here, so nothing will ever retry it.
    mockPersist.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({
      ok: false,
      error: "not_persisted",
    });
    expect(mockFire).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("409 from the partner is delivered, not an error", async () => {
    mockFire.mockResolvedValue({ ok: false, status: 409 });
    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({ ok: true });
    expect(vi.mocked(markDelivered)).toHaveBeenCalledWith("c-1", 1, expect.any(Date));
  });

  it("a double submit for an already-delivered consultation does not re-fire", async () => {
    mockPersist.mockResolvedValue({ id: "c-1", attemptCount: 1, fireStatus: "fired" });
    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({ ok: true });
    expect(mockFire).not.toHaveBeenCalled();
  });

  it("the M1 payload carries consultation_id and attempt beside the seven frozen fields", async () => {
    await fireConsultationWebhookAction(OK_INPUT);
    expect(mockFire).toHaveBeenCalledWith({
      audio_url: "https://s3/get?sig",
      audio_filename: "consultation.webm",
      patient_id: "p1",
      doctor_id: "u1",
      consultation_started_at: "2026-07-07T01:00:00.000Z",
      consultation_ended_at: "2026-07-07T01:30:00.000Z",
      template: "osteopathy",
      consultation_id: "c-1",
      attempt: 1,
    });
  });
});
