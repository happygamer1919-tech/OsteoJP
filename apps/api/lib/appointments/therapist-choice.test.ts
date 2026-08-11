import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bookAppointment,
  listBookableTherapists,
  parseBookingInput,
  type AppointmentsStore,
} from "./booking";
import { AppointmentError } from "./errors";

vi.mock("@/lib/notifications/patient-change", () => ({
  emitPatientChange: vi.fn(async () => ({ delivered: true })),
}));

/**
 * A2 — the patient may CHOOSE a therapist, and the choice is VALIDATED, never
 * trusted.
 *
 * THE DEFECT THIS EXISTS TO PREVENT is D2 (f821eac) reintroduced from the other
 * direction. D2 was: the SERVER auto-assigned a portal booking to an
 * ADMINISTRATOR whom the staff dropdown refuses, because `listAvailableTherapists`
 * did not carry `is_bookable`. A2 lets the CLIENT name a therapist. If that id
 * were taken on trust, the portal would book someone the staff surface rejects -
 * the same defect, arrived at from the opposite side, and this time
 * attacker-controlled because it comes from the request body.
 *
 * THE NEGATIVE ARMS ARE THE POINT. Each names the wrong implementation it
 * refuses:
 *   - an id that is NOT bookable must be REFUSED, not silently swapped for an
 *     auto-assignment. A fallback would give the patient a booking with someone
 *     they did not ask for, discovered on arrival.
 *   - a cross-tenant or nonsense id must be refused by the same path, since the
 *     body is attacker-controlled.
 *   - omitting the field must preserve auto-assignment EXACTLY, so the
 *     "let us choose for you" option is not a second, subtly different code path.
 *   - a source-level arm proves no FOURTH is_bookable predicate was written and
 *     no role/title filter was introduced (PL-06b).
 */

const principal = {
  tenantId: "tenant-A",
  patientId: "patient-1",
} as unknown as Parameters<typeof bookAppointment>[0];

const SERVICE = { id: "svc-1", name: "Osteopatia", durationMin: 60, locationId: null };

/** Bookable, available candidates - what listAvailableTherapists returns. */
const AVAILABLE = [
  { practitionerId: "th-ana", sortKey: "Ana" },
  { practitionerId: "th-bruno", sortKey: "Bruno" },
];

function makeStore(over: Partial<AppointmentsStore> = {}) {
  const created: Array<{ practitionerId: string }> = [];
  const store = {
    async getBookableService() {
      return SERVICE;
    },
    async isBookableLocation() {
      return true;
    },
    async listAvailableTherapists() {
      return AVAILABLE;
    },
    async priorTherapistId() {
      return null;
    },
    async createBooking(_p: unknown, args: { practitionerId: string }) {
      created.push({ practitionerId: args.practitionerId });
      return "appt-1";
    },
    async getOwn() {
      return {
        id: "appt-1",
        startsAt: new Date().toISOString(),
        endsAt: new Date().toISOString(),
        status: "scheduled",
        serviceName: null,
        locationName: null,
        practitionerName: null,
        room: null,
      };
    },
    async listBookableTherapists() {
      return [
        { id: "th-ana", name: "Ana" },
        { id: "th-bruno", name: "Bruno" },
      ];
    },
    ...over,
  } as unknown as AppointmentsStore;
  return { store, created };
}

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

describe("a chosen therapist is honoured", () => {
  it("books the therapist the patient named", async () => {
    const { store, created } = makeStore();
    await bookAppointment(
      principal,
      { serviceId: "svc-1", locationId: "loc-1", startsAt: future(), practitionerId: "th-bruno" },
      store,
      new Date(),
    );
    expect(created).toEqual([{ practitionerId: "th-bruno" }]);
  });
});

