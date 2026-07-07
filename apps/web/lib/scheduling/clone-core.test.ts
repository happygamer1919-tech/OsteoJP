import { describe, expect, it } from "vitest";
import { buildClonedAppointment, type CloneActor, type CloneSource } from "./clone-core";

// Pure mapping core: no DB. Feeds a source row + a new start + acting context and
// asserts the field-by-field copied / fresh / not-copied partition and duration
// preservation. The DB round-trip and cross-tenant RLS rejection are proven in
// packages/db/tests/appointment-clone-rls.test.ts against a live database.

const ACTOR: CloneActor = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
};

const source = (startsAt: string, endsAt: string): CloneSource => ({
  patientId: "aaaaaaaa-0000-0000-0000-000000000001",
  practitionerId: "aaaaaaaa-0000-0000-0000-000000000002",
  locationId: "aaaaaaaa-0000-0000-0000-000000000003",
  serviceId: "aaaaaaaa-0000-0000-0000-000000000004",
  patientTwoId: null,
  practitionerTwoId: null,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
});

describe("buildClonedAppointment", () => {
  it("COPIES the clinical shape from the source (patient, practitioner, service, location)", () => {
    const s = source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z");
    const v = buildClonedAppointment(s, new Date("2026-09-01T14:00:00Z"), ACTOR);
    expect(v.patientId).toBe(s.patientId);
    expect(v.practitionerId).toBe(s.practitionerId);
    expect(v.serviceId).toBe(s.serviceId);
    expect(v.locationId).toBe(s.locationId);
  });

  it("passes a NULL serviceId through unchanged (service is optional)", () => {
    const s = { ...source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"), serviceId: null };
    const v = buildClonedAppointment(s, new Date("2026-09-01T14:00:00Z"), ACTOR);
    expect(v.serviceId).toBeNull();
  });

  it("uses the caller's new startsAt and derives endsAt = newStart + source duration", () => {
    const s = source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"); // 60 min
    const newStart = new Date("2026-09-01T14:00:00Z");
    const v = buildClonedAppointment(s, newStart, ACTOR);
    expect(v.startsAt.toISOString()).toBe("2026-09-01T14:00:00.000Z");
    expect(v.endsAt.toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });

  it("PRESERVES a non-round duration (45 min) at the new start", () => {
    const s = source("2026-08-06T09:00:00Z", "2026-08-06T09:45:00Z"); // 45 min
    const newStart = new Date("2026-09-01T16:15:00Z");
    const v = buildClonedAppointment(s, newStart, ACTOR);
    const durationMin = (v.endsAt.getTime() - v.startsAt.getTime()) / 60_000;
    expect(durationMin).toBe(45);
    expect(v.endsAt.toISOString()).toBe("2026-09-01T17:00:00.000Z");
  });

  it("resets BOTH lifecycle axes: status=scheduled, confirmation_state=pending, receipt cleared", () => {
    const v = buildClonedAppointment(
      source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
      new Date("2026-09-01T14:00:00Z"),
      ACTOR,
    );
    expect(v.status).toBe("scheduled");
    expect(v.confirmationState).toBe("pending");
    expect(v.confirmationReceivedAt).toBeNull();
    expect(v.confirmationChannel).toBeNull();
  });

  it("does NOT copy grouping / series / per-visit fields (all null on the clone)", () => {
    const v = buildClonedAppointment(
      source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
      new Date("2026-09-01T14:00:00Z"),
      ACTOR,
    );
    expect(v.bookingGroupId).toBeNull(); // 0027
    expect(v.batchId).toBeNull(); // 0028
    expect(v.recurrenceRule).toBeNull();
    expect(v.recurrenceParentId).toBeNull();
    expect(v.room).toBeNull();
    expect(v.notes).toBeNull(); // inline per-visit note, never copied
  });

  it("derives tenantId and createdBy from the acting context, never the source", () => {
    const v = buildClonedAppointment(
      source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
      new Date("2026-09-01T14:00:00Z"),
      ACTOR,
    );
    expect(v.tenantId).toBe(ACTOR.tenantId);
    expect(v.createdBy).toBe(ACTOR.userId);
  });
});
