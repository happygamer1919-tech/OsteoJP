/**
 * W13-04 — a portal booking emits a PEDIDO, not a completed booking.
 *
 * JP's ruling, confirmed 2026-08-06 ("certo"): request-mode for all 12
 * patient-bookable services, ZERO auto-confirmed, and — added in the same
 * ruling, and build-blocking rather than a nice-to-have — "portal pedidos must
 * surface in the notification centre".
 *
 * WHAT WAS ACTUALLY WRONG, because "rename the kind" undersells it. Three
 * places already told the truth: the patient is shown "a aguardar confirmação
 * pela receção", the row's confirmation_state defaults to pending, and reception
 * is the one who confirms. The NOTIFICATION was the only place that called it a
 * finished booking. So the single item in reception's centre that needed their
 * action was the one item that looked like it did not.
 *
 * THE CONTRACT WAS ALREADY READY FOR THIS. `appointment_request` has been one of
 * the four kinds since WF-04 (R1), the centre has handled it since W13-02, and
 * `patient-change.ts` says in as many words that it "HAS NO PRODUCTION EMIT SITE
 * YET... LOOP 4 adds one emit call rather than reopening this contract". This is
 * that call, and this file is the test that it happened.
 */
import { describe, expect, it, vi } from "vitest";

import { bookAppointment, parseBookingInput, type AppointmentsStore } from "./booking";
import {
  resetPatientChangeConsumer,
  setPatientChangeConsumer,
  type PatientChangeEvent,
} from "@/lib/notifications/patient-change";

vi.mock("server-only", () => ({}));

const ALICE = { tenantId: "t1", patientId: "alice", role: "patient" } as never;
const SERVICE_ID = "11111111-1111-1111-1111-111111111111";
const LOCATION_ID = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-08-06T09:00:00.000Z");

function inHours(h: number): Date {
  return new Date(NOW.getTime() + h * 3_600_000);
}

/** The smallest store that lets a booking succeed. */
function makeStore(): AppointmentsStore {
  const rows: Array<Record<string, unknown>> = [];
  return {
    getBookableService: async () => ({
      id: SERVICE_ID,
      name: "Osteopatia/Posturologia",
      durationMin: 55,
      locationId: null,
    }),
    isBookableLocation: async () => true,
    listAvailableTherapists: async () => [{ practitionerId: "ther-ana", sortKey: "Ana" }],
    priorTherapistId: async () => null,
    createBooking: async (
      principal: { patientId: string },
      { practitionerId, startsAt, endsAt }: { practitionerId: string; startsAt: Date; endsAt: Date },
    ) => {
      const id = `appt-${rows.length + 1}`;
      rows.push({ id, patientId: principal.patientId, practitionerId, startsAt, endsAt });
      return id;
    },
    getOwn: async (_p: unknown, id: string) => ({
      id,
      startsAt: inHours(72).toISOString(),
      endsAt: inHours(73).toISOString(),
      status: "scheduled",
      serviceName: "Osteopatia/Posturologia",
      locationName: "Linda-a-Velha",
      practitionerName: "Ana",
      room: null,
    }),
  } as unknown as AppointmentsStore;
}

async function bookAndCapture(): Promise<PatientChangeEvent[]> {
  const captured: PatientChangeEvent[] = [];
  setPatientChangeConsumer(async (e) => {
    captured.push(e);
    return { delivered: true };
  });
  try {
    const input = parseBookingInput({
      serviceId: SERVICE_ID,
      locationId: LOCATION_ID,
      startsAt: inHours(72).toISOString(),
    });
    await bookAppointment(ALICE, input, makeStore(), NOW);
  } finally {
    resetPatientChangeConsumer();
  }
  return captured;
}

describe("a patient booking is a pedido de marcação", () => {
  it("emits appointment_request, not booked", async () => {
    const [event, ...rest] = await bookAndCapture();
    expect(event.kind).toBe("appointment_request");
    // ONE event, not two. The failure this rules out is a "belt and braces"
    // edit that emits both kinds and gives reception the same pedido twice,
    // once looking done.
    expect(rest).toEqual([]);
  });

  it("reaches reception AND the assigned therapist (R2)", async () => {
    const [event] = await bookAndCapture();
    expect(event.audience.reception).toBe(true);
    expect(event.audience.practitionerIds).toEqual(["ther-ana"]);
  });

  it("carries no clinical detail — the centre renders to staff who may not be entitled", async () => {
    const [event] = await bookAndCapture();
    const serialized = JSON.stringify(event);
    for (const leak of ["Osteopatia", "Linda-a-Velha", "Ana"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("names the appointment and the patient by ID only", async () => {
    const [event] = await bookAndCapture();
    expect(event.appointmentId).toBe("appt-1");
    expect(event.patientId).toBe("alice");
    expect(event.tenantId).toBe("t1");
  });

  it("does not move the appointment: both instants are the new start", async () => {
    // A booking creates; it does not reschedule. Same convention a cancellation
    // already uses, and the centre's wording depends on it.
    const [event] = await bookAndCapture();
    expect(event.previousStartsAt).toBe(event.newStartsAt);
  });

  it("the emit is POST-COMMIT: a failing consumer does not fail the booking", async () => {
    // The booking already exists by then. A notification failure that surfaced
    // to the patient as a failed booking would be the worst of both — the row is
    // written and they try again.
    setPatientChangeConsumer(async () => {
      throw new Error("centre is down");
    });
    try {
      const input = parseBookingInput({
        serviceId: SERVICE_ID,
        locationId: LOCATION_ID,
        startsAt: inHours(72).toISOString(),
      });
      await expect(bookAppointment(ALICE, input, makeStore(), NOW)).resolves.toBeDefined();
    } finally {
      resetPatientChangeConsumer();
    }
  });
});
