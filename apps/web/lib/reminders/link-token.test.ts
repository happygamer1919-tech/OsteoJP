import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  rescheduleTokenExpiry,
  signRescheduleToken,
  verifyRescheduleToken,
} from "./link-token";

const SECRET = "REMINDERS_LINK_SECRET";
const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[SECRET];
  process.env[SECRET] = "test-secret-value";
});

afterEach(() => {
  if (saved === undefined) delete process.env[SECRET];
  else process.env[SECRET] = saved;
});

const futureExp = Math.floor(Date.now() / 1000) + 3600;

describe("sign + verify round trip", () => {
  it("recovers the exact claims from a freshly signed token", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
    });
    const claims = verifyRescheduleToken(token);
    expect(claims).toEqual({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
    });
  });

  it("produces a URL-safe token (no '/', '+', or '=')", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
    });
    expect(token).not.toMatch(/[/+=]/);
    expect(token.split(".")).toHaveLength(2);
  });
});

describe("rejection cases (all return null, never throw)", () => {
  it("rejects a tampered payload", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
    });
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ t: TENANT, a: "00000000-0000-4000-8000-000000000000", exp: futureExp }),
      "utf8",
    ).toString("base64url");
    expect(verifyRescheduleToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
    });
    process.env[SECRET] = "a-different-secret";
    expect(verifyRescheduleToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: pastExp,
    });
    expect(verifyRescheduleToken(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyRescheduleToken("")).toBeNull();
    expect(verifyRescheduleToken("nodot")).toBeNull();
    expect(verifyRescheduleToken(".onlysig")).toBeNull();
    expect(verifyRescheduleToken("a.b.c")).toBeNull();
  });

  it("returns null (does not throw) when the secret is unset", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
    });
    delete process.env[SECRET];
    expect(verifyRescheduleToken(token)).toBeNull();
  });
});

describe("signing requires the secret", () => {
  it("throws a non-PII error when the secret is unset", () => {
    delete process.env[SECRET];
    expect(() =>
      signRescheduleToken({ tenantId: TENANT, appointmentId: APPT, exp: futureExp }),
    ).toThrow(/REMINDERS_LINK_SECRET is not configured/);
  });
});

describe("rescheduleTokenExpiry", () => {
  it("adds a 24h grace window after the appointment start", () => {
    const startsAt = new Date("2026-06-23T13:30:00.000Z");
    const exp = rescheduleTokenExpiry(startsAt);
    expect(exp).toBe(Math.floor(startsAt.getTime() / 1000) + 24 * 60 * 60);
  });
});
