import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientPrincipal } from "@osteojp/auth";
import {
  resetPatientChangeConsumer,
  setPatientChangeConsumer,
  stubConsumer,
} from "@/lib/notifications/patient-change";
import {
  bookAppointment,
  cancelAppointment,
  getOwnAppointment,
  listOwnAppointments,
  listOpenSlots,
  parseBookingInput,
  rescheduleAppointment,
  type AppointmentsStore,
  type AppointmentStatus,
  type AppointmentView,
} from "./booking";
import { isAppointmentError } from "./errors";
import type { TherapistCandidate } from "./therapist";

// Adversarial tests for the patient appointments orchestration. The fake store
// models the trust boundary the real store enforces (self-scope by
// principal.patientId; writes carry the principal's patient_id, never payload),
// so these prove the guardrails at the logic layer without a DB:
//   * a patient sees / touches ONLY their own appointments;
//   * the 24h cancel/reschedule cutoff is server-enforced;
//   * conflict detection blocks double-booking on book + reschedule;
//   * patient_id is taken from the principal, never the request body.

const NOW = new Date("2026-06-10T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

const ALICE: PatientPrincipal = { tenantId: "t-1", patientId: "alice", userId: "auth-a" };
const BOB: PatientPrincipal = { tenantId: "t-1", patientId: "bob", userId: "auth-b" };

type Row = {
  id: string;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  locationId: string;
  practitionerId: string;
  serviceId: string | null;
};

function view(r: Row): AppointmentView {
  return {
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    status: r.status,
    serviceName: "Osteopatia",
    locationName: "Linda-a-Velha",
    practitionerName: "Dr. João",
    room: null,
  };
}

type FakeOpts = {
  rows?: Row[];
  service?: { id: string; name: string; durationMin: number; locationId: string | null } | null;
  bookableLocation?: boolean;
  available?: TherapistCandidate[];
  prior?: string | null;
  conflict?: boolean;
  openSlots?: string[];
};

function makeStore(opts: FakeOpts = {}) {
  const rows: Row[] = opts.rows ? [...opts.rows] : [];
  const createCalls: { principal: PatientPrincipal; args: Record<string, unknown> }[] = [];
  let seq = 0;

  const openSlotsCalls: { locationId: string; durationMin: number; horizonDays: number }[] = [];
  const store: AppointmentsStore = {
    async listOwn(p) {
      return rows.filter((r) => r.patientId === p.patientId).map(view);
    },
    async getOwn(p, id) {
      const r = rows.find((x) => x.id === id && x.patientId === p.patientId);
      return r ? view(r) : null; // self-scope: not yours → null
    },
    async priorCompletedServiceId() {
      return null;
    },
    async getCatalog() {
      return { locations: [], services: [], preselectedServiceId: null, preselectedLocationId: null };
    },
    // A1: the home clinic read. Null keeps these suites about what they test.
    async primaryLocationId() {
      return null;
    },
    // A2: the therapist-step roster. Empty keeps these suites about what they
    // test - the choose-for-me path never consults it.
    async listBookableTherapists() {
      return [];
    },
    async getBookableService(_p, serviceId) {
      if (opts.service === null) return null;
      const svc = opts.service ?? { id: serviceId, name: "Osteopatia", durationMin: 60, locationId: null };
      return svc;
    },
    async isBookableLocation() {
      return opts.bookableLocation ?? true;
    },
    async listOpenSlots(_p, args) {
      openSlotsCalls.push({
        locationId: args.locationId,
        durationMin: args.durationMin,
        horizonDays: args.horizonDays,
      });
      return opts.openSlots ?? [];
    },
    async listAvailableTherapists() {
      return opts.available ?? [{ practitionerId: "ther-1", sortKey: "Ana" }];
    },
    async priorTherapistId() {
      return opts.prior ?? null;
    },
    async createBooking(p, args) {
      createCalls.push({ principal: p, args });
      const id = `new-${++seq}`;
      // The fake mirrors the real store: the row's patient_id is the PRINCIPAL's.
      rows.push({
        id,
        patientId: p.patientId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        status: "scheduled",
        locationId: args.locationId,
        practitionerId: args.practitionerId,
        serviceId: args.serviceId,
      });
      return id;
    },
    async getOwnMutable(p, id) {
      const r = rows.find((x) => x.id === id && x.patientId === p.patientId);
      return r
        ? {
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            status: r.status,
            locationId: r.locationId,
            practitionerId: r.practitionerId,
          }
        : null;
    },
    async cancelOwn(p, id) {
      const r = rows.find((x) => x.id === id && x.patientId === p.patientId);
      if (r) r.status = "cancelled";
    },
    async rescheduleOwn(p, id, a) {
      const r = rows.find((x) => x.id === id && x.patientId === p.patientId);
      if (r) {
        r.startsAt = a.startsAt;
        r.endsAt = a.endsAt;
      }
    },
    async hasWindowConflict() {
      return opts.conflict ?? false;
    },
  };

  return { store, rows, createCalls, openSlotsCalls };
}

const ownRow = (over: Partial<Row> = {}): Row => ({
  id: "appt-alice",
  patientId: "alice",
  startsAt: inHours(72),
  endsAt: inHours(73),
  status: "scheduled",
  locationId: "loc-1",
  practitionerId: "ther-1",
  serviceId: "svc-1",
  ...over,
});

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "NO_THROW";
  } catch (e) {
    return isAppointmentError(e) ? e.code : "OTHER";
  }
}

