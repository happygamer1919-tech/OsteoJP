/**
 * ITEM 6 - the guest booking endpoint, the project's FIRST unauthenticated
 * write surface.
 *
 * THREE PROPERTIES, and they fail in different ways:
 *   (a) NO PATIENT-LIST ORACLE. The response must be byte-identical whether or
 *       not the phone belongs to an existing patient. A public form that
 *       answered differently would be a patient-list oracle for anyone with a
 *       phone book, which is exactly what the OTP endpoint was built to avoid.
 *   (b) EVERY ROW IS A REQUEST (R-GUEST-1). No branch may write a confirmed
 *       row, whatever the slot's availability.
 *   (c) THE LIMITS ARE ORDERED, and the order is load-bearing: the tenant-wide
 *       ceiling is spent LAST, so malformed input cannot exhaust the day's
 *       allowance and deny the form to real people.
 *
 * THE INSERT IS THE ASSERTION, not the status code. A 202 with nothing written,
 * or a 429 with a row already inserted, would both be a passing test and a live
 * defect - so every test that matters counts `inserted`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  /** Every rate-limit key the route checked, in order. */
  keys: [] as string[],
  /** key -> ok. Anything unlisted is allowed. */
  verdicts: new Map<string, boolean>(),
  /** One entry per ACTUAL insert. */
  inserted: [] as Record<string, unknown>[],
  /** GUEST-08. Defaults to sellable, so every pre-existing assertion in this
   *  file keeps the meaning it had. The tests in (d) set it false. */
  sellable: true,
  /** Every {serviceId, locationId} pair the route asked about. */
  sellabilityAsks: [] as Array<{ serviceId: string; locationId: string }>,
  /** INTAKE-01. Whether 0087's table "exists". Defaults to ABSENT, which is
   *  production until the owner applies 0087, so every pre-existing assertion
   *  in this file runs against the inert state. */
  intakeTable: false,
  presenceAsks: 0,
  /** One entry per COMMITTED intake row. */
  intakes: [] as Record<string, unknown>[],
  /** When set, the intake insert throws this, inside the transaction. */
  intakeFailure: null as unknown,
  /** The id the request insert "returns". */
  requestId: "77777777-7777-7777-7777-777777777777",
}));

// THE REAL MODULE IS SPREAD IN, and only the database seam is replaced. The
// route now derives its stored window through @osteojp/db's
// `guest-preferred-window` helpers, and a factory that returned only
// `getDbAdmin` would make every one of them `undefined` — the route would throw
// before reaching a single assertion, and the obvious "fix" is to stub the
// encoder, which would leave the encoding itself untested in the one suite that
// watches this endpoint. `@osteojp/db` connects lazily (src/client.ts: "no
// connection is opened until the first query"), so importing it here is free.
//
// INTAKE-01: THE MOCK IS A TRANSACTION. Rows written inside the callback are
// held as pending and reach `inserted` / `intakes` only if the callback
// returns, which is what a rollback means. So "nothing was stored" below is an
// assertion about the transaction boundary, not about the order of two pushes.
vi.mock("@osteojp/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDbAdmin: () => ({
    execute: async () => [{ n: 0 }],
    transaction: async (cb: (tx: unknown) => Promise<void>) => {
      const pending = { requests: [] as Record<string, unknown>[], intakes: [] as Record<string, unknown>[] };
      const tx = {
        pending,
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            pending.requests.push(v);
            return { returning: async () => [{ id: H.requestId }] };
          },
        }),
      };
      await cb(tx);
      H.inserted.push(...pending.requests);
      H.intakes.push(...pending.intakes);
    },
  }),
  guestBookingRequests: {},
  guestIntakeSchemaPresent: async () => {
    H.presenceAsks += 1;
    return H.intakeTable;
  },
  insertGuestClinicalIntake: async (
    tx: { pending: { intakes: Record<string, unknown>[] } },
    row: Record<string, unknown>,
  ) => {
    if (H.intakeFailure) throw H.intakeFailure;
    tx.pending.intakes.push(row);
  },
}));

