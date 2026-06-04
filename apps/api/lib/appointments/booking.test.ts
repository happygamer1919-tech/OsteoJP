import { describe, expect, it, vi } from "vitest";
import type { PatientPrincipal } from "@osteojp/auth";
import {
  bookAppointment,
  cancelAppointment,
  getOwnAppointment,
  listOwnAppointments,
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
};

function makeStore(opts: FakeOpts = {}) {
  const rows: Row[] = opts.rows ? [...opts.rows] : [];
  const createCalls: { principal: PatientPrincipal; args: Record<string, unknown> }[] = [];
  let seq = 0;

  const store: AppointmentsStore = {
    async listOwn(p) {
      return rows.filter((r) => r.patientId === p.patientId).map(view);
    },
    async getOwn(p, id) {
      const r = rows.find((x) => x.id === id && x.patientId === p.patientId);
      return r ? view(r) : null; // self-scope: not yours → null
    },
    async getCatalog() {
      return { locations: [], services: [] };
    },
    async getBookableService(_p, serviceId) {
      if (opts.service === null) return null;
      const svc = opts.service ?? { id: serviceId, name: "Osteopatia", durationMin: 60, locationId: null };
      return svc;
    },
    async isBookableLocation() {
      return opts.bookableLocation ?? true;
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

  return { store, rows, createCalls };
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

describe("book", () => {
  it("takes patient_id from the principal, never the request body", async () => {
    const { store, createCalls, rows } = makeStore();
    // Hostile body smuggling another patient id, a chosen therapist and a price.
    const raw = {
      serviceId: "11111111-1111-1111-1111-111111111111",
      locationId: "22222222-2222-2222-2222-222222222222",
      startsAt: inHours(72).toISOString(),
      patient_id: "bob",
      patientId: "bob",
      practitionerId: "ther-evil",
      priceCents: 0,
    };
    const input = parseBookingInput(raw);
    await bookAppointment(ALICE, input, store, NOW);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].principal.patientId).toBe("alice");
    // The new row belongs to Alice; the smuggled bob / evil therapist are ignored.
    expect(rows.at(-1)!.patientId).toBe("alice");
    expect(rows.at(-1)!.practitionerId).not.toBe("ther-evil");
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

  it("returns no_slot when no therapist is available (never double-books)", async () => {
    const { store } = makeStore({ available: [] });
    const out = await code(() =>
      bookAppointment(
        ALICE,
        { serviceId: "11111111-1111-1111-1111-111111111111", locationId: "loc-1", startsAt: inHours(72) },
        store,
        NOW,
      ),
    );
    expect(out).toBe("no_slot");
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
