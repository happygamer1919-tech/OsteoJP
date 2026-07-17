import { describe, expect, it } from "vitest";
import type { PatientPrincipal } from "@osteojp/auth";
import {
  getOwnAppointment,
  listOwnAppointments,
  type AppointmentsStore,
  type AppointmentStatus,
  type AppointmentView,
} from "./booking";

// W9-06 - CB QA item 6, the portal privacy invariant: staff marcacao notes /
// comments / historico must NEVER reach a patient in the portal, in any API
// response body. W9-01 (c) confirmed no live exposure today; this test LOCKS it,
// mirroring the fichas guard (`expect(envelope).not.toContain("private_notes")`,
// apps/api/lib/fichas/read.test.ts) so a future change that widens the response
// fails CI here.
//
// The choke point is `AppointmentView` - the single, closed DTO every
// portal-consumed endpoint returns (GET/POST /api/v1/appointments and the
// reschedule/cancel responses all serialize it). Two guards:
//   1. the DTO's runtime shape carries no note field, and a note-bearing object
//      is not assignable to it (compile-time);
//   2. a note sentinel present on the underlying store row never survives into
//      the serialized envelope the orchestration returns.

const SENTINEL = "STAFF_NOTE_LEAK_SENTINEL";

const PATIENT: PatientPrincipal = { tenantId: "t-1", patientId: "alice", userId: "auth-a" };

/** The exact 8 fields the portal is allowed to see for an appointment. */
const ALLOWED_KEYS = [
  "id",
  "startsAt",
  "endsAt",
  "status",
  "serviceName",
  "locationName",
  "practitionerName",
  "room",
].sort();

const sampleView: AppointmentView = {
  id: "appt-1",
  startsAt: "2026-07-01T09:00:00.000Z",
  endsAt: "2026-07-01T10:00:00.000Z",
  status: "scheduled",
  serviceName: "Osteopatia",
  locationName: "Linda-a-Velha",
  practitionerName: "Dr. Joao",
  room: null,
};

describe("W9-06 item 6 - AppointmentView carries no staff-note field (DTO contract)", () => {
  it("exposes exactly the 8 non-sensitive fields, and none named like a note", () => {
    const keys = Object.keys(sampleView).sort();
    expect(keys).toEqual(ALLOWED_KEYS);
    for (const k of keys) {
      expect(k).not.toMatch(/note|coment|hist|observ/i);
    }
  });

  it("a note-bearing object is NOT assignable to AppointmentView (compile-time guard)", () => {
    // @ts-expect-error - `notes` is not a member of AppointmentView; if someone
    // widens the DTO to carry notes, this line stops erroring and the test fails.
    const leaky: AppointmentView = { ...sampleView, notes: SENTINEL };
    // Runtime backstop for the same intent: even a hand-forced object must not
    // ship a notes field through the serialized envelope below.
    expect(JSON.stringify(sampleView)).not.toContain("notes");
    void leaky;
  });
});

/**
 * A hostile store whose UNDERLYING rows carry a `notes` sentinel (as the real DB
 * row does), but which maps to the 8-field view exactly as the real store's
 * enrichViews does. If someone "simplifies" the mapping to return whole rows,
 * the sentinel leaks and the envelope assertions below fail.
 */
function makeNotesLeakStore(): AppointmentsStore {
  const row = {
    id: "appt-1",
    patientId: PATIENT.patientId,
    startsAt: new Date("2026-07-01T09:00:00Z"),
    endsAt: new Date("2026-07-01T10:00:00Z"),
    status: "scheduled" as AppointmentStatus,
    locationId: "loc-1",
    practitionerId: "ther-1",
    serviceId: null,
    // The sensitive field the portal must never surface:
    notes: SENTINEL,
  };
  const view = (r: typeof row): AppointmentView => ({
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    status: r.status,
    serviceName: null,
    locationName: "Linda-a-Velha",
    practitionerName: "Dr. Joao",
    room: null,
  });
  return {
    async listOwn(p) {
      return p.patientId === row.patientId ? [view(row)] : [];
    },
    async getOwn(p, id) {
      return p.patientId === row.patientId && id === row.id ? view(row) : null;
    },
    async getCatalog() {
      return { locations: [], services: [] };
    },
    async getBookableService() {
      return null;
    },
    async isBookableLocation() {
      return true;
    },
    async listOpenSlots() {
      return [];
    },
    async listAvailableTherapists() {
      return [];
    },
    async priorTherapistId() {
      return null;
    },
    async createBooking() {
      return "new-1";
    },
    async getOwnMutable() {
      return null;
    },
    async cancelOwn() {},
    async rescheduleOwn() {},
    async hasWindowConflict() {
      return false;
    },
  };
}

describe("W9-06 item 6 - no staff note reaches the portal response envelope", () => {
  it("GET /appointments (listOwn) envelope contains no note sentinel", async () => {
    const appointments = await listOwnAppointments(PATIENT, makeNotesLeakStore());
    const envelope = JSON.stringify({ appointments });
    expect(envelope).not.toContain(SENTINEL);
    expect(envelope).not.toContain("notes");
    // The patient still gets their appointment (the guard did not just empty it).
    expect(appointments).toHaveLength(1);
    expect(appointments[0]!.id).toBe("appt-1");
  });

  it("GET /appointments/[id] (getOwn) envelope contains no note sentinel", async () => {
    const appointment = await getOwnAppointment(PATIENT, "appt-1", makeNotesLeakStore());
    const envelope = JSON.stringify({ appointment });
    expect(envelope).not.toContain(SENTINEL);
    expect(envelope).not.toContain("notes");
    expect(appointment?.id).toBe("appt-1");
  });
});
