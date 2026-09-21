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
// PL-34 — the stub now resolves the clinic it is filed at before it creates
// anything. Mocked here because this file is unit-scoped and `runScoped` above
// is a fake; the REAL resolution is asserted against a real database in
// lib/patients/create-location-link.db.test.ts, where the answer is a row.
vi.mock("@/lib/auth/viewer-locations", () => ({ bookingLocationScope: vi.fn() }));
vi.mock("@/lib/patients/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@osteojp/db", () => ({ patients: { id: "patients.id" } }));
// actions.ts imports the W4-08 signer + W4-09 webhook; stub them so this test
// stays unit-scoped.
// importOriginal keeps AUDIO_FILENAME and the REAL AudioStorageConfigError.
// AUDIO_FILENAME reaches the payload assertion below through the UNMOCKED
// fire-attempt.ts, and fire-attempt.ts:137 does `e instanceof
// AudioStorageConfigError` — a look-alike stub would answer that wrongly. Only
// the two network functions are stubbed. Same shape the m1-webhook mock below
// already uses.
vi.mock("@/lib/consultation/audio-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/consultation/audio-storage")>()),
  signAudioUpload: vi.fn(),
  signAudioDownload: vi.fn(),
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
import { bookingLocationScope } from "@/lib/auth/viewer-locations";
import { writeAudit } from "@/lib/patients/audit";
import { signAudioDownload, signAudioUpload } from "@/lib/consultation/audio-storage";
import { fireM1Webhook } from "@/lib/consultation/m1-webhook";
import {
  markDelivered,
  markPending,
  persistConsultation,
} from "@/lib/consultation/consultation-store";
import {
  createStubPatientAction,
  fireConsultationWebhookAction,
  signAudioUploadAction,
  startConsultationAction,
} from "./actions";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockCan = vi.mocked(can);
const mockCreatePatient = vi.mocked(createStubPatient);
const mockBookingScope = vi.mocked(bookingLocationScope);
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
  // The default principal is a therapist assigned to exactly one clinic — PL-14's
  // "fixed" case, and the one every existing assertion below was written under.
  mockBookingScope.mockResolvedValue(["loc-1"]);
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
    // PL-34 — the clinic is part of the call now. A stub created without one
    // lands with primary_location_id NULL and is invisible to every located
    // reception and admin until an appointment exists.
    expect(mockCreatePatient).toHaveBeenCalledWith({
      fullName: "Ana",
      phone: null,
      primaryLocationId: "loc-1",
    });
  });

  // PL-34 — the three answers `scopedLocationId` gives, at this seam. The
  // database-level proof is in create-location-link.db.test.ts; these pin that
  // the ACTION asks the write scope rather than trusting its input.
  it("a single-clinic therapist's own clinic wins over anything the browser sends", async () => {
    mockCreatePatient.mockResolvedValue({ ok: true, patient: { id: "new-pat" } } as never);
    await createStubPatientAction({ fullName: "Ana", locationId: "loc-forged" });
    expect(mockCreatePatient).toHaveBeenCalledWith(
      expect.objectContaining({ primaryLocationId: "loc-1" }),
    );
  });

  it("a multi-clinic therapist's answer is honoured only from their own set", async () => {
    mockCreatePatient.mockResolvedValue({ ok: true, patient: { id: "new-pat" } } as never);
    mockBookingScope.mockResolvedValue(["loc-1", "loc-2"]);

    await createStubPatientAction({ fullName: "Ana", locationId: "loc-2" });
    expect(mockCreatePatient).toHaveBeenLastCalledWith(
      expect.objectContaining({ primaryLocationId: "loc-2" }),
    );

    await createStubPatientAction({ fullName: "Ana", locationId: "loc-elsewhere" });
    expect(mockCreatePatient).toHaveBeenLastCalledWith(
      expect.objectContaining({ primaryLocationId: null }),
    );
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
    // The scoped patient read answers with the id OK_INPUT's object key is built
    // from. Without this the suite inherits the outer default ("pat-1") while
    // OK_INPUT's key is "t1/p1/...", so every tenant+patient key assertion below
    // would be comparing against a folder no test here means.
    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([{ id: "p1" }]) as never));
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

  // ---- THE PATIENT IS THE SERVER'S ANSWER ---------------------------------
  //
  // Everything past the checks above runs on the service-role handle and sends
  // the id to a third party, so these tests pin that the read happens first and
  // that its answer is the value used from there down.

  it("refuses a patient the scoped read does not return — nothing persisted, nothing fired, nothing signed", async () => {
    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([]) as never));

    await expect(
      fireConsultationWebhookAction({ ...OK_INPUT, patientId: "not-my-patient" }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });

    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockFire).not.toHaveBeenCalled();
    expect(mockSignDownload).not.toHaveBeenCalled();
  });

  it("the forged patient id is refused and a legitimate consultation in the SAME run still fires", async () => {
    // Both arms in one body: the refusal has to be a decision about THIS
    // patient, not a blanket failure that would also stop real recordings.
    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([]) as never));
    await expect(
      fireConsultationWebhookAction({ ...OK_INPUT, patientId: "not-my-patient" }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(mockPersist).not.toHaveBeenCalled();

    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([{ id: "p1" }]) as never));
    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({ ok: true });
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledWith(expect.objectContaining({ patientId: "p1" }));
  });

  it("A FAULT IN THE SCOPED READ RESOLVES AS not_persisted, IT NEVER REJECTS", async () => {
    // The client awaits this action directly, so a rejection has no UI: the
    // recorder stays on "firing" with the audio already uploaded and no row
    // behind it. Every exit has to be a member of the result union, and
    // `not_persisted` is the true one - nothing written, nothing to re-fire.
    mockRunScoped.mockRejectedValue(new Error("connection terminated"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fireConsultationWebhookAction(OK_INPUT)).resolves.toEqual({
      ok: false,
      error: "not_persisted",
    });

    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockFire).not.toHaveBeenCalled();
    expect(mockSignDownload).not.toHaveBeenCalled();
    // and the outage is not silent server-side
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("rejects an object key that is not under the caller's tenant AND patient", async () => {
    // The key names the folder `audioObjectKey` builds, which is per patient
    // and not per tenant, so the check is made against the whole prefix.
    await expect(
      fireConsultationWebhookAction({
        ...OK_INPUT,
        objectKey: "t1/OTHER-PATIENT/ts/consultation.webm",
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockFire).not.toHaveBeenCalled();
  });

  it("reads the patient through runScoped BEFORE it persists", async () => {
    // The ordering is the property: a check made after the insert is not a check.
    await fireConsultationWebhookAction(OK_INPUT);
    expect(mockRunScoped).toHaveBeenCalled();
    expect(mockRunScoped.mock.invocationCallOrder[0]!).toBeLessThan(
      mockPersist.mock.invocationCallOrder[0]!,
    );
  });

  it("writes the id the DATABASE returned, not the id the payload carried", async () => {
    // The payload says "forged"; the read answers "p1". Every downstream write
    // must follow the read, and the key check must be made against that answer.
    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([{ id: "p1" }]) as never));

    await expect(
      fireConsultationWebhookAction({ ...OK_INPUT, patientId: "forged" }),
    ).resolves.toEqual({ ok: true });

    expect(mockPersist).toHaveBeenCalledWith(expect.objectContaining({ patientId: "p1" }));
    expect(mockFire).toHaveBeenCalledWith(expect.objectContaining({ patient_id: "p1" }));
  });
});

