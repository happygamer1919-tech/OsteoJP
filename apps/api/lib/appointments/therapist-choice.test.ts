import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bookAppointment,
  listBookableTherapists,
  listOpenSlots,
  listRescheduleOptions,
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

// Q-M (owner ruling, 2026-10-20) REPLACED THIS BLOCK'S PREMISE. It was titled
// "the roster is a roster, not a restriction (PL-06a)" and asserted the roster
// came back "unfiltered by service". Q-M supersedes PL-06a for the patient-facing
// surfaces only: the roster, the slots and the assignment keep only therapists
// mapped to the service. The filter itself is SQL and is proven against Postgres
// in therapist-service-mapping.db.test.ts; what this unit suite can prove is that
// the orchestration HANDS THE SERVICE to every store query that must filter by it.
describe("the roster, the slots and the assignment are asked for THIS service (Q-M)", () => {
  it("the roster query receives the resolved service id", async () => {
    const seen: unknown[] = [];
    const { store } = makeStore({
      listBookableTherapists: async (_p: unknown, args: unknown) => {
        seen.push(args);
        return [{ id: "th-ana", name: "Ana" }];
      },
    } as Partial<AppointmentsStore>);
    const rows = await listBookableTherapists(
      principal,
      { serviceId: "svc-1", locationId: "loc-1" },
      store,
    );
    expect(seen).toEqual([{ locationId: "loc-1", serviceId: "svc-1" }]);
    expect(rows.map((r) => r.id)).toEqual(["th-ana"]);
  });

  it("the assignment query receives the resolved service id", async () => {
    const seen: Array<{ serviceId?: string }> = [];
    const { store } = makeStore({
      listAvailableTherapists: async (_p: unknown, args: { serviceId?: string }) => {
        seen.push(args);
        return AVAILABLE;
      },
    } as Partial<AppointmentsStore>);
    await bookAppointment(
      principal,
      { serviceId: "svc-1", locationId: "loc-1", startsAt: future(), practitionerId: null },
      store,
      new Date(),
    );
    expect(seen.map((a) => a.serviceId)).toEqual([SERVICE.id]);
  });

  it("the slot sweep receives the resolved service id, with and without a chosen therapist", async () => {
    const seen: Array<{ serviceId?: string | null; practitionerId?: string | null }> = [];
    const { store } = makeStore({
      listOpenSlots: async (_p: unknown, args: { serviceId?: string | null; practitionerId?: string | null }) => {
        seen.push(args);
        return [];
      },
    } as Partial<AppointmentsStore>);
    await listOpenSlots(principal, { serviceId: "svc-1", locationId: "loc-1", practitionerId: null }, store, new Date());
    await listOpenSlots(principal, { serviceId: "svc-1", locationId: "loc-1", practitionerId: "th-ana" }, store, new Date());
    expect(seen.map((a) => [a.serviceId, a.practitionerId])).toEqual([
      [SERVICE.id, null],
      [SERVICE.id, "th-ana"],
    ]);
  });

  it("the reschedule options are NOT a new assignment and ask for no service", async () => {
    const seen: Array<{ serviceId?: string | null }> = [];
    const startsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { store } = makeStore({
      getOwnMutable: async () => ({
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        status: "scheduled",
        locationId: "loc-1",
        practitionerId: "th-ana",
      }),
      listOpenSlots: async (_p: unknown, args: { serviceId?: string | null }) => {
        seen.push(args);
        return [];
      },
    } as Partial<AppointmentsStore>);
    await listRescheduleOptions(principal, "appt-1", store, new Date());
    expect(seen.map((a) => a.serviceId)).toEqual([null]);
  });

  it("a chosen therapist the service-filtered set does not hold is refused, not swapped", async () => {
    // The store answers with the MAPPED set only; th-bruno is not in it.
    const { store, created } = makeStore({
      listAvailableTherapists: async () => [{ practitionerId: "th-ana", sortKey: "Ana" }],
    } as Partial<AppointmentsStore>);
    await expect(
      bookAppointment(
        principal,
        { serviceId: "svc-1", locationId: "loc-1", startsAt: future(), practitionerId: "th-bruno" },
        store,
        new Date(),
      ),
    ).rejects.toMatchObject({ code: "no_therapist" });
    expect(created).toEqual([]);
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

  /**
   * PORTAL-ROSTER - THE NEGATIVE CONTROL FOR THE VALIDITY FIX LIVES HERE.
   *
   * The predicate is raw SQL, so the DB-gated suite
   * (packages/db/tests/portal-roster-template-validity.db.test.ts) proves what
   * POSTGRES does with those two bounds, against rows where each one matters -
   * but it mirrors the SQL rather than importing it, so reverting store.ts would
   * leave it green. THESE arms are what go red on a revert, which is what makes
   * the pair a control rather than two descriptions of the same hope.
   */
  /**
   * BOUNDED TO THE METHOD, the way bookable-parity.test.ts bounds its own arms.
   * A fixed character window would be wrong here: `priorCompletedServiceId`
   * follows immediately and orders by `appointments.startsAt`, so a loose slice
   * would drag its text in and the "no window was invented" arm below would be
   * asserting against the wrong function.
   */
  const ROSTER_FN = (() => {
    const fn = STORE.slice(STORE.indexOf("async listBookableTherapists"));
    return fn.slice(0, fn.indexOf("},"));
  })();

  it("the roster query bounds the template by valid_from", () => {
    expect(ROSTER_FN).toMatch(/av\.valid_from\s+is null or av\.valid_from\s+<=/);
  });

  it("the roster query bounds the template by valid_until", () => {
    // The defect itself: an expired window kept its therapist on the list while
    // the slot query, which does read it, offered them nothing.
    expect(ROSTER_FN).toMatch(/av\.valid_until is null or av\.valid_until >=/);
  });

  it("it compares against the slot step's horizon from today in Lisbon, not a window it invented", () => {
    // The roster step has no date (that is why this is not listAvailableTherapists).
    // Strategy R15 (2026-10-26) replaced owner ruling Q-ROSTER's "now" with the
    // days the slot step can offer. A startsAt/endsAt appearing inside THIS
    // method would mean somebody turned the roster back into an availability
    // query.
    expect(ROSTER_FN).toMatch(/now\(\) at time zone/);
    expect(ROSTER_FN).not.toMatch(/startsAt|endsAt/);
  });

  /**
   * R15 - THE WINDOW OVERLAPS [today, today + OPEN_SLOTS_HORIZON_DAYS].
   * A template counts when it starts on or before the horizon's last day and
   * ends on or after today. The horizon is the slot step's own constant, never a
   * second number, so the roster and the slots cannot drift apart.
   */
  it("R15: valid_from is bounded by today + OPEN_SLOTS_HORIZON_DAYS", () => {
    expect(ROSTER_FN).toMatch(
      /av\.valid_from\s+<= \(now\(\) at time zone \$\{LISBON\}\)::date \+ \$\{OPEN_SLOTS_HORIZON_DAYS\}::int\)/,
    );
  });

  it("R15: valid_until is still bounded by today alone (an expired row offers no day)", () => {
    expect(ROSTER_FN).toMatch(
      /av\.valid_until >= \(now\(\) at time zone \$\{LISBON\}\)::date\)/,
    );
  });

  it("R15: the horizon is the slot step's constant, imported, and the slot step uses it too", () => {
    expect(STORE).toMatch(/import \{ OPEN_SLOTS_HORIZON_DAYS \} from "\.\/booking";/);
    expect(STORE).not.toMatch(/OPEN_SLOTS_HORIZON_DAYS\s*=/);
    expect(BOOKING).toMatch(/export const OPEN_SLOTS_HORIZON_DAYS = \d+;/);
    const slots = BOOKING.slice(BOOKING.indexOf("export async function listOpenSlots"));
    expect(slots.slice(0, slots.indexOf("\n}\n"))).toMatch(/horizonDays: OPEN_SLOTS_HORIZON_DAYS,/);
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
