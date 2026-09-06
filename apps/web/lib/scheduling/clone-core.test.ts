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
    expect(v.packInstanceId).toBeNull(); // 0067 pacote link — SCHED-15 rule 2
  });

  // ================================================================= //
  // SCHED-15 RULE 2 — THE PACOTE LINK IS NEVER COPIED.
  // ================================================================= //
  // The negative arm is the point. A clone that inherited pack_instance_id
  // would spend one of the patient's ten sessions with nobody deciding to,
  // because pack-balance.ts derives the balance from LINKED, non-cancelled
  // appointments: the link is the consumption. The DB half — that the balance
  // does not move — is asserted in packages/db/tests/appointment-clone-rls.test.ts.
  describe("the 0067 pacote link", () => {
    it("is null even when the source is linked to a pacote instance", () => {
      const linked = {
        ...source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
        // Deliberately shaped like a source row that DOES carry a link. The
        // field is not on CloneSource, so this is the caller trying to smuggle
        // one through and being ignored.
        packInstanceId: "aaaaaaaa-0000-0000-0000-00000000000f",
      } as CloneSource;
      const v = buildClonedAppointment(linked, new Date("2026-09-01T14:00:00Z"), ACTOR);
      expect(v.packInstanceId).toBeNull();
    });

    it("is present on the values object, not merely absent (an omitted key would take the column default)", () => {
      const v = buildClonedAppointment(
        source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
        new Date("2026-09-01T14:00:00Z"),
        ACTOR,
      );
      // `in` distinguishes "explicitly null" from "not written at all". The
      // second would still insert NULL today and would stop doing so the day a
      // column default changed — the exact regression this file's header says
      // the explicit nulls exist to prevent.
      expect("packInstanceId" in v).toBe(true);
    });

    it("does not read the source's pacote link at all (CloneSource has no such field)", () => {
      const s = source("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z");
      expect("packInstanceId" in s).toBe(false);
    });
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
