import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

// FORGED-TOKEN REGRESSION GUARD (findings SEC-01, SEC-02, SEC-03).
//
// History: apps/api used to DECODE the patient JWT and trust the payload. Any
// client could mint `base64(header).base64(payload).garbage`, choose their own
// patient_id, and read another patient's record. RLS was not a backstop — it
// keys on the very claim the forged token supplied. This file failed 7/7
// against that code; it is what the fix is measured by.
//
// Design notes, because a security test that passes for the wrong reason is
// worse than no test:
//   * It drives the REAL boundary (getPatientPrincipal) through the REAL
//     verifier. Only next/headers and the Supabase client are mocked.
//   * It runs in LEGACY HS256 mode with a locally-invented test secret, so
//     rejection is cryptographic and there is ZERO network access. Nothing here
//     touches Supabase, a JWKS endpoint, or a database.
//   * It carries a POSITIVE CONTROL. A correctly signed, unexpired token MUST
//     be accepted. Without it, every assertion below would still pass if the
//     verifier were misconfigured into rejecting everything, and the suite
//     would be green while the portal was bricked.

vi.mock("server-only", () => ({}));

const ISSUER_BASE = "https://test-project.supabase.co";
// A test-only secret invented here. Not a real credential and not from prod.
const TEST_SECRET = "test-only-hs256-secret-value-not-a-real-credential";
const secretKey = new TextEncoder().encode(TEST_SECRET);

let authHeader: string | null = null;

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === "authorization" ? authHeader : null,
  }),
}));

// Path 2 (cookie) must never be reached here, and must never dial out.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

const { getPatientPrincipal } = await import("@/lib/auth/patient");

const TENANT = "11111111-1111-1111-1111-111111111111";
const VICTIM_PATIENT = "22222222-2222-2222-2222-222222222222";
const ATTACKER_SUB = "33333333-3333-3333-3333-333333333333";

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");

const patientClaims = () => ({
  role: "patient",
  patient_id: VICTIM_PATIENT,
  tenant_id: TENANT,
  sub: ATTACKER_SUB,
});

/**
 * Mint a JWT with an attacker-chosen payload and a signature segment that no
 * key produced. No secret is involved: any client on the internet can build
 * this string offline.
 */
function forge(payload: Record<string, unknown>, signature = "not-a-signature") {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.${signature}`;
}

/** Mint a genuinely signed token, so we can vary ONE property at a time. */
async function sign(
  claims: Record<string, unknown>,
  opts: {
    exp?: number | null;
    nbf?: number;
    issuer?: string;
    audience?: string;
    key?: Uint8Array;
  } = {},
) {
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? `${ISSUER_BASE}/auth/v1`)
    .setAudience(opts.audience ?? "authenticated");

  if (opts.exp !== null) jwt = jwt.setExpirationTime(opts.exp ?? "1h");
  if (opts.nbf !== undefined) jwt = jwt.setNotBefore(opts.nbf);

  return jwt.sign(opts.key ?? secretKey);
}

beforeEach(() => {
  authHeader = null;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ISSUER_BASE);
  vi.stubEnv("SUPABASE_JWT_SECRET", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("positive control: a genuine token still works", () => {
  it("accepts a correctly signed, unexpired patient token", async () => {
    authHeader = `Bearer ${await sign(patientClaims())}`;

    // If this ever fails, every rejection below is meaningless and the portal
    // is broken. This assertion is what makes the rest of the file evidence.
    expect(await getPatientPrincipal()).toEqual({
      tenantId: TENANT,
      patientId: VICTIM_PATIENT,
      userId: ATTACKER_SUB,
    });
  });
});

describe("SEC-01: a forged signature is rejected", () => {
  it("rejects a token whose signature is garbage", async () => {
    authHeader = `Bearer ${forge({ ...patientClaims(), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a token with an empty signature segment", async () => {
    authHeader = `Bearer ${forge({ ...patientClaims(), exp: Math.floor(Date.now() / 1000) + 3600 }, "")}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a token signed with the wrong key", async () => {
    const wrongKey = new TextEncoder().encode("a-different-secret-entirely-xx");
    authHeader = `Bearer ${await sign(patientClaims(), { key: wrongKey })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("does not let an attacker choose which patient they are", async () => {
    // The headline impact: patient_id is the RLS self-scope key. If an unsigned
    // payload can set it, whoever writes the payload picks whose record is read.
    authHeader = `Bearer ${forge({ ...patientClaims(), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    expect((await getPatientPrincipal())?.patientId).not.toBe(VICTIM_PATIENT);
  });

  it("rejects the alg=none downgrade", async () => {
    const header = b64url({ alg: "none", typ: "JWT" });
    authHeader = `Bearer ${header}.${b64url({ ...patientClaims(), exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    expect(await getPatientPrincipal()).toBeNull();
  });
});

describe("SEC-02: expiry is enforced", () => {
  it("rejects a token that expired an hour ago", async () => {
    authHeader = `Bearer ${await sign(patientClaims(), {
      exp: Math.floor(Date.now() / 1000) - 3600,
    })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a token that expired ten years ago", async () => {
    authHeader = `Bearer ${await sign(patientClaims(), { exp: 1_000_000_000 })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a validly signed token carrying NO exp claim", async () => {
    // A token with no expiry is a permanent credential. jose enforces exp when
    // present but does not require presence, so this is our own check.
    authHeader = `Bearer ${await sign(patientClaims(), { exp: null })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a token that is not yet valid (nbf in the future)", async () => {
    authHeader = `Bearer ${await sign(patientClaims(), {
      nbf: Math.floor(Date.now() / 1000) + 3600,
    })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });
});

describe("SEC-01b: issuer and audience are pinned", () => {
  it("rejects a token from a different Supabase project", async () => {
    // Same algorithm, same secret, wrong issuer: a token minted by any other
    // project must not authenticate here.
    authHeader = `Bearer ${await sign(patientClaims(), {
      issuer: "https://someone-elses-project.supabase.co/auth/v1",
    })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a token whose audience is not 'authenticated'", async () => {
    authHeader = `Bearer ${await sign(patientClaims(), { audience: "anon" })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });
});

describe("SEC-03: the forged claim never reaches the DB self-scope", () => {
  it("returns null rather than a principal built from an unsigned payload", async () => {
    // runAsPatient feeds the principal's patient_id into request.jwt.claims,
    // which jwt_patient_id() reads back and the RLS policy compares to itself.
    // A forged principal is therefore self-authorising downstream. The only
    // place to stop it is here.
    authHeader = `Bearer ${forge({ ...patientClaims(), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    expect(await getPatientPrincipal()).toBeNull();
  });
});

describe("fail-closed configuration", () => {
  it("rejects every token when no signing config is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    authHeader = `Bearer ${await sign(patientClaims())}`;
    // Missing config must fail CLOSED, never open.
    expect(await getPatientPrincipal()).toBeNull();
  });

  it("rejects a malformed Authorization header", async () => {
    authHeader = "Bearer not-a-jwt-at-all";
    expect(await getPatientPrincipal()).toBeNull();
  });
});
