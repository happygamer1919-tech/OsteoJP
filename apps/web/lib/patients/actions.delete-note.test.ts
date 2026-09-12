import { vi, describe, it, expect, beforeEach } from "vitest";

// NOTES-04 `deleteNoteAction`. 0084's DELETE policy is tenant-only, so every
// finer rule lives in this action and is asserted here: the capability, the
// therapist own-patient scope, a relation name the server recognises, and one
// audit row in the SAME transaction as the delete, carrying no note text.
//
// The REAL `@osteojp/auth` matrix runs, as in the append-note suite, so a
// therapist genuinely passes `patients:write` and the SCOPE check is what denies.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));
vi.mock("./queries", () => ({ getPatient: vi.fn(), searchPatients: vi.fn() }));
vi.mock("./note-delete", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./note-delete")>()),
  readNotePatientId: vi.fn(),
  deleteNoteInTx: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireRequestContext, runScoped } from "../auth/context";
import { writeAudit } from "./audit";
import { getPatient } from "./queries";
import { deleteNoteInTx, readNotePatientId } from "./note-delete";
import { deleteNoteAction } from "./actions";
import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";
import type { RequestContext } from "../auth/context";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockGetPatient = vi.mocked(getPatient);
const mockRead = vi.mocked(readNotePatientId);
const mockDelete = vi.mocked(deleteNoteInTx);
const mockAudit = vi.mocked(writeAudit);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "t-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "r-1" };

const NOTE = "11111111-1111-4111-8111-111111111111";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const APPT = "44444444-4444-4444-8444-444444444444";
const tx = { marker: "the-delete-transaction" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  mockRead.mockResolvedValue(PATIENT);
  mockGetPatient.mockResolvedValue({ id: PATIENT } as never);
  mockDelete.mockResolvedValue({ patientId: PATIENT, appointmentId: APPT, legacyTwinsDeleted: 1 });
});

describe("deleteNoteAction (NOTES-04)", () => {
  it("reception deletes, and the audit row is written in the delete's own transaction", async () => {
    mockCtx.mockResolvedValue(reception);

    const result = await deleteNoteAction(NOTE, "appointment_notes");

    expect(result).toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalledWith(tx, "appointment_notes", NOTE);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const [auditTx, auditCtx, entry] = mockAudit.mock.calls[0];
    expect(auditTx).toBe(tx);
    expect(auditCtx).toBe(reception);
    expect(entry).toEqual({
      action: "patient.note_delete",
      entityId: PATIENT,
      metadata: {
        noteId: NOTE,
        relation: "appointment_notes",
        appointmentId: APPT,
        legacyTwinsDeleted: 1,
      },
    });
    // The real contract, not a restatement of it: ids, a relation name and a count.
    expect(() => assertPiiFreeAuditMetadata(entry.metadata ?? {}, "test")).not.toThrow();
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/agenda");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/marcacoes");
  });

  it("a therapist on a patient that is not theirs is refused before anything is deleted", async () => {
    mockCtx.mockResolvedValue(therapist);
    mockGetPatient.mockResolvedValue(null); // therapistPatientScope: not own

    const result = await deleteNoteAction(NOTE, "appointment_notes");

    expect(result).toEqual({ ok: false });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a therapist on their own patient deletes a legacy revision", async () => {
    mockCtx.mockResolvedValue(therapist);
    mockDelete.mockResolvedValue({ patientId: PATIENT, appointmentId: null, legacyTwinsDeleted: 0 });

    const result = await deleteNoteAction(NOTE, "patient_note_revisions");

    expect(result).toEqual({ ok: true });
    expect(mockRead).toHaveBeenCalledWith(tx, "patient_note_revisions", NOTE);
    expect(mockDelete).toHaveBeenCalledWith(tx, "patient_note_revisions", NOTE);
  });

  it("a relation the server does not know is refused without a read", async () => {
    mockCtx.mockResolvedValue(reception);

    const result = await deleteNoteAction(NOTE, "clinical_records" as never);

    expect(result).toEqual({ ok: false });
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("an id that is not a visible note is refused, with no scope check and no audit", async () => {
    mockCtx.mockResolvedValue(reception);
    mockRead.mockResolvedValue(null);

    const result = await deleteNoteAction(NOTE, "appointment_notes");

    expect(result).toEqual({ ok: false });
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a delete that removed nothing writes no audit row and reports failure", async () => {
    mockCtx.mockResolvedValue(reception);
    mockDelete.mockResolvedValue(null);

    const result = await deleteNoteAction(NOTE, "appointment_notes");

    expect(result).toEqual({ ok: false });
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
