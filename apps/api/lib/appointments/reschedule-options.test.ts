/**
 * Reschedule options + the 24h minimum notice on the NEW slot (JP, 2026-08-03).
 *
 * Two properties, and the second is the one that matters:
 *
 *   1. The options list never offers a slot inside the minimum notice.
 *   2. The reschedule ACTION refuses such a slot anyway. Filtering the list is a
 *      courtesy to an honest client; the action is the control. A patient who
 *      forges a POST must not be able to move an appointment to two hours away
 *      just because the list would not have shown it.
 *
 * Also pins the data-minimisation property: the options path resolves the
 * location server-side from the stored row and never requires the caller to know
 * a service or location id.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  resetPatientChangeConsumer,
  setPatientChangeConsumer,
  stubConsumer,
} from "@/lib/notifications/patient-change";
import { listRescheduleOptions, rescheduleAppointment } from "./booking";
import { AppointmentError } from "./errors";
import type { AppointmentsStore } from "./booking";
import { RESCHEDULE_MIN_NOTICE_HOURS } from "./cutoff";

const NOW = new Date("2026-09-01T09:00:00Z");
const H = 60 * 60 * 1000;
const PRINCIPAL = { tenantId: "t1", patientId: "p1" } as never;

/** Appointment 5 days out, so the cutoff on the CURRENT start is never the thing under test. */
const APPT = {
  startsAt: new Date(NOW.getTime() + 5 * 24 * H),
  endsAt: new Date(NOW.getTime() + 5 * 24 * H + 45 * 60_000),
  status: "scheduled" as const,
  locationId: "loc-1",
  practitionerId: "prac-1",
};

function iso(hoursFromNow: number) {
  return new Date(NOW.getTime() + hoursFromNow * H).toISOString();
}

function makeStore(slots: string[], over: Record<string, unknown> = {}) {
  const store = {
    getOwnMutable: vi.fn(async () => APPT),
    listOpenSlots: vi.fn(async () => slots),
    hasWindowConflict: vi.fn(async () => false),
    rescheduleOwn: vi.fn(async () => {}),
    getOwn: vi.fn(async () => ({ ...APPT, id: "a1" })),
    ...over,
  };
  // Cast at the call boundary only, so the mock's own members stay typed and the
  // assertions below can reach `store.listOpenSlots` etc.
  return store as typeof store & AppointmentsStore;
}

/**
 * ACC-preselection-spec-flaky, second instance. Found by grepping the whole
 * suite for the log line that gave the first one away, rather than by waiting
 * for this file to flake too.
 *
 * `rescheduleAppointment` calls `emitPatientChange`, which is best-effort: with
 * no consumer stubbed it resolves a database client and attempts a connection,
 * swallows the failure, and leaves only a stderr line. Nothing fails, and the
 * test pays an unbounded network timeout for a result it discards - the same
 * latency that pushed booking.test.ts past five seconds on a loaded runner.
 */
beforeEach(() => setPatientChangeConsumer(stubConsumer));
afterEach(() => resetPatientChangeConsumer());

describe("listRescheduleOptions", () => {
  it("drops slots inside the 24h minimum notice and keeps the rest", async () => {
    const store = makeStore([iso(2), iso(12), iso(23.5), iso(24), iso(48)]);

    const out = await listRescheduleOptions(PRINCIPAL, "a1", store, NOW);

    // Exactly 24h out is allowed (half-open boundary, matching the cutoff).
    expect(out).toEqual([iso(24), iso(48)]);
  });

  it("resolves the location server-side and never asks the caller for ids", async () => {
    const store = makeStore([iso(48)]);

    await listRescheduleOptions(PRINCIPAL, "a1", store, NOW);

    // The store is asked for slots at the appointment's OWN location, derived
    // from the stored row. Nothing about a service or location id came from the
    // caller — the function signature has no room for one.
    expect(store.listOpenSlots).toHaveBeenCalledWith(
      PRINCIPAL,
      expect.objectContaining({ locationId: "loc-1" }),
    );
  });

  it("preserves the appointment's own duration rather than the service's", async () => {
    const store = makeStore([iso(48)]);

    await listRescheduleOptions(PRINCIPAL, "a1", store, NOW);

    // 45 minutes, from endsAt - startsAt. A service whose duration changed after
    // booking must not silently resize an existing appointment.
    expect(store.listOpenSlots).toHaveBeenCalledWith(
      PRINCIPAL,
      expect.objectContaining({ durationMin: 45 }),
    );
  });

  it("offers nothing when the appointment is already inside the cutoff", async () => {
    const soon = { ...APPT, startsAt: new Date(NOW.getTime() + 3 * H), endsAt: new Date(NOW.getTime() + 4 * H) };
    const store = makeStore([iso(48)], { getOwnMutable: vi.fn(async () => soon) });

    await expect(listRescheduleOptions(PRINCIPAL, "a1", store, NOW)).rejects.toThrow(
      AppointmentError,
    );
  });

  it("refuses an appointment that is not reschedulable", async () => {
    const done = { ...APPT, status: "completed" as const };
    const store = makeStore([iso(48)], { getOwnMutable: vi.fn(async () => done) });

    await expect(listRescheduleOptions(PRINCIPAL, "a1", store, NOW)).rejects.toThrow(
      AppointmentError,
    );
  });

  it("refuses an appointment that is not the patient's", async () => {
    const store = makeStore([iso(48)], { getOwnMutable: vi.fn(async () => null) });

    await expect(listRescheduleOptions(PRINCIPAL, "a1", store, NOW)).rejects.toThrow(
      AppointmentError,
    );
  });
});

describe("the ACTION enforces minimum notice independently of the list", () => {
  it("refuses a slot inside the minimum notice even though it was never offered", async () => {
    const store = makeStore([]);

    // A forged POST: this slot appears in no list the server produced.
    await expect(
      rescheduleAppointment(PRINCIPAL, "a1", { startsAt: new Date(NOW.getTime() + 2 * H) }, store, NOW),
    ).rejects.toMatchObject({ code: "min_notice" });

    expect(store.rescheduleOwn).not.toHaveBeenCalled();
  });

  it("accepts a slot exactly at the boundary", async () => {
    const store = makeStore([]);

    await rescheduleAppointment(
      PRINCIPAL,
      "a1",
      { startsAt: new Date(NOW.getTime() + RESCHEDULE_MIN_NOTICE_HOURS * H) },
      store,
      NOW,
    );

    expect(store.rescheduleOwn).toHaveBeenCalledOnce();
  });

  it("still refuses a slot in the past, with the past-specific code", async () => {
    const store = makeStore([]);

    await expect(
      rescheduleAppointment(PRINCIPAL, "a1", { startsAt: new Date(NOW.getTime() - H) }, store, NOW),
    ).rejects.toMatchObject({ code: "slot_in_past" });
  });
});