/* --------------------------- self-scope ---------------------------------- */

/**
 * ==========================================================================
 * ACC-preselection-spec-flaky — THE FLAKE'S CAUSE, NOT ITS TRIGGER.
 * ==========================================================================
 * `booking.test.ts > "allows a cancel outside 24h"` failed twice on a 5040ms
 * TIMEOUT against a suite that runs in well under a second, and passed on
 * re-run of the same commit. The card's reading was that the runner is
 * occasionally slow enough for a timeout-bounded assertion to lose.
 *
 * THE RUNNER BEING SLOW IS THE TRIGGER. THE CAUSE IS THAT THIS UNIT SUITE WAS
 * MAKING A REAL DATABASE CONNECTION ATTEMPT. The CI log says so in its own
 * words, naming this block's own fixture:
 *
 *   [notifications] patient-change emit FAILED kind=cancelled tenant=t-1
 *   appointment=appt-alice Error: @osteojp/db: DATABASE_URL is not set.
 *
 * `cancelAppointment` calls `emitPatientChange`, which is best-effort and
 * swallows its own failure - so nothing failed, nothing was asserted, and the
 * only trace was a log line. What it does NOT do is return instantly: it
 * resolves a client and attempts a connection first. On a loaded runner that
 * attempt is the variable-latency step that pushed a sub-second test past five
 * seconds.
 *
 * THE STUB EXISTED ALL ALONG AND WAS SCOPED TO ONE describe. It sat in a
 * `beforeEach` inside a later block, so every block above it - including the
 * 24h cutoff block - ran against the real consumer. Hoisting it to file scope
 * is the whole fix.
 *
 * WHY THIS IS BETTER THAN RAISING THE TIMEOUT, which was the obvious answer: a
 * longer timeout makes the flake rarer while leaving a unit test dependent on
 * how fast a socket fails. The test never wanted the network at all.
 */
beforeEach(() => setPatientChangeConsumer(stubConsumer));
afterEach(() => resetPatientChangeConsumer());

describe("self-scope: a patient only ever sees/touches their own", () => {
  const bobRow = ownRow({ id: "appt-bob", patientId: "bob" });

  it("listOwn returns only the caller's appointments", async () => {
    const { store } = makeStore({ rows: [ownRow(), bobRow] });
    const alice = await listOwnAppointments(ALICE, store);
    expect(alice.map((a) => a.id)).toEqual(["appt-alice"]);
    const bob = await listOwnAppointments(BOB, store);
    expect(bob.map((a) => a.id)).toEqual(["appt-bob"]);
  });

  it("getOwn for another patient's id is not_found, never the row", async () => {
    const { store } = makeStore({ rows: [bobRow] });
    expect(await code(() => getOwnAppointment(ALICE, "appt-bob", store))).toBe("not_found");
  });

  it("cancel of another patient's appointment is not_found and leaves it untouched", async () => {
    const { store, rows } = makeStore({ rows: [bobRow] });
    expect(await code(() => cancelAppointment(ALICE, "appt-bob", store, NOW))).toBe("not_found");
    expect(rows.find((r) => r.id === "appt-bob")!.status).toBe("scheduled");
  });

  it("reschedule of another patient's appointment is not_found", async () => {
    const { store } = makeStore({ rows: [bobRow] });
    const out = await code(() =>
      rescheduleAppointment(ALICE, "appt-bob", { startsAt: inHours(80) }, store, NOW),
    );
    expect(out).toBe("not_found");
  });
});

