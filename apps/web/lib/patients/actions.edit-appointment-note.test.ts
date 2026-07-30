import { vi, describe, it, expect, beforeEach } from "vitest";

// PL-13 (owner ruling 2026-07-30): `editAppointmentNoteAction` edits a note IN
// PLACE and stamps edited_at + last_edited_by. It mirrors the append path's
// guard: `patients:write` capability (real matrix runs), and a therapist may edit
// only a note of one of their OWN patients — the note's patient_id is loaded
// server-side, then `getPatient` applies `therapistPatientScope` (non-own → null
// → deny, no update). Owner/admin/reception are unscoped.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));
vi.mock("./queries", () => ({ getPatient: vi.fn(), searchPatients: vi.fn() }));

import { requireRequestContext, runScoped } from "../auth/context";
import { getPatient } from "./queries";
import { editAppointmentNoteAction } from "./actions";
import type { RequestContext } from "../auth/context";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockGetPatient = vi.mocked(getPatient);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "t-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "r-1" };

const NOTE_ID = "note-1";
const OWNER_PATIENT = "33333333-3333-3333-3333-333333333333";

// Fake tx answering the server-side note→patientId lookup (select→limit) and
// recording every UPDATE .set() payload.
function makeTx(lookupRows: unknown[]) {
  const updateCalls: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => lookupRows }) }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updateCalls.push(v);
          return Promise.resolve();
        },
      }),
    }),
  };
  return { tx, updateCalls };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockGetPatient.mockReset();
  mockCtx.mockResolvedValue(therapist);
});

describe("editAppointmentNoteAction — PL-13 in-place edit + therapist own-patient scope", () => {
  it("therapist NON-OWN note: denies with { ok: false } and updates nothing", async () => {
    const { tx, updateCalls } = makeTx([{ patientId: OWNER_PATIENT }]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue(null); // therapistPatientScope → not own → null

    const result = await editAppointmentNoteAction(NOTE_ID, "texto novo");

    expect(result).toEqual({ ok: false });
    expect(updateCalls).toHaveLength(0);
    expect(mockGetPatient).toHaveBeenCalledWith(OWNER_PATIENT, { includeDeleted: true });
  });

  it("therapist OWN note: updates the body and stamps edited_at + last_edited_by", async () => {
    const { tx, updateCalls } = makeTx([{ patientId: OWNER_PATIENT }]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue({ id: OWNER_PATIENT } as never);

    const result = await editAppointmentNoteAction(NOTE_ID, "  texto editado  ");

    expect(result).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      body: "texto editado", // trimmed
      lastEditedBy: "t-1", // the editor, not necessarily the author
    });
    expect(updateCalls[0]!.editedAt).toBeInstanceOf(Date);
  });

  it("note not found (RLS = 0 rows): denies without a visibility check or update", async () => {
    const { tx, updateCalls } = makeTx([]); // lookup returns nothing
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const result = await editAppointmentNoteAction("ghost", "texto");

    expect(result).toEqual({ ok: false });
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("reception (unscoped) is unaffected: visible patient → note updated", async () => {
    mockCtx.mockResolvedValue(reception);
    const { tx, updateCalls } = makeTx([{ patientId: OWNER_PATIENT }]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue({ id: OWNER_PATIENT } as never);

    const result = await editAppointmentNoteAction(NOTE_ID, "correcao rececao");

    expect(result).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ lastEditedBy: "r-1" });
  });

  it("blank content is rejected before any DB work", async () => {
    const result = await editAppointmentNoteAction(NOTE_ID, "   ");
    expect(result).toEqual({ ok: false });
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockGetPatient).not.toHaveBeenCalled();
  });
});