// THE DATABASE SEAM FOR GUEST-08, MOCKED AT THE MODULE AND NOT AT THE DRIVER.
// `isGuestSellable` runs a three-table join; reproducing that against the
// hand-rolled `getDbAdmin` stub above would be a test of the stub. What this
// file is responsible for is that the route CALLS the gate, ORDERS it correctly
// and REFUSES on a false — which is what the (d) block asserts. The rule itself
// is `apps/api/lib/booking/sellable.test.ts`.
vi.mock("@/lib/booking/sellable", () => ({
  isGuestSellable: async (a: { serviceId: string; locationId: string }) => {
    H.sellabilityAsks.push({ serviceId: a.serviceId, locationId: a.locationId });
    return H.sellable;
  },
}));

vi.mock("@/lib/rate-limit/durable-store", () => ({
  createDurableRateLimitStore: () => ({}),
  checkDurableRateLimit: async (key: string, rule: { limit: number }) => {
    H.keys.push(key);
    const ok = H.verdicts.get(key) ?? true;
    return { ok, limit: rule.limit, remaining: ok ? 1 : 0, retryAfterSeconds: 60 };
  },
}));

import { POST as guestBooking, GUEST_REQUEST_HORIZON_DAYS } from "./route";
import {
  GUEST_BOOKING_GLOBAL_DAY_KEY,
  GUEST_BOOKING_GLOBAL_HOUR_KEY,
} from "@/lib/rate-limit/limiter";
import {
  decodeGuestPreferredWindow,
  formatCalendarDate,
  lisbonToday,
  lisbonWallClock,
} from "@osteojp/db";

const T = "11111111-1111-1111-1111-111111111111";
const MOBILE = "912345678";
const LANDLINE = "210000000";

/**
 * A date N days from today, in Lisbon.
 *
 * RELATIVE, NOT A LITERAL, and that is deliberate. The horizon check compares
 * against the real clock, so a hardcoded `2026-09-07` would pass today and start
 * failing on a wall-clock date months from now with no commit to blame — the
 * kind of red that gets skipped rather than read.
 */
const dayOffset = (days: number): string => {
  const t = lisbonToday(new Date());
  const shifted = new Date(Date.UTC(t.year, t.month - 1, t.day + days));
  return formatCalendarDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
};

const validBody = (over: Record<string, unknown> = {}) => ({
  tenantId: T,
  fullName: "Maria Convidada",
  phone: MOBILE,
  serviceId: "22222222-2222-2222-2222-222222222222",
  locationId: "33333333-3333-3333-3333-333333333333",
  // OPTION A: a preferred DATE and a preferred PERIOD. Not a slot — see (d).
  preferredDate: dayOffset(7),
  preferredPeriod: "manha",
  ...over,
});

const post = (body: unknown) =>
  new Request("https://api.test/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

beforeEach(() => {
  H.keys = [];
  H.inserted = [];
  H.verdicts = new Map();
  H.sellable = true;
  H.sellabilityAsks = [];
  H.intakeTable = false;
  H.presenceAsks = 0;
  H.intakes = [];
  H.intakeFailure = null;
});

describe("(a) no patient-list oracle", () => {
  it("answers 202 for a phone that matches nothing", async () => {
    const res = await guestBooking(post(validBody()));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "received" });
  });

  it("answers IDENTICALLY for a phone that matches an existing patient", async () => {
    // The route must not look the phone up at all on the write path, so the
    // "matching" case is indistinguishable by construction. This asserts the
    // observable half: same status, same body, same headers of consequence.
    const first = await guestBooking(post(validBody()));
    const firstBody = await first.json();

    const second = await guestBooking(post(validBody({ phone: "+351912345678" })));
    const secondBody = await second.json();

    expect(second.status).toBe(first.status);
    expect(secondBody).toEqual(firstBody);
  });

  it("NEGATIVE ARM: the response body carries no match count, id or flag", async () => {
    // If somebody later "helpfully" returns the duplicate flag to the caller,
    // this is the test that stops it. The flag is reception's, never the
    // guest's.
    const res = await guestBooking(post(validBody()));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["status"]);
  });
});

