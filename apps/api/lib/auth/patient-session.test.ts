/**
 * W13-03a — the patient portal session. Owner ruling: Option B.
 *
 * The properties under test are the ones that make this cookie safe to accept as
 * a principal at all: it cannot be forged, it cannot outlive its window, it
 * cannot be replayed from another issuer or audience, and a missing secret
 * refuses rather than degrades.
 *
 * THE ALGORITHM TEST IS THE LOAD-BEARING ONE. The `alg` header travels with the
 * token and is therefore attacker-controlled. A verifier that dispatches on it
 * accepts `alg: none`. This suite forges exactly that.
 */
import { SignJWT } from "jose";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PATIENT_SESSION_TTL_MS,
  SESSION_COOKIE,
  SESSION_SECRET_ENV,
  assertPatientSessionEnv,
  clearSessionCookie,
  mintPatientSession,
  readSessionToken,
  sessionCookie,
  verifyPatientSession,
} from "./patient-session";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PATIENT = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-08-06T10:00:00.000Z");
const SECRET = "test-secret-at-least-32-characters-long!!";

const withCookie = (raw: string) =>
  new Request("https://api.test/x", { headers: { cookie: raw } });

let saved: string | undefined;
beforeEach(() => {
  saved = process.env[SESSION_SECRET_ENV];
  process.env[SESSION_SECRET_ENV] = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env[SESSION_SECRET_ENV];
  else process.env[SESSION_SECRET_ENV] = saved;
  vi.useRealTimers();
});

describe("mint then verify", () => {
  it("round-trips the patient and tenant", async () => {
    const token = await mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW });
    expect(await verifyPatientSession(token)).toEqual({
      tenantId: TENANT,
      patientId: PATIENT,
      userId: `otp:${PATIENT}`,
    });
  });

  it("carries NO personal data - ids only", async () => {
    // A cookie is stored, logged by proxies and copied into bug reports. PII
    // rule #7 applies to it exactly as it applies to a log line.
    const token = await mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW });
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"),
    );
    expect(Object.keys(payload).sort()).toEqual(
      ["aud", "exp", "iat", "iss", "patient_id", "sub", "tenant_id"].sort(),
    );
  });

  it("the userId can never be mistaken for a Supabase auth user id", async () => {
    // An OTP patient has no auth user. A synthetic uuid here would be a
    // fabricated identity; the marker says truthfully how the session was got.
    const token = await mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW });
    const p = await verifyPatientSession(token);
    expect(p!.userId).toBe(`otp:${PATIENT}`);
    expect(p!.userId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("it cannot be forged", () => {
  it("refuses a token signed with a DIFFERENT secret", async () => {
    const other = new TextEncoder().encode("a-completely-different-secret-32-chars!!");
    const forged = await new SignJWT({ tenant_id: TENANT, patient_id: PATIENT })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(`otp:${PATIENT}`)
      .setIssuer("osteojp-api")
      .setAudience("osteojp-portal")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(other);
    expect(await verifyPatientSession(forged)).toBeNull();
  });

  it("refuses alg:none, which is the whole reason the algorithm is pinned", async () => {
    // Hand-built, because no library will sign this for you. Header alg none,
    // real-looking payload, empty signature.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        tenant_id: TENANT,
        patient_id: PATIENT,
        iss: "osteojp-api",
        aud: "osteojp-portal",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    expect(await verifyPatientSession(`${header}.${body}.`)).toBeNull();
  });

  it("refuses a token from another issuer or audience", async () => {
    const key = new TextEncoder().encode(SECRET);
    const wrongIssuer = await new SignJWT({ tenant_id: TENANT, patient_id: PATIENT })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("somewhere-else").setAudience("osteojp-portal")
      .setIssuedAt().setExpirationTime("1h").sign(key);
    const wrongAudience = await new SignJWT({ tenant_id: TENANT, patient_id: PATIENT })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("osteojp-api").setAudience("some-other-app")
      .setIssuedAt().setExpirationTime("1h").sign(key);
    expect(await verifyPatientSession(wrongIssuer)).toBeNull();
    expect(await verifyPatientSession(wrongAudience)).toBeNull();
  });

  it("refuses garbage and empty input without throwing", async () => {
    for (const bad of ["", "not-a-token", "a.b.c", "..", "null"]) {
      expect(await verifyPatientSession(bad)).toBeNull();
    }
  });

  it("refuses a token whose ids are not uuids", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ tenant_id: "not-a-uuid", patient_id: PATIENT })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("osteojp-api").setAudience("osteojp-portal")
      .setIssuedAt().setExpirationTime("1h").sign(key);
    expect(await verifyPatientSession(token)).toBeNull();
  });
});

