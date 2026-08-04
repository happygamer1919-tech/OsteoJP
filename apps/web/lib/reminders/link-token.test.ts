import { createHmac } from "node:crypto";
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
      exp: futureExp, scope: "confirm_cancel" 
    });
    const claims = verifyRescheduleToken(token);
    expect(claims).toEqual({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp,
      scope: "confirm_cancel",
    });
  });

  it("produces a URL-safe token (no '/', '+', or '=')", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: futureExp, scope: "confirm_cancel" 
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
      exp: futureExp, scope: "confirm_cancel" 
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
      exp: futureExp, scope: "confirm_cancel" 
    });
    process.env[SECRET] = "a-different-secret";
    expect(verifyRescheduleToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: pastExp, scope: "confirm_cancel" 
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
      exp: futureExp, scope: "confirm_cancel" 
    });
    delete process.env[SECRET];
    expect(verifyRescheduleToken(token)).toBeNull();
  });
});

describe("signing requires the secret", () => {
  it("throws a non-PII error when the secret is unset", () => {
    delete process.env[SECRET];
    expect(() =>
      signRescheduleToken({ tenantId: TENANT, appointmentId: APPT, exp: futureExp , scope: "confirm_cancel" }),
    ).toThrow(/REMINDERS_LINK_SECRET is not configured/);
  });
});

describe("rescheduleTokenExpiry", () => {
  // COUNSEL RULE, docs/rgpd-token-flow.md section 4: validity is 24 to 72 hours
  // from issuance and NEVER past the appointment start. This test previously
  // asserted a 24h grace window AFTER the start, which is the thing section 4
  // explicitly rules out - "a live token for a visit that has already happened".
  // Survivable while the landing page was read-only; not survivable now that the
  // same token confirms and cancels.
  it("expires exactly at the appointment start, with no grace window", () => {
    const startsAt = new Date("2026-06-23T13:30:00.000Z");
    expect(rescheduleTokenExpiry(startsAt)).toBe(
      Math.floor(startsAt.getTime() / 1000),
    );
  });

  it("is dead one second after the appointment start", () => {
    const startsAt = new Date("2026-06-23T13:30:00.000Z");
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: rescheduleTokenExpiry(startsAt),
      scope: "confirm_cancel",
    });
    const oneSecondAfter = new Date(startsAt.getTime() + 1000);
    expect(verifyRescheduleToken(token, oneSecondAfter)).toBeNull();
  });

  it("still verifies a minute before the appointment start", () => {
    const startsAt = new Date("2026-06-23T13:30:00.000Z");
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: rescheduleTokenExpiry(startsAt),
      scope: "confirm_cancel",
    });
    const aMinuteBefore = new Date(startsAt.getTime() - 60_000);
    expect(verifyRescheduleToken(token, aMinuteBefore)).not.toBeNull();
  });

  it("gives the 48h email 48 hours and the 24h SMS 24, inside counsel's band", () => {
    const startsAt = new Date("2026-06-23T13:30:00.000Z");
    const expMs = rescheduleTokenExpiry(startsAt) * 1000;
    const issuedAt48h = startsAt.getTime() - 48 * 60 * 60 * 1000;
    const issuedAt24h = startsAt.getTime() - 24 * 60 * 60 * 1000;
    expect((expMs - issuedAt48h) / (60 * 60 * 1000)).toBe(48);
    expect((expMs - issuedAt24h) / (60 * 60 * 1000)).toBe(24);
  });
});

describe("token scope travels inside the signature", () => {
  const FUTURE = Math.floor(Date.now() / 1000) + 3600;

  it("round-trips the scope it was minted with", () => {
    for (const scope of ["confirm", "confirm_cancel"] as const) {
      const token = signRescheduleToken({
        tenantId: TENANT,
        appointmentId: APPT,
        exp: FUTURE,
        scope,
      });
      expect(verifyRescheduleToken(token)?.scope).toBe(scope);
    }
  });

  it("refuses a token whose scope is absent, rather than defaulting one", () => {
    // Hand-mint a correctly SIGNED token with no scope claim: exactly what an
    // older issuer would have produced. A default here would be a policy
    // decision made by a missing byte.
    const wire = { t: TENANT, a: APPT, exp: FUTURE };
    const b64 = Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
    const sig = createHmac("sha256", process.env.REMINDERS_LINK_SECRET!)
      .update(b64)
      .digest("base64url");
    expect(verifyRescheduleToken(`${b64}.${sig}`)).toBeNull();
  });

  it("refuses an unrecognised scope even when correctly signed", () => {
    const wire = { t: TENANT, a: APPT, exp: FUTURE, s: "confirm_cancel_delete" };
    const b64 = Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
    const sig = createHmac("sha256", process.env.REMINDERS_LINK_SECRET!)
      .update(b64)
      .digest("base64url");
    expect(verifyRescheduleToken(`${b64}.${sig}`)).toBeNull();
  });

  it("cannot be widened by editing the URL - a re-scoped payload breaks the signature", () => {
    const token = signRescheduleToken({
      tenantId: TENANT,
      appointmentId: APPT,
      exp: FUTURE,
      scope: "confirm",
    });
    const [b64, sig] = token.split(".");
    const wire = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    wire.s = "confirm_cancel";
    const tampered =
      Buffer.from(JSON.stringify(wire), "utf8").toString("base64url") + "." + sig;
    expect(verifyRescheduleToken(tampered)).toBeNull();
  });
});
