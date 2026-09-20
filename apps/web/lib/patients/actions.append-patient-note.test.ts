import { vi, describe, it, expect, beforeEach } from "vitest";

// Patient-visibility scope on `appendPatientNoteAction`, the patient-level twin
// of `appendAppointmentNoteAction`.
//
// This action takes `patientId` FROM THE CLIENT (the profile Notas composer and
// the dashboard Notas Rápidas patient-mode card post it), and the INSERT it
// performs is tenant-RLS only — migration 0026 `appointment_notes_tenant_insert`
// checks `tenant_id` and nothing else. So the finer "whose patient is this" rule
// has to live in the action, exactly as it does one axis over at
// `appendAppointmentNoteAction`: precheck with `getPatient`, which composes the
// W10-04 `therapistPatientScope` AND the PL-09 `patientLocationScope`
// (queries.ts). A patient the caller may not see returns null → deny, nothing
// written.
//
// The REAL `@osteojp/auth` matrix runs (therapist and reception both hold
// `patients:write`), so the capability gate genuinely passes and the SCOPE check
// is what denies.
//
// The deny arm FAILS before the fix (no precheck → the note is inserted and
// `{ ok: true }` returned) and PASSES with it. The own-patient arm in the SAME
// RUN is the positive control: it proves the suite can still write a note, so
// the deny is the gate and not a broken harness.

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

import { revalidatePath } from "next/cache";
import { requireRequestContext, runScoped } from "../auth/context";
import { getPatient } from "./queries";
import { appendPatientNoteAction } from "./actions";
import type { RequestContext } from "../auth/context";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockGetPatient = vi.mocked(getPatient);
const mockRevalidatePath = vi.mocked(revalidatePath);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "t-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "r-1" };

// A patient outside the therapist's own-patient narrowing, and one inside it.
const NON_OWN_PATIENT = "22222222-2222-4222-8222-222222222222";
const OWN_PATIENT = "33333333-3333-4333-8333-333333333333";

// A fake tx that records every appointment_notes insert. `select` is present so
// the suite is shape-compatible with a derivation-style body as well as this
// one, and so a future rewrite cannot silently throw here.
function makeTx() {
  const insertCalls: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
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
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(therapist);
});

describe("appendPatientNoteAction — patient visibility gate (the appendAppointmentNoteAction model, one axis over)", () => {
  it("therapist NON-OWN patient: denies with { ok: false } and inserts nothing", async () => {
    const { tx, insertCalls } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue(null); // therapistPatientScope → not own → null

    const result = await appendPatientNoteAction(NON_OWN_PATIENT, "nota interna");

    expect(result).toEqual({ ok: false });
    expect(insertCalls).toHaveLength(0);
    expect(mockGetPatient).toHaveBeenCalledWith(NON_OWN_PATIENT, { includeDeleted: true });
  });

  it("therapist OWN patient, same run: the note is written (positive control)", async () => {
    const { tx, insertCalls } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue({ id: OWN_PATIENT } as never);

    const result = await appendPatientNoteAction(OWN_PATIENT, "  nota interna  ");

    expect(result).toEqual({ ok: true });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      tenantId: "tenant-A",
      patientId: OWN_PATIENT,
      appointmentId: null, // patient-level note, unchanged by this fix
      authorUserId: "t-1", // authorship rules untouched
      body: "nota interna", // trimmed
    });
  });

  it("reception (unscoped) is unaffected: visible patient → note appended", async () => {
    mockCtx.mockResolvedValue(reception);
    const { tx, insertCalls } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue({ id: OWN_PATIENT } as never); // no narrowing for reception

    const result = await appendPatientNoteAction(OWN_PATIENT, "nota rececao");

    expect(result).toEqual({ ok: true });
    expect(insertCalls).toHaveLength(1);
  });

  it("the visibility check runs BEFORE any write, and a refusal revalidates nothing", async () => {
    const { tx, insertCalls } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockResolvedValue(null);

    await appendPatientNoteAction(NON_OWN_PATIENT, "nota interna");

    expect(insertCalls).toHaveLength(0);
    // revalidatePatient() must not run for a refused write.
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("a failing visibility check leaves no partial write", async () => {
    const { tx, insertCalls } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockGetPatient.mockRejectedValue(new Error("scope lookup failed"));

    await expect(appendPatientNoteAction(OWN_PATIENT, "nota interna")).rejects.toThrow(
      "scope lookup failed",
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("blank content is rejected before any visibility check or DB work", async () => {
    const result = await appendPatientNoteAction(OWN_PATIENT, "   ");

    expect(result).toEqual({ ok: false });
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