describe("it cannot outlive its window", () => {
  it("is accepted inside 12 hours and refused after", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const token = await mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW });

    vi.setSystemTime(new Date(NOW.getTime() + PATIENT_SESSION_TTL_MS - 60_000));
    expect(await verifyPatientSession(token)).not.toBeNull();

    // Past the window plus the 5s clock tolerance.
    vi.setSystemTime(new Date(NOW.getTime() + PATIENT_SESSION_TTL_MS + 60_000));
    expect(await verifyPatientSession(token)).toBeNull();
  });

  it("is SHORTER than the 30-day trusted-device window, as Decision D requires", async () => {
    const { TRUSTED_DEVICE_TTL_MS } = await import("./otp");
    expect(PATIENT_SESSION_TTL_MS).toBeLessThan(TRUSTED_DEVICE_TTL_MS);
    expect(PATIENT_SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it("DOES NOT SLIDE: verifying does not extend anything", async () => {
    // The refresh path is the device cookie, not a sliding session. A verify
    // that extended its own token would make an active session immortal.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const token = await mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW });

    for (let h = 1; h <= 11; h++) {
      vi.setSystemTime(new Date(NOW.getTime() + h * 60 * 60 * 1000));
      expect(await verifyPatientSession(token)).not.toBeNull();
    }
    vi.setSystemTime(new Date(NOW.getTime() + 13 * 60 * 60 * 1000));
    expect(await verifyPatientSession(token)).toBeNull();
  });
});

describe("a missing secret refuses, it never degrades", () => {
  it("verify returns null rather than accepting anything", async () => {
    const token = await mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW });
    delete process.env[SESSION_SECRET_ENV];
    expect(await verifyPatientSession(token)).toBeNull();
  });

  it("mint THROWS rather than issuing an unsigned token", async () => {
    delete process.env[SESSION_SECRET_ENV];
    await expect(
      mintPatientSession({ tenantId: TENANT, patientId: PATIENT, issuedAt: NOW }),
    ).rejects.toThrow(SESSION_SECRET_ENV);
  });

  it("the boot assertion names the variable and never its value", () => {
    process.env[SESSION_SECRET_ENV] = SECRET;
    expect(() => assertPatientSessionEnv()).not.toThrow();

    delete process.env[SESSION_SECRET_ENV];
    try {
      assertPatientSessionEnv();
      throw new Error("expected assertPatientSessionEnv to throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain(SESSION_SECRET_ENV);
      expect(msg).not.toContain(SECRET);
    }
  });

  it("a too-short secret is treated as absent", () => {
    // 32 characters minimum. A four-character secret is a signing key an
    // attacker can exhaust, and accepting it would be worse than refusing.
    process.env[SESSION_SECRET_ENV] = "short";
    expect(() => assertPatientSessionEnv()).toThrow(SESSION_SECRET_ENV);
  });
});

describe("the cookie itself", () => {
  it("is __Host- prefixed, httpOnly, Secure, SameSite and time-boxed", async () => {
    const c = sessionCookie("tok");
    expect(c).toContain(`${SESSION_COOKIE}=tok`);
    expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toContain(`Max-Age=${PATIENT_SESSION_TTL_MS / 1000}`);
  });

  it("clears with the same attributes, or the browser keeps it", () => {
    const c = clearSessionCookie();
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("Path=/");
  });

  it("reads its own cookie and ignores every other", () => {
    expect(readSessionToken(withCookie(`${SESSION_COOKIE}=abc`))).toBe("abc");
    expect(readSessionToken(withCookie(`other=1; ${SESSION_COOKIE}=abc; more=2`))).toBe("abc");
    expect(readSessionToken(withCookie("__Host-ojp_device=abc"))).toBeNull();
    expect(readSessionToken(new Request("https://api.test/x"))).toBeNull();
    expect(readSessionToken(withCookie(`${SESSION_COOKIE}=`))).toBeNull();
  });
});
