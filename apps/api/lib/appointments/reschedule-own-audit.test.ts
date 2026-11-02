/**
 * R44 (strategy, 2026-11-02): `rescheduleOwn` writes its `appointment.reschedule`
 * audit row in the SAME transaction as the move.
 *
 * Driven against the real `drizzleAppointmentsStore.rescheduleOwn` with the
 * database replaced by a recording fake whose `transaction` commits what its
 * callback did only when the callback resolves, the way a Postgres transaction
 * does. Proven here:
 *   - the row is written after the update, inside the callback, with
 *     `fromStartsAt` equal to the start the row held before the move;
 *   - a failing audit insert rejects the move and nothing commits;
 *   - no row (and no update) when the appointment is not the patient's or not
 *     movable, and no row when the update moved nothing;
 *   - no transaction at all when `rescheduleAppointment` refuses the move (the
 *     24h rule, a slot conflict, a closed clinic, a held clinic);
 *   - the staff notice still goes out only after the move has committed;
 *   - the re-plan event (owner, 2026-11-02, option 1) is sent once, AFTER the
 *     commit, with ids and the new start only; never for a move that did not
 *     commit, was refused, or moved an unaccepted request; and a failing send
 *     leaves the move and its row committed and the call resolved.
 * The Inngest package is replaced by a recorder here; the real client with no
 * key is exercised in portal-move-replan.test.ts.
 * Not proven here (needs a database): that Postgres rolls back on that throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/patient", () => ({ runAsPatient: vi.fn() }));
vi.mock("@/lib/booking/location-bookable", () => ({ locationHasBookableTherapist: vi.fn() }));

type Op =
  | { op: "select"; forUpdate: boolean }
  | { op: "lock" }
  | { op: "update"; set: Record<string, unknown> }
  | { op: "insert"; table: unknown; values: Record<string, unknown> };

type FakeOpts = {
  /** Rows each successive select resolves to, in order. */
  selects: Array<Array<Record<string, unknown>>>;
  /** Rows the update's RETURNING yields. */
  updated?: Array<{ id: string }>;
  /** Make the audit insert throw, as a failing write would. */
  insertFails?: boolean;
};

const db = vi.hoisted(() => ({
  current: null as null | {
    committed: Op[];
    transactions: number;
    timeline: string[];
    transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  },
}));

/** What the stand-in Inngest client was asked to send, and whether its next send fails. */
const bus = vi.hoisted(() => ({
  sent: [] as Array<{ name: string; data: Record<string, unknown> }>,
  fail: false,
}));

vi.mock("inngest", () => ({
  Inngest: class {
    send = async (e: { name: string; data: Record<string, unknown> }) => {
      db.current?.timeline.push("send");
      if (bus.fail) throw new TypeError("send refused");
      bus.sent.push(e);
      return { ids: ["evt"] };
    };
  },
}));

vi.mock("@osteojp/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@osteojp/db")>();
  return { ...real, getDbAdmin: () => db.current };
});

const { auditLog } = await import("@osteojp/db");
const { drizzleAppointmentsStore } = await import("./store");
const { rescheduleAppointment } = await import("./booking");
const { AppointmentError } = await import("./errors");
const { resetPatientChangeConsumer, setPatientChangeConsumer } = await import("@/lib/notifications/patient-change");

function installFakeDb(opts: FakeOpts) {
  const selects = [...opts.selects];
  const fake = {
    committed: [] as Op[],
    transactions: 0,
    timeline: [] as string[],
    async transaction(cb: (tx: unknown) => Promise<unknown>) {
      fake.transactions++;
      const pending: Op[] = [];
      const tx = {
        select: () => {
          let forUpdate = false;
          const chain = {
            from: () => chain,
            where: () => chain,
            limit: () => chain,
            for: (mode: string) => {
              forUpdate = mode === "update";
              return chain;
            },
            then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
              pending.push({ op: "select", forUpdate });
              return Promise.resolve(selects.shift() ?? []).then(res, rej);
            },
          };
          return chain;
        },
        execute: async () => {
          pending.push({ op: "lock" });
          return [];
        },
        update: () => {
          let set: Record<string, unknown> = {};
          const chain = {
            set: (v: Record<string, unknown>) => {
              set = v;
              return chain;
            },
            where: () => chain,
            returning: async () => {
              pending.push({ op: "update", set });
              return opts.updated ?? [{ id: APPT }];
            },
          };
          return chain;
        },
        insert: (table: unknown) => ({
          values: async (values: Record<string, unknown>) => {
            if (opts.insertFails) throw new Error("audit insert failed");
            pending.push({ op: "insert", table, values });
          },
        }),
      };
      const result = await cb(tx); // a throw leaves `pending` uncommitted
      fake.committed.push(...pending);
      fake.timeline.push("commit");
      return result;
    },
  };
  db.current = fake;
  return fake;
}

