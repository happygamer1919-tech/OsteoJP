import { vi, describe, it, expect, beforeEach } from "vitest";

// W10-04 therapist "own-patients-only" scope on the W12-13
// `appendAppointmentNoteAction` (regression fix). The action derives `patientId`
// SERVER-SIDE from the appointment under tenant RLS only — it did NOT apply the
// therapist narrowing, so a therapist could append a note to ANY tenant
// appointment by UUID. The fix precheck-visibility via `getPatient` (which
// applies `therapistPatientScope`, exactly as getPatient/searchPatients do): a
// non-own patient returns null → deny (no insert). Owner/admin/reception are
// unscoped, so `getPatient` returns the row and they are unaffected.
//
// The REAL `@osteojp/auth` matrix runs (therapist + reception both hold
// `patients:write`), so the capability gate genuinely passes and the SCOPE check
// is what denies. These tests FAIL on main (no `getPatient` precheck → the note
// is inserted and `{ ok: true }` returned for a non-own appointment) and PASS
// with the fix.

vi.mock("server-only", () => ({}));
// `updateTag` joined the mock when SR-25 gave revalidatePatient the stat-strip
// tag. Every patient mutation goes through that helper, so every suite that
// exercises one needs the export.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));
vi.mock("./queries", () => ({ getPatient: vi.fn(), searchPatients: vi.fn() }));

import { requireRequestContext, runScoped } from "../auth/context";
import { getPatient } from "./queries";
import { appendAppointmentNoteAction } from "./actions";
import type { RequestContext } from "../auth/context";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockGetPatient = vi.mocked(getPatient);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "t-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "r-1" };

const APPT_ID = "appt-1";
const DERIVED_PATIENT = "33333333-3333-3333-3333-333333333333";

// A fake tx that answers the server-side patientId derivation (select→limit) and
// records every appointment_notes insert. Works for both the fixed shape (derive
// tx, then a separate insert tx) and the pre-fix shape (one tx doing both).
function makeTx(deriveRows: unknown[]) {
  const insertCalls: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => deriveRows }) }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertCalls.push(v);
        return Promise.resolve();
      },
    }),
  };
  return { tx, insertCalls };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockGetPatient.mockReset();
  mockCtx.mockResolvedValue(therapist);
});

describe("appendAppointmentNoteAction — W10-04 therapist scope (W12-13 regression)", () => {
  it("therapist NON-OWN appointment: denies with { ok: false } and inserts nothing", async () => {
    const { tx, insertCalls } = makeTx([{ patientId: DERIVED_PATIENT }]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue(null); // therapistPatientScope → not own → null

    const result = await appendAppointmentNoteAction(APPT_ID, "nota clínica");

    expect(result).toEqual({ ok: false });
    expect(insertCalls).toHaveLength(0);
    expect(mockGetPatient).toHaveBeenCalledWith(DERIVED_PATIENT, { includeDeleted: true });
  });

  it("therapist OWN appointment: appends the note (patient_id derived server-side)", async () => {
    const { tx, insertCalls } = makeTx([{ patientId: DERIVED_PATIENT }]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue({ id: DERIVED_PATIENT } as never);

    const result = await appendAppointmentNoteAction(APPT_ID, "  nota clínica  ");

    expect(result).toEqual({ ok: true });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      tenantId: "tenant-A",
      patientId: DERIVED_PATIENT, // derived from the appointment, never the client
      appointmentId: APPT_ID,
      authorUserId: "t-1",
      body: "nota clínica", // trimmed
    });
  });

  it("appointment not found (RLS = 0 rows): denies without a visibility check or insert", async () => {
    const { tx, insertCalls } = makeTx([]); // derive returns nothing
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const result = await appendAppointmentNoteAction("ghost", "nota");

    expect(result).toEqual({ ok: false });
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it("reception (unscoped) is unaffected: visible patient → note appended", async () => {
    mockCtx.mockResolvedValue(reception);
    const { tx, insertCalls } = makeTx([{ patientId: DERIVED_PATIENT }]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue({ id: DERIVED_PATIENT } as never); // no narrowing for reception

    const result = await appendAppointmentNoteAction(APPT_ID, "nota rececao");

    expect(result).toEqual({ ok: true });
    expect(insertCalls).toHaveLength(1);
  });

  it("blank content is rejected before any DB work", async () => {
    const result = await appendAppointmentNoteAction(APPT_ID, "   ");
    expect(result).toEqual({ ok: false });
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockGetPatient).not.toHaveBeenCalled();
  });
});
