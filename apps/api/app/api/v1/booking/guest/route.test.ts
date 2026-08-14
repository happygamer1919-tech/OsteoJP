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
}));

// THE REAL MODULE IS SPREAD IN, and only the database seam is replaced. The
// route now derives its stored window through @osteojp/db's
// `guest-preferred-window` helpers, and a factory that returned only
// `getDbAdmin` would make every one of them `undefined` — the route would throw
// before reaching a single assertion, and the obvious "fix" is to stub the
// encoder, which would leave the encoding itself untested in the one suite that
// watches this endpoint. `@osteojp/db` connects lazily (src/client.ts: "no
// connection is opened until the first query"), so importing it here is free.
vi.mock("@osteojp/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDbAdmin: () => ({
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        H.inserted.push(v);
      },
    }),
    execute: async () => [{ n: 0 }],
  }),
  guestBookingRequests: {},
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