const NOW = new Date("2026-11-02T09:00:00.000Z");
const H = 3_600_000;
const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT = "55555555-5555-4555-8555-555555555555";
const APPT = "22222222-2222-4222-8222-222222222222";
const PRAC = "33333333-3333-4333-8333-333333333333";
const LOC = "44444444-4444-4444-8444-444444444444";
const HELD = "0f0f0f0f-1111-4222-8333-444444444444";
const PRINCIPAL = { tenantId: TENANT, patientId: PATIENT, role: "patient" } as never;

const OLD_START = new Date(NOW.getTime() + 5 * 24 * H);
const NEW_START = new Date(NOW.getTime() + 7 * 24 * H);
const NEW_END = new Date(NEW_START.getTime() + 45 * 60_000);

/** The two reads a successful move makes: the owner check, then the locked read of the start it leaves. */
const OWNED_AND_BEFORE = [
  [{ practitionerId: PRAC }],
  [{ startsAt: OLD_START, locationId: LOC, practitionerId: PRAC, status: "confirmed", origin: "patient_portal" }],
];
/** The same move, of a request the clinic has not accepted yet. */
const OWNED_AND_BEFORE_UNACCEPTED = [
  [{ practitionerId: PRAC }],
  [{ startsAt: OLD_START, locationId: LOC, practitionerId: PRAC, status: "scheduled", origin: "patient_portal" }],
];
/** A visit reception booked, still Agendada: not a request, so it re-plans. */
const OWNED_AND_BEFORE_STAFF_BOOKED = [
  [{ practitionerId: PRAC }],
  [{ startsAt: OLD_START, locationId: LOC, practitionerId: PRAC, status: "scheduled", origin: "staff" }],
];

beforeEach(() => {
  setPatientChangeConsumer(async () => {
    db.current?.timeline.push("notice");
    return { delivered: true };
  });
});
afterEach(() => {
  bus.sent = [];
  bus.fail = false;
  vi.restoreAllMocks();
  resetPatientChangeConsumer();
  vi.unstubAllEnvs();
  db.current = null;
});

describe("R44: rescheduleOwn writes the move's audit row in the move's transaction", () => {
  it("one transaction: owner read, slot lock, locked read, update, then the audit row", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.transactions).toBe(1);
    expect(fake.committed.map((o) => o.op)).toEqual(["select", "lock", "select", "update", "insert"]);
    // The read of the start it leaves takes the row lock, after the slot lock.
    expect(fake.committed[0]).toEqual({ op: "select", forUpdate: false });
    expect(fake.committed[2]).toEqual({ op: "select", forUpdate: true });
    expect(fake.committed[3]).toEqual({ op: "update", set: { startsAt: NEW_START, endsAt: NEW_END } });
  });

  it("the row: appointment.reschedule on this appointment, this tenant, fromStartsAt the start BEFORE the move", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    const insert = fake.committed.find((o) => o.op === "insert") as Extract<Op, { op: "insert" }>;
    expect(insert.table).toBe(auditLog);
    expect(insert.values).toEqual({
      tenantId: TENANT,
      actorUserId: null,
      action: "appointment.reschedule",
      entityType: "appointment",
      entityId: APPT,
      metadata: {
        practitionerId: PRAC,
        locationId: LOC,
        fromStartsAt: OLD_START.toISOString(),
        startsAt: NEW_START.toISOString(),
        endsAt: NEW_END.toISOString(),
        via: "patient_portal",
      },
      ip: null,
    });
  });

  it("a failing audit insert fails the move, and nothing of it commits", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE, insertFails: true });
    await expect(
      drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END }),
    ).rejects.toThrow("audit insert failed");
    expect(fake.transactions).toBe(1);
    expect(fake.committed).toEqual([]);
    expect(fake.timeline).toEqual([]);
    expect(bus.sent).toEqual([]);
  });

  it("not the patient's, or not movable: no lock, no update, no row", async () => {
    const fake = installFakeDb({ selects: [[]] });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.committed.map((o) => o.op)).toEqual(["select"]);
  });

  it("gone between the owner read and the locked read (cancelled meanwhile): no update, no row", async () => {
    const fake = installFakeDb({ selects: [[{ practitionerId: PRAC }], []] });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.committed.map((o) => o.op)).toEqual(["select", "lock", "select"]);
  });

  it("the update moved nothing: no row", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE, updated: [] });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.committed.map((o) => o.op)).toEqual(["select", "lock", "select", "update"]);
    expect(bus.sent).toEqual([]);
  });
});

