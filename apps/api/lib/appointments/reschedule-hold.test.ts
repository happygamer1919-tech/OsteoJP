/**
 * R10 (2026-10-25): rescheduling at a clinic held off online booking.
 *
 * A patient whose visit at a held clinic was booked by reception must not be
 * able to pick another slot there online. The options list is empty and the
 * action is refused with `location_unavailable`, the answer a clinic nobody can
 * be booked at already gets. The appointment itself is never moved: the store's
 * write is not reached. The control: the same appointment at a clinic that is
 * not held reschedules as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetPatientChangeConsumer,
  setPatientChangeConsumer,
  stubConsumer,
} from "@/lib/notifications/patient-change";
import { listRescheduleOptions, rescheduleAppointment } from "./booking";
import type { AppointmentsStore } from "./booking";
import { AppointmentError } from "./errors";

const NOW = new Date("2026-09-01T09:00:00Z");
const H = 60 * 60 * 1000;
const PRINCIPAL = { tenantId: "t1", patientId: "p1" } as never;
const HELD = "0f0f0f0f-1111-4222-8333-444444444444";
const OPEN = "a1a1a1a1-2222-4333-8444-555555555555";

const iso = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H).toISOString();

function makeStore(locationId: string) {
  const appt = {
    startsAt: new Date(NOW.getTime() + 5 * 24 * H),
    endsAt: new Date(NOW.getTime() + 5 * 24 * H + 45 * 60_000),
    status: "scheduled" as const,
    locationId,
    practitionerId: "prac-1",
  };
  const store = {
    getOwnMutable: vi.fn(async () => appt),
    listOpenSlots: vi.fn(async () => [iso(48), iso(72)]),
    hasWindowConflict: vi.fn(async () => ({ conflict: false, clinicClosed: false })),
    rescheduleOwn: vi.fn(async () => {}),
    getOwn: vi.fn(async () => ({ ...appt, id: "a1" })),
  };
  return store as typeof store & AppointmentsStore;
}

beforeEach(() => {
  setPatientChangeConsumer(stubConsumer);
  vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", HELD);
});
afterEach(() => {
  resetPatientChangeConsumer();
  vi.unstubAllEnvs();
});

describe("R10: reschedule options at a held clinic", () => {
  it("offers no slot, and does not even ask the store for slots", async () => {
    const store = makeStore(HELD);
    expect(await listRescheduleOptions(PRINCIPAL, "a1", store, NOW)).toEqual([]);
    expect(store.listOpenSlots).not.toHaveBeenCalled();
  });

  it("the id is matched whatever its case in the setting", async () => {
    vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", HELD.toUpperCase());
    expect(await listRescheduleOptions(PRINCIPAL, "a1", makeStore(HELD), NOW)).toEqual([]);
  });

  it("CONTROL: at a clinic that is not held, the options are offered as before", async () => {
    expect(await listRescheduleOptions(PRINCIPAL, "a1", makeStore(OPEN), NOW)).toEqual([
      iso(48),
      iso(72),
    ]);
  });

  it("CONTROL: with no hold set, the held clinic's options come back", async () => {
    vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", "");
    expect(await listRescheduleOptions(PRINCIPAL, "a1", makeStore(HELD), NOW)).toEqual([
      iso(48),
      iso(72),
    ]);
  });
});

describe("R10: the reschedule action at a held clinic", () => {
  it("is refused with location_unavailable, and the appointment is not moved", async () => {
    const store = makeStore(HELD);
    const err = await rescheduleAppointment(
      PRINCIPAL,
      "a1",
      { startsAt: new Date(iso(48)) },
      store,
      NOW,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppointmentError);
    expect((err as AppointmentError).code).toBe("location_unavailable");
    expect(store.rescheduleOwn).not.toHaveBeenCalled();
    expect(store.hasWindowConflict).not.toHaveBeenCalled();
  });

  it("CONTROL: at a clinic that is not held, the same request moves the appointment", async () => {
    const store = makeStore(OPEN);
    await rescheduleAppointment(PRINCIPAL, "a1", { startsAt: new Date(iso(48)) }, store, NOW);
    expect(store.rescheduleOwn).toHaveBeenCalledTimes(1);
  });
});
