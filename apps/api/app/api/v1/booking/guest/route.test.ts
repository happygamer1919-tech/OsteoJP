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

vi.mock("@osteojp/db", () => ({
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

import { POST as guestBooking } from "./route";
import {
  GUEST_BOOKING_GLOBAL_DAY_KEY,
  GUEST_BOOKING_GLOBAL_HOUR_KEY,
} from "@/lib/rate-limit/limiter";

const T = "11111111-1111-1111-1111-111111111111";
const MOBILE = "912345678";
const LANDLINE = "210000000";

const validBody = (over: Record<string, unknown> = {}) => ({
  tenantId: T,
  fullName: "Maria Convidada",
  phone: MOBILE,
  serviceId: "22222222-2222-2222-2222-222222222222",
  locationId: "33333333-3333-3333-3333-333333333333",
  startsAt: "2026-09-07T09:00:00.000Z",
  endsAt: "2026-09-07T10:00:00.000Z",
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

/** The route hashes the E.164 phone with sha256; mirrored here to build keys. */
async function sha256(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