describe("NEGATIVE ARM: an unvalidated id must never reach a booking", () => {
  it("REFUSES a therapist who is not in the bookable/available set", async () => {
    // `listAvailableTherapists` already carries is_bookable (D2). An id absent
    // from it is not bookable, not this tenant's, or genuinely busy.
    const { store, created } = makeStore();
    await expect(
      bookAppointment(
        principal,
        {
          serviceId: "svc-1",
          locationId: "loc-1",
          startsAt: future(),
          practitionerId: "th-lurdes-admin",
        },
        store,
        new Date(),
      ),
    ).rejects.toThrow(AppointmentError);
    expect(created).toEqual([]);
  });

  it("does NOT silently fall back to auto-assignment when the choice is refused", async () => {
    // The load-bearing arm. A fallback would give the patient a booking with
    // someone they did not ask for, and they would find out on arrival.
    const { store, created } = makeStore();
    await expect(
      bookAppointment(
        principal,
        {
          serviceId: "svc-1",
          locationId: "loc-1",
          startsAt: future(),
          practitionerId: "th-nobody",
        },
        store,
        new Date(),
      ),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it("refuses a well-formed id belonging to nobody in the candidate set", async () => {
    const { store, created } = makeStore({
      listAvailableTherapists: async () => [],
    } as Partial<AppointmentsStore>);
    await expect(
      bookAppointment(
        principal,
        { serviceId: "svc-1", locationId: "loc-1", startsAt: future(), practitionerId: "th-ana" },
        store,
        new Date(),
      ),
    ).rejects.toThrow();
    expect(created).toEqual([]);
  });
});

describe('NEGATIVE ARM: "let us choose for you" is byte-for-byte the old path', () => {
  it("auto-assigns when practitionerId is omitted", async () => {
    const { store, created } = makeStore();
    await bookAppointment(
      principal,
      { serviceId: "svc-1", locationId: "loc-1", startsAt: future() },
      store,
      new Date(),
    );
    expect(created).toHaveLength(1);
    expect(AVAILABLE.map((c) => c.practitionerId)).toContain(created[0]!.practitionerId);
  });

  it("auto-assigns when practitionerId is explicitly null", async () => {
    const { store, created } = makeStore();
    await bookAppointment(
      principal,
      { serviceId: "svc-1", locationId: "loc-1", startsAt: future(), practitionerId: null },
      store,
      new Date(),
    );
    expect(created).toHaveLength(1);
  });

  it("still honours the prior-therapist preference when auto-assigning", async () => {
    const { store, created } = makeStore({
      priorTherapistId: async () => "th-bruno",
    } as Partial<AppointmentsStore>);
    await bookAppointment(
      principal,
      { serviceId: "svc-1", locationId: "loc-1", startsAt: future() },
      store,
      new Date(),
    );
    expect(created).toEqual([{ practitionerId: "th-bruno" }]);
  });
});

describe("the roster is a roster, not a restriction (PL-06a)", () => {
  it("returns every bookable therapist at the location, unfiltered by service", async () => {
    const { store } = makeStore();
    const rows = await listBookableTherapists(
      principal,
      { serviceId: "svc-1", locationId: "loc-1" },
      store,
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["th-ana", "th-bruno"]);
  });

  it("refuses to enumerate staff for a service the patient cannot book", async () => {
    const { store } = makeStore({
      getBookableService: async () => null,
    } as Partial<AppointmentsStore>);
    await expect(
      listBookableTherapists(principal, { serviceId: "svc-x", locationId: "loc-1" }, store),
    ).rejects.toThrow(AppointmentError);
  });

  it("refuses to enumerate staff at a location the patient cannot book", async () => {
    const { store } = makeStore({
      isBookableLocation: async () => false,
    } as Partial<AppointmentsStore>);
    await expect(
      listBookableTherapists(principal, { serviceId: "svc-1", locationId: "loc-x" }, store),
    ).rejects.toThrow(AppointmentError);
  });
});

describe("parseBookingInput treats practitionerId as shape-only", () => {
  const base = { serviceId: "11111111-1111-4111-8111-111111111111", locationId: "22222222-2222-4222-8222-222222222222", startsAt: "2026-09-01T10:00:00.000Z" };

  it("defaults to null when absent", () => {
    expect(parseBookingInput({ ...base }).practitionerId).toBeNull();
  });

  it("accepts an explicit null", () => {
    expect(parseBookingInput({ ...base, practitionerId: null }).practitionerId).toBeNull();
  });

  it("accepts a UUID", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(parseBookingInput({ ...base, practitionerId: id }).practitionerId).toBe(id);
  });

  it("rejects a non-UUID rather than ignoring it", () => {
    // Ignoring a malformed id would silently auto-assign for a patient who
    // believed they had chosen someone.
    expect(() => parseBookingInput({ ...base, practitionerId: "not-a-uuid" })).toThrow();
  });
});

describe("source-level: no fourth predicate, no role filter (PL-06b, D2)", () => {
  const strip = (p: string) =>
    readFileSync(join(__dirname, p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const STORE = strip("store.ts");
  const BOOKING = strip("booking.ts");

  it("the roster query filters on is_bookable", () => {
    expect(STORE).toMatch(/listBookableTherapists[\s\S]{0,2000}?is_bookable\s*=\s*true/);
  });

  it("no role or title predicate was introduced anywhere in the store", () => {
    expect(STORE).not.toMatch(/role_slug|roles\.slug|\bu\.title\b/);
  });

  it("bookAppointment validates the chosen id against the candidate set", () => {
    expect(BOOKING).toMatch(/available\.find\(/);
  });

  it("bookAppointment does not write its own is_bookable check", () => {
    // The membership test must reuse listAvailableTherapists' result, which D2
    // already fixed. A literal is_bookable here would be the fourth predicate.
    expect(BOOKING).not.toMatch(/is_bookable/);
  });

  it("the slots sweep carries the therapist filter in BOTH halves", () => {
    // Grid CTE and final EXISTS. Filtering only one would advertise a start that
    // a different therapist works, which the confirm would then refuse.
    const hits = STORE.match(/practitionerId \?\? null\}::uuid is null/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