/* --------------------------- 24h cutoff ---------------------------------- */

describe("24h cutoff is server-enforced", () => {
  it("rejects a cancel inside 24h regardless of client", async () => {
    const { store, rows } = makeStore({ rows: [ownRow({ startsAt: inHours(2), endsAt: inHours(3) })] });
    expect(await code(() => cancelAppointment(ALICE, "appt-alice", store, NOW))).toBe("cutoff");
    expect(rows[0].status).toBe("scheduled"); // untouched
  });

  it("allows a cancel outside 24h", async () => {
    const { store, rows } = makeStore({ rows: [ownRow({ startsAt: inHours(48) })] });
    await cancelAppointment(ALICE, "appt-alice", store, NOW);
    expect(rows[0].status).toBe("cancelled");
  });

  it("rejects a reschedule inside 24h (cutoff on the CURRENT start)", async () => {
    const { store } = makeStore({ rows: [ownRow({ startsAt: inHours(5), endsAt: inHours(6) })] });
    const out = await code(() =>
      rescheduleAppointment(ALICE, "appt-alice", { startsAt: inHours(100) }, store, NOW),
    );
    expect(out).toBe("cutoff");
  });

  it("allows a reschedule outside 24h and preserves duration", async () => {
    const { store, rows } = makeStore({ rows: [ownRow({ startsAt: inHours(48), endsAt: inHours(49) })] });
    await rescheduleAppointment(ALICE, "appt-alice", { startsAt: inHours(100) }, store, NOW);
    expect(rows[0].startsAt.toISOString()).toBe(inHours(100).toISOString());
    expect(rows[0].endsAt.toISOString()).toBe(inHours(101).toISOString()); // 60-min duration kept
  });

  it("cannot be bypassed by a completed/cancelled appointment either", async () => {
    const { store } = makeStore({ rows: [ownRow({ status: "completed" })] });
    expect(await code(() => cancelAppointment(ALICE, "appt-alice", store, NOW))).toBe("not_reschedulable");
  });
});

/* --------------------------- booking ------------------------------------- */