describe("(b) every row is a REQUEST (R-GUEST-1)", () => {
  it("writes exactly one row and never sets status", async () => {
    await guestBooking(post(validBody()));
    expect(H.inserted).toHaveLength(1);
    // `status` is absent so the database default ('pending') and its CHECK
    // decide it. A route that passed status could auto-confirm; this cannot.
    expect(H.inserted[0]).not.toHaveProperty("status");
  });

  it("sets tenantId EXPLICITLY - rule 3 for a service-role write", async () => {
    await guestBooking(post(validBody()));
    expect(H.inserted[0]!.tenantId).toBe(T);
  });

  it("stores the IP HASHED, never in the clear", async () => {
    await guestBooking(post(validBody()));
    const hash = H.inserted[0]!.sourceIpHash as string;
    expect(hash).not.toContain("203.0.113.9");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalises the phone before storing, so one handset is one budget", async () => {
    await guestBooking(post(validBody({ phone: "912 345 678" })));
    expect(H.inserted[0]!.phone).toBe("+351912345678");
  });
});

describe("(c) the limits, and their order", () => {
  it("a landline is REFUSED and writes nothing", async () => {
    // Reception's only way to reach a guest is to ring them. A landline typed
    // by mistake is a request nobody can action, so it is refused at entry
    // rather than left as a dead row in the queue.
    const res = await guestBooking(post(validBody({ phone: LANDLINE })));
    expect(res.status).toBe(400);
    expect(H.inserted).toHaveLength(0);
  });

  it("THE ORDER: the tenant-wide ceiling is spent LAST", async () => {
    await guestBooking(post(validBody()));
    const globalIdx = H.keys.indexOf(GUEST_BOOKING_GLOBAL_HOUR_KEY);
    const phoneIdx = H.keys.findIndex((k) => k.startsWith("guest-booking:phone:"));
    expect(globalIdx).toBeGreaterThan(-1);
    expect(phoneIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(phoneIdx);
  });

  it("malformed input NEVER spends the tenant-wide ceiling", async () => {
    // The reason the order matters. If garbage spent the global counter, an
    // attacker could exhaust the day's allowance without ever submitting a
    // valid request, denying the form to real people for free.
    await guestBooking(post(validBody({ phone: "not-a-number" })));
    expect(H.keys).not.toContain(GUEST_BOOKING_GLOBAL_HOUR_KEY);
    expect(H.keys).not.toContain(GUEST_BOOKING_GLOBAL_DAY_KEY);
    expect(H.inserted).toHaveLength(0);
  });

  it("the per-phone limit refuses and writes nothing", async () => {
    H.verdicts.set(`guest-booking:phone:hour:${await sha256("+351912345678")}`, false);
    const res = await guestBooking(post(validBody()));
    expect(res.status).toBe(429);
    expect(H.inserted).toHaveLength(0);
  });

  it("the tenant-wide ceiling refuses and writes nothing", async () => {
    H.verdicts.set(GUEST_BOOKING_GLOBAL_HOUR_KEY, false);
    const res = await guestBooking(post(validBody()));
    expect(res.status).toBe(429);
    expect(H.inserted).toHaveLength(0);
  });

  it("NEGATIVE ARM: an allowed request really does write, so the refusals above mean something", async () => {
    // Without this, every "inserted: 0" could be a route that never writes at
    // all and the whole block would pass vacuously.
    await guestBooking(post(validBody()));
    expect(H.inserted).toHaveLength(1);
  });
});

/**
 * (d) OPTION A — WHAT IS STORED IS A PREFERENCE, NEVER A SLOT.
 *
 * Ratified 2026-08-14. The form shows no availability, so nothing public can
 * have offered the caller a time. Every assertion here exists because the
 * failure it prevents is INVISIBLE at the screen: reception would read a precise
 * time, in the ordinary place a precise time appears, for a person who only ever
 * said "morning".
 */
describe("(d) the request carries a PERIOD, not a slot", () => {
  it("stores the MORNING window, and it decodes back to the same day and period", async () => {
    const date = dayOffset(7);
    await guestBooking(post(validBody({ preferredDate: date, preferredPeriod: "manha" })));

    const row = H.inserted[0]!;
    const starts = row.requestedStartsAt as Date;
    const ends = row.requestedEndsAt as Date;

    // Lisbon wall clock, whatever the runner's zone and whatever the offset on
    // the day. A UTC-naive encoder is one hour out for seven months of the year.
    expect(lisbonWallClock(starts)).toMatchObject({ hour: 9, minute: 0 });
    expect(lisbonWallClock(ends)).toMatchObject({ hour: 13, minute: 0 });
    expect(decodeGuestPreferredWindow(starts, ends)).toEqual({
      kind: "period",
      dateYmd: date,
      period: "manha",
    });
  });

  it("stores the AFTERNOON window", async () => {
    const date = dayOffset(3);
    await guestBooking(post(validBody({ preferredDate: date, preferredPeriod: "tarde" })));
    const row = H.inserted[0]!;
    expect(
      decodeGuestPreferredWindow(row.requestedStartsAt as Date, row.requestedEndsAt as Date),
    ).toEqual({ kind: "period", dateYmd: date, period: "tarde" });
  });

  it("REFUSES a body carrying startsAt/endsAt instead of a period", async () => {
    // The pre-ruling contract. A client still sending it must fail loudly rather
    // than have its exact time quietly ignored or quietly honoured.
    const { preferredDate: _d, preferredPeriod: _p, ...rest } = validBody();
    const res = await guestBooking(
      post({
        ...rest,
        startsAt: "2026-09-07T09:30:00.000Z",
        endsAt: "2026-09-07T10:30:00.000Z",
      }),
    );
    expect(res.status).toBe(400);
    expect(H.inserted).toHaveLength(0);
  });

  it("IGNORES startsAt/endsAt smuggled ALONGSIDE a valid period", async () => {
    // The dangerous half of the arm above: a body that satisfies the new
    // contract AND carries the old fields must store the PERIOD. If the route
    // ever preferred the supplied timestamps, this suite would still see a 202
    // and a row, and only reception would notice - months later, on one request.
    const date = dayOffset(5);
    await guestBooking(
      post(
        validBody({
          preferredDate: date,
          preferredPeriod: "tarde",
          startsAt: "2026-09-07T09:30:00.000Z",
          endsAt: "2026-09-07T10:30:00.000Z",
        }),
      ),
    );
    expect(
      decodeGuestPreferredWindow(
        H.inserted[0]!.requestedStartsAt as Date,
        H.inserted[0]!.requestedEndsAt as Date,
      ),
    ).toEqual({ kind: "period", dateYmd: date, period: "tarde" });
  });

  it("NEVER stores a practitioner, even when one is posted", async () => {
    // Option A does not expose the therapist roster, so no legitimate caller can
    // have an id. Writing one would put an unsourced therapist preference in
    // front of reception.
    await guestBooking(
      post(validBody({ practitionerId: "44444444-4444-4444-4444-444444444444" })),
    );
    expect(H.inserted[0]!.practitionerId).toBeNull();
  });

  it.each([
    ["an unknown period", { preferredPeriod: "noite" }],
    ["a missing period", { preferredPeriod: undefined }],
    ["an empty period", { preferredPeriod: "" }],
    ["a date that does not exist", { preferredDate: "2026-02-30" }],
    ["an unpadded date", { preferredDate: "2026-2-3" }],
    ["a timestamp in the date field", { preferredDate: "2026-09-07T09:00:00Z" }],
    ["yesterday", { preferredDate: dayOffset(-1) }],
    ["beyond the horizon", { preferredDate: dayOffset(GUEST_REQUEST_HORIZON_DAYS + 1) }],
  ])("REFUSES %s and writes nothing", async (_label, over) => {
    const res = await guestBooking(post(validBody(over)));
    expect(res.status).toBe(400);
    expect(H.inserted).toHaveLength(0);
    // The ordering property from (c), restated over the new input space: a bad
    // date must not be able to spend the day's allowance either.
    expect(H.keys).not.toContain(GUEST_BOOKING_GLOBAL_HOUR_KEY);
  });

  it.each([
    ["TODAY", 0],
    ["the LAST day of the horizon", GUEST_REQUEST_HORIZON_DAYS],
  ])("ACCEPTS %s - the boundaries are inclusive", async (_label, offset) => {
    // Without these two, every refusal above could be a route that refuses
    // everything, and the whole block would pass while the form was dead.
    const res = await guestBooking(post(validBody({ preferredDate: dayOffset(offset) })));
    expect(res.status).toBe(202);
    expect(H.inserted).toHaveLength(1);
  });
});

/** The route hashes the E.164 phone with sha256; mirrored here to build keys. */
async function sha256(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

/**
 * (d) GUEST-08 ON THE WRITE PATH.
 *
 * THE CATALOGUE COULD HIDE A SERVICE WHILE THIS ENDPOINT ACCEPTED ITS ID.
 * `GET .../guest/catalog` applies five conditions before showing a service at a
 * clinic — active, not internal-only, patient-bookable, an ACTIVE
 * `service_location_prices` row for that pair, and an active location. This
 * route applied none of them: it checked that `serviceId` was a non-empty
 * string and inserted. The foreign keys enforce that the row EXISTS; nothing
 * enforced that the clinic SELLS it there.
 *
 * `Diversos` is the worked example — `store.ts` names it as the internal-only
 * service that must never reach a patient wizard — and a Castelo Branco booking
 * against it is what surfaced this.
 *
 * EVERY TEST HERE COUNTS `inserted`. A 400 with a row already written and a 202
 * with nothing written are both a passing status assertion and a live defect,
 * which is the rule this file's own header states.
 */
describe("(d) GUEST-08: a service the clinic cannot sell there is refused", () => {
  it("refuses a hidden service id, and writes NOTHING", async () => {
    H.sellable = false;
    const res = await guestBooking(post(validBody({ serviceId: "44444444-4444-4444-4444-444444444444" })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(H.inserted).toHaveLength(0);
  });

  it("THE CONTROL: the same body with the same service is accepted when it IS sellable", async () => {
    // Without this, the test above is green against a route that refuses
    // everything — a 400 and an empty `inserted` is also what a broken endpoint
    // produces. The two tests differ in ONE boolean.
    H.sellable = true;
    const res = await guestBooking(post(validBody({ serviceId: "44444444-4444-4444-4444-444444444444" })));
    expect(res.status).toBe(202);
    expect(H.inserted).toHaveLength(1);
  });

  it("asks about the PAIR the caller named, not about the service alone", async () => {
    // A check that ignored `locationId` would pass every test above and would
    // still admit a service that is sold at Linda-a-Velha into a Castelo Branco
    // request, which is the exact cross-clinic case GUEST-08 was ruled for.
    await guestBooking(
      post(validBody({
        serviceId: "55555555-5555-5555-5555-555555555555",
        locationId: "66666666-6666-6666-6666-666666666666",
      })),
    );
    expect(H.sellabilityAsks).toEqual([
      {
        serviceId: "55555555-5555-5555-5555-555555555555",
        locationId: "66666666-6666-6666-6666-666666666666",
      },
    ]);
  });

  it("the refusal is INDISTINGUISHABLE from every other invalid_input", async () => {
    // The endpoint is unauthenticated. A refusal that named its reason would let
    // anyone enumerate the catalogue, the price grid and the location list from
    // a surface built to answer nothing — SR-30's shape, and the reason
    // /c/<code> answers one generic refusal to four different failures.
    H.sellable = false;
    const hidden = await guestBooking(post(validBody()));
    H.sellable = true;
    const malformed = await guestBooking(post(validBody({ preferredPeriod: "noite" })));

    expect(hidden.status).toBe(malformed.status);
    expect(await hidden.json()).toEqual(await malformed.json());
    expect(H.inserted).toHaveLength(0);
  });

  it("is spent BEFORE the tenant-wide ceiling, so garbage cannot deny the form", async () => {
    // THE ORDERING IS THE PROPERTY, and this file's header already says why: the
    // tenant-wide budget is the whole clinic's daily allowance, and a request
    // naming a service the clinic does not sell must not spend any of it.
    H.sellable = false;
    await guestBooking(post(validBody()));
    expect(H.keys).not.toContain(GUEST_BOOKING_GLOBAL_HOUR_KEY);
    expect(H.keys).not.toContain(GUEST_BOOKING_GLOBAL_DAY_KEY);
  });

  it("is spent AFTER the per-source caps, so it cannot be used as a free catalogue probe", async () => {
    // The mirror of the test above. This gate costs a DATABASE ROUND TRIP, so it
    // must sit behind the caps that bound an attacker: an unlimited oracle that
    // answers 400-or-202 per (service, location) pair is a catalogue dump.
    // The key shape is `${scope}:ip:${ip}` - `clientKeyFromHeaders` inserts the
    // `ip` segment so an address can never collide with a subject id. Written as
    // a literal on purpose: importing the builder here would make this test pass
    // against whatever the builder does, including the wrong thing.
    H.verdicts.set("guest-booking:hour:ip:203.0.113.9", false);
    H.sellable = false;
    const res = await guestBooking(post(validBody()));
    expect(res.status).toBe(429);
    expect(H.sellabilityAsks).toHaveLength(0);
  });
});

/**
 * (e) INTAKE-01 - THE CLINICAL INTAKE ON THE SAME REQUEST.
 *
 * FOUR PROPERTIES, from BLUE's wire contract and the inert-until-applied rule:
 *   1. with 0087 applied, the request and its intake are written in ONE
 *      transaction, or neither is;
 *   2. while 0087 is NOT applied, a body carrying an intake is refused, and a
 *      body without one books exactly as it did before;
 *   3. with 0087 applied, a body WITHOUT an intake still books (a stale portal
 *      must not break booking);
 *   4. nothing about the answers reaches the response or the log, on any path.
 *
 * Every test counts BOTH `inserted` and `intakes`, for this file's own reason: a
 * right status with the wrong rows is a passing test and a live defect.
 */
describe("(e) INTAKE-01: the clinical intake rides on the same request", () => {
  const REASON = "Dor lombar desde marco, pior de manha";
  const validIntake = (over: Record<string, unknown> = {}) => ({
    dateOfBirth: "1985-03-02",
    reason: REASON,
    healthConditions: "Hipertensao",
    medication: null,
    fallsAccidents: "   ",
    surgeries: "Apendicectomia 2010",
    pacemaker: "nao",
    pregnancy: "nao",
    consentVersion: "rgpd-intake-2026-09-11",
    ...over,
  });

  it("0087 APPLIED: writes the request AND its intake, keyed on the request's id", async () => {
    H.intakeTable = true;
    const res = await guestBooking(post(validBody({ intake: validIntake() })));
    expect(res.status).toBe(202);
    expect(H.inserted).toHaveLength(1);
    expect(H.intakes).toHaveLength(1);
    expect(H.intakes[0]).toEqual({
      // Rule 3: the tenant is explicit and it is the REQUEST's tenant.
      tenantId: T,
      guestBookingRequestId: H.requestId,
      dateOfBirth: "1985-03-02",
      reason: REASON,
      healthConditions: "Hipertensao",
      medication: null,
      // Blank is "nothing said", stored as NULL, never as whitespace.
      fallsAccidents: null,
      surgeries: "Apendicectomia 2010",
      pacemaker: "nao",
      pregnancy: "nao",
      consentVersion: "rgpd-intake-2026-09-11",
    });
  });

  it("the response is IDENTICAL with and without an intake - it carries nothing back", async () => {
    H.intakeTable = true;
    const withIntake = await guestBooking(post(validBody({ intake: validIntake() })));
    const without = await guestBooking(post(validBody()));
    expect(withIntake.status).toBe(without.status);
    expect(await withIntake.json()).toEqual(await without.json());
  });

  it("a smuggled consentAt / consentTicked cannot change what is stored", async () => {
    // The API sets the tick and the timestamp at the insert. A client that
    // thinks it is supplying either is not refused, and is not listened to.
    H.intakeTable = true;
    await guestBooking(
      post(
        validBody({
          intake: validIntake({ consentAt: "2020-01-01T00:00:00Z", consentTicked: false }),
        }),
      ),
    );
    expect(H.intakes).toHaveLength(1);
    expect(Object.keys(H.intakes[0]!)).not.toContain("consentAt");
    expect(Object.keys(H.intakes[0]!)).not.toContain("consentTicked");
  });

  it("0087 NOT APPLIED: a body carrying an intake is REFUSED and writes nothing", async () => {
    H.intakeTable = false;
    const res = await guestBooking(post(validBody({ intake: validIntake() })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(H.inserted).toHaveLength(0);
    expect(H.intakes).toHaveLength(0);
    // Refused BEFORE the tenant-wide ceiling, like every other refusal.
    expect(H.keys).not.toContain(GUEST_BOOKING_GLOBAL_HOUR_KEY);
  });

  it("THE CONTROL: the same body books once 0087 is applied - the refusal above is the table, nothing else", async () => {
    H.intakeTable = true;
    const res = await guestBooking(post(validBody({ intake: validIntake() })));
    expect(res.status).toBe(202);
    expect(H.inserted).toHaveLength(1);
  });

  it.each([
    ["0087 applied", true],
    ["0087 not applied", false],
  ])("%s: a body WITHOUT an intake books exactly as before, and writes no intake", async (_l, table) => {
    H.intakeTable = table;
    const res = await guestBooking(post(validBody()));
    expect(res.status).toBe(202);
    expect(H.inserted).toHaveLength(1);
    expect(H.intakes).toHaveLength(0);
  });

  it("`intake: null` is no intake, not a malformed one", async () => {
    H.intakeTable = false;
    const res = await guestBooking(post(validBody({ intake: null })));
    expect(res.status).toBe(202);
    expect(H.intakes).toHaveLength(0);
  });

  it("the presence check is only asked when there IS an intake", async () => {
    // A booking without one must not pay a round trip for a table it never
    // touches.
    await guestBooking(post(validBody()));
    expect(H.presenceAsks).toBe(0);
  });

  it.each([
    ["never-asked pacemaker (the form cannot produce it)", { pacemaker: "nao_perguntado" }],
    ["never-asked pregnancy", { pregnancy: "nao_perguntado" }],
    ["a missing pacemaker answer", { pacemaker: undefined }],
    ["a missing pregnancy answer", { pregnancy: undefined }],
    ["an unknown consent version", { consentVersion: "rgpd-intake-1999-01-01" }],
    ["a missing consent version", { consentVersion: undefined }],
    ["a date of birth in the future", { dateOfBirth: "2999-01-01" }],
    ["a blank reason", { reason: "   " }],
  ])("REFUSES %s, before any per-phone budget is spent, and writes nothing", async (_l, over) => {
    H.intakeTable = true;
    const res = await guestBooking(post(validBody({ intake: validIntake(over) })));
    expect(res.status).toBe(400);
    expect(H.inserted).toHaveLength(0);
    expect(H.intakes).toHaveLength(0);
    expect(H.keys.some((k) => k.startsWith("guest-booking:phone:"))).toBe(false);
  });

  it("a refusal ECHOES NOTHING: same body as every other invalid_input, no answer in it", async () => {
    H.intakeTable = true;
    const refused = await guestBooking(
      post(validBody({ intake: validIntake({ pacemaker: "talvez" }) })),
    );
    const raw = await refused.text();
    const malformed = await guestBooking(post(validBody({ preferredPeriod: "noite" })));
    expect(JSON.parse(raw)).toEqual(await malformed.json());
    for (const value of [REASON, "Hipertensao", "talvez", "1985-03-02", "pacemaker"]) {
      expect(raw, value).not.toContain(value);
    }
  });

  it("ONE TRANSACTION: an intake insert that fails leaves NO request row behind", async () => {
    H.intakeTable = true;
    H.intakeFailure = Object.assign(new Error("check violation"), { code: "23514" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await guestBooking(post(validBody({ intake: validIntake() })));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "service_unavailable" });
      expect(H.inserted).toHaveLength(0);
      expect(H.intakes).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("THE FAILURE LOG CARRIES A SQLSTATE AND NOTHING ELSE, whatever the error held", async () => {
    // The realistic shape: Drizzle's query error puts the statement's PARAMETERS
    // in its message, and Postgres puts the failing row in `detail`. Both are
    // built here out of the visitor's own answers.
    H.intakeTable = true;
    const leaky = Object.assign(
      new Error(`Failed query: insert ... params: Maria Convidada,+351912345678,${REASON},sim`),
      {
        cause: Object.assign(new Error("new row violates check constraint"), {
          code: "23514",
          detail: `Failing row contains (${REASON}, Hipertensao, sim).`,
        }),
      },
    );
    H.intakeFailure = leaky;
    // NEGATIVE CONTROL: the error really does carry the values, so a clean log
    // below is the route's doing and not an empty error's.
    expect(leaky.message).toContain(REASON);

    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      await guestBooking(post(validBody({ intake: validIntake() })));
    } finally {
      spy.mockRestore();
    }
    expect(lines).toEqual(["[guest-booking] write failed (sqlstate 23514); nothing was stored."]);
  });

  it("an error with no SQLSTATE logs `unknown`, never its message", async () => {
    H.intakeTable = true;
    H.intakeFailure = new Error(`boom ${REASON}`);
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      await guestBooking(post(validBody({ intake: validIntake() })));
    } finally {
      spy.mockRestore();
    }
    expect(lines).toEqual(["[guest-booking] write failed (sqlstate unknown); nothing was stored."]);
  });
});