describe("signAudioUploadAction — a presigned PUT is a write capability", () => {
  const mockSignUpload = vi.mocked(signAudioUpload);
  // The payload says "p1" while the outer beforeEach answers the scoped read
  // with "pat-1": the folder the browser is handed must follow the DATABASE.
  const OK_INPUT = { patientId: "p1", consultationStartedAt: "2026-07-07T01:00:00.000Z" };

  beforeEach(() => {
    // Derived from the arguments rather than hardcoded, so the assertion below
    // is about the id the action passed and not about this mock's constant.
    mockSignUpload.mockImplementation(async (tenantId, patientId, startedAt) => ({
      url: "https://s3/put?sig",
      objectKey: `${tenantId}/${patientId}/${startedAt.replace(/[:.]/g, "-")}/consultation.webm`,
    }));
  });

  it("refuses to sign for a patient the scoped read does not return", async () => {
    mockRunScoped.mockImplementation(async (_c, fn) => fn(txReturning([]) as never));
    await expect(signAudioUploadAction(OK_INPUT)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(mockSignUpload).not.toHaveBeenCalled();
  });

  it("signs for the id the scoped read RETURNED, never the id the payload carried", async () => {
    await expect(signAudioUploadAction(OK_INPUT)).resolves.toEqual({
      ok: true,
      url: "https://s3/put?sig",
      objectKey: "t1/pat-1/2026-07-07T01-00-00-000Z/consultation.webm",
    });
    expect(mockSignUpload).toHaveBeenCalledWith("t1", "pat-1", "2026-07-07T01:00:00.000Z");
  });

  it("forbids a non-authoring role before the read, and never signs", async () => {
    mockCan.mockReturnValue(false);
    await expect(signAudioUploadAction(OK_INPUT)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockSignUpload).not.toHaveBeenCalled();
  });

  it("A FAULT IN THE SCOPED READ RESOLVES AS config, IT NEVER REJECTS", async () => {
    // This action gained a database dependency, and therefore a fault mode it
    // did not have before. The recorder awaits it directly and maps every
    // non-ok arm to `upload_error`; a rejection would instead leave it pinned
    // at "uploading" with no error surface at all.
    mockRunScoped.mockRejectedValue(new Error("connection terminated"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(signAudioUploadAction(OK_INPUT)).resolves.toEqual({
      ok: false,
      error: "config",
    });
    expect(mockSignUpload).not.toHaveBeenCalled();
    // `config` reads as a storage problem to the user, so the real cause has to
    // be somewhere an operator can find it
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
