import { vi, describe, it, expect, beforeEach } from "vitest";

// W10-04 therapist "own-patients-only" scope on the W12-13 Notas Rápidas
// appointment selector (regression fix). `listPatientAppointmentsForNoteAction`
// takes a client patient UUID and previously called `listPatientAppointments`,
// which enforces only `appointments:read` + tenant RLS — NOT the therapist
// narrowing. A therapist could therefore read ANY tenant patient's appointment
// schedule by UUID. The fix precheck-visibility via `getPatient` (which applies
// `therapistPatientScope`, exactly as getPatient/searchPatients do): a non-own
// patient returns null → the action returns []. Owner/admin/reception are
// unscoped, so `getPatient` returns the row and they are unaffected.
//
// These tests FAIL on main (the action never consults `getPatient`, so a non-own
// patient's appointments still come back) and PASS with the fix.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/patients/queries", () => ({ getPatient: vi.fn() }));
vi.mock("@/lib/scheduling/data", () => ({ listPatientAppointments: vi.fn() }));

import { requireRequestContext } from "@/lib/auth/context";
import { getPatient } from "@/lib/patients/queries";
import { listPatientAppointments } from "@/lib/scheduling/data";
import { listPatientAppointmentsForNoteAction } from "./appointment-options";
import type { RequestContext } from "@/lib/auth/context";

const mockCtx = vi.mocked(requireRequestContext);
const mockGetPatient = vi.mocked(getPatient);
const mockListAppts = vi.mocked(listPatientAppointments);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "t-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "r-1" };

const OWN_PATIENT = "11111111-1111-1111-1111-111111111111";
const OTHER_PATIENT = "22222222-2222-2222-2222-222222222222";

// listPatientAppointments returns AgendaAppointment[]; the action reads only
// id/startsAt/serviceName/locationName, so a partial row cast is enough.
const APPTS = [
  { id: "appt-1", startsAt: "2026-07-03T10:00:00.000Z", serviceName: "Osteopatia", locationName: "Linda-a-Velha" },
];

beforeEach(() => {
  mockCtx.mockReset();
  mockGetPatient.mockReset();
  mockListAppts.mockReset();
  mockCtx.mockResolvedValue(therapist);
  mockListAppts.mockResolvedValue(APPTS as never);
});

describe("listPatientAppointmentsForNoteAction — W10-04 therapist scope (W12-13 regression)", () => {
  it("therapist NON-OWN patient: returns [] and never reads the appointment schedule", async () => {
    mockGetPatient.mockResolvedValue(null); // therapistPatientScope filtered it out
    const result = await listPatientAppointmentsForNoteAction(OTHER_PATIENT);
    expect(result).toEqual([]);
    expect(mockListAppts).not.toHaveBeenCalled();
  });

  it("therapist OWN patient: returns the mapped appointment options", async () => {
    mockGetPatient.mockResolvedValue({ id: OWN_PATIENT } as never);
    const result = await listPatientAppointmentsForNoteAction(OWN_PATIENT);
    expect(mockListAppts).toHaveBeenCalledWith(therapist, OWN_PATIENT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("appt-1");
    expect(result[0].label).toContain("Osteopatia");
  });

  it("reception (unscoped) is unaffected: visible patient → appointments returned", async () => {
    mockCtx.mockResolvedValue(reception);
    mockGetPatient.mockResolvedValue({ id: OTHER_PATIENT } as never); // no narrowing for reception
    const result = await listPatientAppointmentsForNoteAction(OTHER_PATIENT);
    expect(result).toHaveLength(1);
    expect(mockListAppts).toHaveBeenCalledWith(reception, OTHER_PATIENT);
  });

  it("empty patientId short-circuits before any visibility or schedule read", async () => {
    const result = await listPatientAppointmentsForNoteAction("");
    expect(result).toEqual([]);
    expect(mockGetPatient).not.toHaveBeenCalled();
    expect(mockListAppts).not.toHaveBeenCalled();
  });
});