describe("R44: rescheduleOwn re-plans the visit's reminders after the commit", () => {
  it("one appointment/scheduled, after the commit, ids and the new start only, no confirmation", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.timeline).toEqual(["commit", "send"]);
    expect(bus.sent).toHaveLength(1);
    const { saveId, ...rest } = bus.sent[0]!.data;
    expect(bus.sent[0]!.name).toBe("appointment/scheduled");
    expect(rest).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: NEW_START.toISOString(),
      practitionerId: PRAC,
      confirmationEligible: false,
    });
    expect(saveId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("a visit reception booked, still Agendada, is not a request: it re-plans", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE_STAFF_BOOKED });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.timeline).toEqual(["commit", "send"]);
  });

  it("an unaccepted request: the move and its row commit, the row has its own action, and nothing is sent", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE_UNACCEPTED });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(fake.committed.map((o) => o.op)).toEqual(["select", "lock", "select", "update", "insert"]);
    const insert = fake.committed.find((o) => o.op === "insert") as Extract<Op, { op: "insert" }>;
    expect(insert.values.action).toBe("appointment.pedido_reschedule.portal");
    expect(insert.values.metadata).toMatchObject({ fromStartsAt: OLD_START.toISOString(), startsAt: NEW_START.toISOString() });
    expect(fake.timeline).toEqual(["commit"]);
    expect(bus.sent).toEqual([]);
  });

  it("a visit reception booked, still Agendada, writes appointment.reschedule (it is not a request)", async () => {
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE_STAFF_BOOKED });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    const insert = fake.committed.find((o) => o.op === "insert") as Extract<Op, { op: "insert" }>;
    expect(insert.values.action).toBe("appointment.reschedule");
  });

  it("the Terapeuta on the row and the event is the one the LOCKED read saw", async () => {
    const LOCKED_PRAC = "66666666-6666-4666-8666-666666666666";
    const fake = installFakeDb({
      selects: [
        [{ practitionerId: PRAC }],
        [{ startsAt: OLD_START, locationId: LOC, practitionerId: LOCKED_PRAC, status: "confirmed", origin: "staff" }],
      ],
    });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    const insert = fake.committed.find((o) => o.op === "insert") as Extract<Op, { op: "insert" }>;
    expect((insert.values.metadata as Record<string, unknown>).practitionerId).toBe(LOCKED_PRAC);
    expect(bus.sent[0]!.data.practitionerId).toBe(LOCKED_PRAC);
  });

  it("a failing send: the call resolves, the move and its row stay committed, the failure is logged by name only", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errors.push(a);
    });
    bus.fail = true;
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE });
    await expect(
      drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END }),
    ).resolves.toBeUndefined();
    expect(fake.committed.map((o) => o.op)).toEqual(["select", "lock", "select", "update", "insert"]);
    expect(fake.timeline).toEqual(["commit", "send"]);
    expect(errors).toEqual([["portal: reminder re-plan failed", "TypeError"]]);
  });

  it("nothing committed (the audit insert failed): nothing is sent", async () => {
    installFakeDb({ selects: OWNED_AND_BEFORE, insertFails: true });
    await expect(
      drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END }),
    ).rejects.toThrow();
    expect(bus.sent).toEqual([]);
  });

  it("not the patient's: nothing is sent", async () => {
    installFakeDb({ selects: [[]] });
    await drizzleAppointmentsStore.rescheduleOwn(PRINCIPAL, APPT, { startsAt: NEW_START, endsAt: NEW_END });
    expect(bus.sent).toEqual([]);
  });
});

describe("R44: a refused move opens no transaction, so it writes no row", () => {
  /** A store whose reads are fakes and whose write is the real rescheduleOwn on the fake database. */
  function storeFor(opts: { startsAt?: Date; locationId?: string; conflict?: boolean; clinicClosed?: boolean }) {
    const appt = {
      startsAt: opts.startsAt ?? OLD_START,
      endsAt: new Date((opts.startsAt ?? OLD_START).getTime() + 45 * 60_000),
      status: "scheduled" as const,
      locationId: opts.locationId ?? LOC,
      practitionerId: PRAC,
    };
    return {
      getOwnMutable: async () => appt,
      hasWindowConflict: async () => ({ conflict: !!opts.conflict, clinicClosed: !!opts.clinicClosed }),
      rescheduleOwn: drizzleAppointmentsStore.rescheduleOwn,
      getOwn: async () => ({ id: APPT }),
    } as never;
  }

  it.each([
    ["the 24h rule (the visit starts in under 24h)", { startsAt: new Date(NOW.getTime() + 20 * H) }, "cutoff"],
    ["a slot conflict", { conflict: true }, "no_slot"],
    ["a closed clinic", { clinicClosed: true, conflict: true }, "clinic_closed"],
    ["a clinic held off online booking", { locationId: HELD }, "location_unavailable"],
  ] as const)("%s", async (_label, opts, code) => {
    vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", HELD);
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE });
    const err = await rescheduleAppointment(PRINCIPAL, APPT, { startsAt: NEW_START }, storeFor(opts), NOW).catch((e) => e);
    expect(err).toBeInstanceOf(AppointmentError);
    expect((err as InstanceType<typeof AppointmentError>).code).toBe(code);
    expect(fake.transactions).toBe(0);
    expect(fake.committed).toEqual([]);
    expect(bus.sent).toEqual([]);
  });

  it("the control: the same move, not refused, writes its row, re-plans, and the staff notice follows", async () => {
    vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", HELD);
    const fake = installFakeDb({ selects: OWNED_AND_BEFORE });
    await rescheduleAppointment(PRINCIPAL, APPT, { startsAt: NEW_START }, storeFor({}), NOW);
    expect(fake.committed.filter((o) => o.op === "insert")).toHaveLength(1);
    expect(fake.timeline).toEqual(["commit", "send", "notice"]);
  });
});