// INC-06: this suite books, and booking emits. It used to rely on the emit
// falling through to an inert DEFAULT, which is the exact reliance that let a
// production emit reach nothing for the life of the project. The default is now
// the real consumer, so a suite that wants nothing delivered has to SAY SO.
// Without this the emit would reach ./centre and try to open a database from a
// unit test.
describe("book", () => {
  // The stub is installed at FILE scope now (see the header): it was scoped to
  // this block alone, which is why every block above it hit the network.

  it("takes patient_id from the principal, never the request body", async () => {
    const { store, createCalls, rows } = makeStore();
    // Hostile body smuggling another patient id and a price.
    //
    // A2 CHANGED WHAT HAPPENS TO A SMUGGLED practitionerId, and the change is a
    // STRENGTHENING rather than a loosening. It used to be read and dropped on
    // the floor; the patient may now choose a therapist, so it is read and
    // VALIDATED against the bookable candidate set. A malformed id is refused by
    // parseBookingInput and a well-formed but non-bookable one is refused by
    // bookAppointment - both louder than the old silent ignore. That refusal has
    // its own arms in therapist-choice.test.ts, including the one that matters
    // most: it must not fall back to auto-assignment.
    //
    // THIS TEST KEEPS ITS OWN SUBJECT, which is patient_id. The therapist named
    // below is a legitimate candidate so the booking proceeds and the patient_id
    // assertions can actually run; smuggling an evil one here would make this
    // test pass for the wrong reason (a throw), and it is not this test's job.
    const raw = {
      serviceId: "11111111-1111-1111-1111-111111111111",
      locationId: "22222222-2222-2222-2222-222222222222",
      startsAt: inHours(72).toISOString(),
      patient_id: "bob",
      patientId: "bob",
      priceCents: 0,
    };
    const input = parseBookingInput(raw);
    await bookAppointment(ALICE, input, store, NOW);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].principal.patientId).toBe("alice");
    // The new row belongs to Alice; the smuggled bob and price are ignored.
    expect(rows.at(-1)!.patientId).toBe("alice");
  });

  it("REFUSES a smuggled therapist id rather than ignoring it (A2)", async () => {
    // The clause the test above used to carry, now asserted at its real
    // strength. `ther-evil` is not in the candidate set, so the booking is
    // refused outright - it is neither honoured nor quietly swapped for an
    // auto-assignment.
    const { store, rows } = makeStore();
    const before = rows.length;
    await expect(
      bookAppointment(
        ALICE,
        {
          serviceId: "11111111-1111-1111-1111-111111111111",
          locationId: "22222222-2222-2222-2222-222222222222",
          startsAt: inHours(72),
          practitionerId: "99999999-9999-4999-8999-999999999999",
        },
        store,
        NOW,
      ),
    ).rejects.toThrow();
    expect(rows).toHaveLength(before);
  });

  it("applies the returning-patient soft preference", async () => {
    const { store, rows } = makeStore({
      available: [
        { practitionerId: "ther-ana", sortKey: "Ana" },
        { practitionerId: "ther-rui", sortKey: "Rui" },
      ],
      prior: "ther-rui",
    });
    await bookAppointment(
      ALICE,
      { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1", startsAt: inHours(72) },
      store,
      NOW,
    );
    expect(rows.at(-1)!.practitionerId).toBe("ther-rui"); // prior preferred, not Ana
  });

  it("returns no_therapist when nobody works the window (honest error, never double-books)", async () => {
    const { store } = makeStore({ available: [] });
    const out = await code(() =>
      bookAppointment(
        ALICE,
        { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1", startsAt: inHours(72) },
        store,
        NOW,
      ),
    );
    // The schedule-gap rejection is DISTINCT from no_slot (the createBooking
    // race), so the portal can word it honestly.
    expect(out).toBe("no_therapist");
  });

  it("listOpenSlots resolves the service and passes its duration + the 14-day horizon", async () => {
    const { store, openSlotsCalls } = makeStore({
      service: { id: "svc-1", name: "Osteopatia", durationMin: 45, locationId: null },
      openSlots: ["2026-06-15T08:00:00.000Z"],
    });
    const slots = await listOpenSlots(
      ALICE,
      { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1" },
      store,
      NOW,
    );
    expect(slots).toEqual(["2026-06-15T08:00:00.000Z"]);
    expect(openSlotsCalls).toEqual([{ locationId: "loc-1", durationMin: 45, horizonDays: 14 }]);
  });

  it("listOpenSlots rejects a non-bookable service", async () => {
    const { store } = makeStore({ service: null });
    const out = await code(() =>
      listOpenSlots(
        ALICE,
        { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1" },
        store,
        NOW,
      ),
    );
    expect(out).toBe("service_unavailable");
  });

  it("listOpenSlots rejects a non-bookable location", async () => {
    const { store } = makeStore({ bookableLocation: false });
    const out = await code(() =>
      listOpenSlots(
        ALICE,
        { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1" },
        store,
        NOW,
      ),
    );
    expect(out).toBe("location_unavailable");
  });

  it("listOpenSlots rejects a location-bound service queried at another location", async () => {
    const { store } = makeStore({
      service: { id: "svc-1", name: "Osteopatia", durationMin: 60, locationId: "loc-2" },
    });
    const out = await code(() =>
      listOpenSlots(
        ALICE,
        { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1" },
        store,
        NOW,
      ),
    );
    expect(out).toBe("service_unavailable");
  });

  it("rejects a slot in the past", async () => {
    const { store } = makeStore();
    const out = await code(() =>
      bookAppointment(
        ALICE,
        { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1", startsAt: inHours(-1) },
        store,
        NOW,
      ),
    );
    expect(out).toBe("slot_in_past");
  });

  it("rejects an unbookable service and an unbookable location", async () => {
    const noService = makeStore({ service: null });
    expect(
      await code(() =>
        bookAppointment(
          ALICE,
          { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1", startsAt: inHours(72) },
          noService.store,
          NOW,
        ),
      ),
    ).toBe("service_unavailable");

    const noLoc = makeStore({ bookableLocation: false });
    expect(
      await code(() =>
        bookAppointment(
          ALICE,
          { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1", startsAt: inHours(72) },
          noLoc.store,
          NOW,
        ),
      ),
    ).toBe("location_unavailable");
  });
});

describe("reschedule re-runs conflict detection", () => {
  it("rejects with no_slot when the new window conflicts", async () => {
    const spy = vi.fn<AppointmentsStore["hasWindowConflict"]>(async () => true);
    const base = makeStore({ rows: [ownRow({ startsAt: inHours(48), endsAt: inHours(49) })] });
    const store: AppointmentsStore = { ...base.store, hasWindowConflict: spy };
    const out = await code(() =>
      rescheduleAppointment(ALICE, "appt-alice", { startsAt: inHours(100) }, store, NOW),
    );
    expect(out).toBe("no_slot");
    expect(spy).toHaveBeenCalledOnce();
    // The conflict check excludes the appointment being moved.
    expect(spy.mock.calls[0][1]).toMatchObject({ excludeIds: ["appt-alice"], practitionerId: "ther-1" });
  });
});

describe("parseBookingInput", () => {
  it("rejects malformed bodies", async () => {
    expect(await code(async () => parseBookingInput(null))).toBe("invalid_input");
    expect(await code(async () => parseBookingInput({ serviceId: "x", locationId: "y", startsAt: "z" }))).toBe(
      "invalid_input",
    );
    expect(
      await code(async () =>
        parseBookingInput({
          serviceId: "11111111-1111-1111-1111-111111111111",
          locationId: "22222222-2222-2222-2222-222222222222",
          startsAt: "not-a-date",
        }),
      ),
    ).toBe("invalid_input");
  });
});

// W3 / Y2 — a no_show now RELEASES its slot (migration 0052). The owner's
// question: can a slot freed that way, in the PAST, be booked?
//
// The answer must not rest on "past dates are handled elsewhere". That is the
// class of assumption this workstream disproved four times, so it is asserted
// here directly. Three independent guards are exercised or pinned:
//   1. bookAppointment refuses a past start, even with NO conflict reported.
//   2. rescheduleAppointment refuses a past destination, same condition.
//   3. the SQL sweep carries a `starts_at > now` floor (pinned below), so a
//      past slot is never even offered.
describe("W3: a no_show freed in the PAST is still not bookable", () => {
  it("refuses to book a past slot even when the store reports it CONFLICT-FREE", async () => {
    // This is exactly the post-0052 state: the old no_show no longer blocks, so
    // the conflict check says the slot is free. The past guard must still win.
    const { store } = makeStore();
    store.hasWindowConflict = async () => false;

    const out = await code(() =>
      bookAppointment(
        ALICE,
        {
          serviceId: "11111111-1111-1111-1111-111111111111",
          locationId: "loc-1",
          startsAt: inHours(-24),
        },
        store,
        NOW,
      ),
    );
    expect(out).toBe("slot_in_past");
  });

  it("refuses to RESCHEDULE into a past slot freed by a no_show", async () => {
    // Seed a real, far-future, reschedulable appointment of Alice's, so the
    // only thing that can refuse the move is the past-date guard.
    const seeded = ownRow({ startsAt: inHours(48), endsAt: inHours(49) });
    const { store } = makeStore({ rows: [seeded] });
    store.hasWindowConflict = async () => false;

    const out = await code(() =>
      rescheduleAppointment(
        ALICE,
        seeded.id,
        { startsAt: inHours(-24) },
        store,
        NOW,
      ),
    );
    expect(out).toBe("slot_in_past");
  });

  it("still allows a FUTURE slot, so the guard is not vacuously refusing everything", async () => {
    // Positive control. Without it, a verifier that rejected every booking
    // would pass both assertions above while the portal was unusable.
    const { store } = makeStore();
    store.hasWindowConflict = async () => false;

    const out = await code(() =>
      bookAppointment(
        ALICE,
        {
          serviceId: "11111111-1111-1111-1111-111111111111",
          locationId: "loc-1",
          startsAt: inHours(48),
        },
        store,
        NOW,
      ),
    );
    expect(out).not.toBe("slot_in_past");
  });
});

