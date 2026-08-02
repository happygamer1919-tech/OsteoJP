import { describe, expect, it, beforeAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyObject,
} from "jose";

// jwt.ts is server-only; neutralise the guard so it can be unit tested in node.
vi.mock("server-only", () => ({}));

const { verifySupabaseJwt } = await import("./jwt");
type JwtVerifierDeps = import("./jwt").JwtVerifierDeps;

// Verifier unit tests covering BOTH signing modes.
//
// Prod is currently on ASYMMETRIC ES256 (confirmed against the project's
// .well-known/jwks.json). The legacy HS256 path exists because Supabase lets
// both coexist during a key migration, and rotation moves tokens between them.
// Both are tested here so rotation day cannot silently break patient auth.
//
// Zero network access: the asymmetric path is driven through a LOCAL JWKS built
// from a keypair generated in-process, standing in for the remote key set.

const ISSUER = "https://test-project.supabase.co/auth/v1";
const TEST_SECRET = "test-only-hs256-secret-value-not-a-real-credential";

let privateKey: KeyObject | CryptoKey;
let wrongPrivateKey: KeyObject | CryptoKey;
let publicJwk: JWK;
let asymmetricDeps: JwtVerifierDeps;
let symmetricDeps: JwtVerifierDeps;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), alg: "ES256", use: "sig" };

  const otherPair = await generateKeyPair("ES256", { extractable: true });
  wrongPrivateKey = otherPair.privateKey;

  asymmetricDeps = {
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    secret: null,
    issuer: ISSUER,
  };
  symmetricDeps = {
    jwks: null,
    secret: new TextEncoder().encode(TEST_SECRET),
    issuer: ISSUER,
  };
});

type SignOpts = {
  alg?: "ES256" | "HS256";
  key?: unknown;
  exp?: number | null;
  nbf?: number;
  issuer?: string;
  audience?: string;
};

async function token(claims: Record<string, unknown>, opts: SignOpts = {}) {
  const alg = opts.alg ?? "ES256";
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg, typ: "JWT" })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? "authenticated");
  if (opts.exp !== null) jwt = jwt.setExpirationTime(opts.exp ?? "1h");
  if (opts.nbf !== undefined) jwt = jwt.setNotBefore(opts.nbf);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign((opts.key ?? privateKey) as any);
}

const claims = () => ({ role: "patient", patient_id: "p", tenant_id: "t" });

describe("asymmetric mode (ES256, current prod)", () => {
  it("accepts a token signed by the project key", async () => {
    const payload = await verifySupabaseJwt(await token(claims()), asymmetricDeps);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("patient");
  });

  it("rejects a token signed by a DIFFERENT key", async () => {
    const t = await token(claims(), { key: wrongPrivateKey });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });

  it("rejects a tampered payload under a valid signature", async () => {
    // Swap the middle segment for one the signature does not cover.
    const t = await token(claims());
    const [h, , s] = t.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...claims(), patient_id: "someone-else", exp: 9_999_999_999 }),
    ).toString("base64url");
    expect(await verifySupabaseJwt(`${h}.${forgedPayload}.${s}`, asymmetricDeps)).toBeNull();
  });

  it("rejects an HS256 token when only the JWKS is configured (key confusion)", async () => {
    // The classic attack: sign with HS256 using the public key as the secret and
    // hope the verifier dispatches on the attacker's own alg header.
    const t = await token(claims(), {
      alg: "HS256",
      key: new TextEncoder().encode(JSON.stringify(publicJwk)),
    });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });
});

describe("symmetric mode (legacy HS256)", () => {
  it("accepts a token signed with the configured secret", async () => {
    const t = await token(claims(), {
      alg: "HS256",
      key: new TextEncoder().encode(TEST_SECRET),
    });
    expect(await verifySupabaseJwt(t, symmetricDeps)).not.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const t = await token(claims(), {
      alg: "HS256",
      key: new TextEncoder().encode("some-other-secret-entirely-0000"),
    });
    expect(await verifySupabaseJwt(t, symmetricDeps)).toBeNull();
  });

  it("rejects an HS256 token when no secret is configured", async () => {
    const t = await token(claims(), {
      alg: "HS256",
      key: new TextEncoder().encode(TEST_SECRET),
    });
    expect(
      await verifySupabaseJwt(t, { ...symmetricDeps, secret: null }),
    ).toBeNull();
  });

  it("rejects an ES256 token when only the secret is configured", async () => {
    expect(await verifySupabaseJwt(await token(claims()), symmetricDeps)).toBeNull();
  });
});

describe("temporal claims", () => {
  it("rejects an expired token", async () => {
    const t = await token(claims(), { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });

  it("REQUIRES exp: a token without one is rejected, not accepted", async () => {
    const t = await token(claims(), { exp: null });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });

  it("rejects a token whose nbf is in the future", async () => {
    const t = await token(claims(), { nbf: Math.floor(Date.now() / 1000) + 600 });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });

  it("tolerates a few seconds of clock drift", async () => {
    // Expiring 2s ago must still pass under the 5s tolerance, so a slightly
    // fast API instance does not 401 legitimate patients.
    const t = await token(claims(), { exp: Math.floor(Date.now() / 1000) - 2 });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).not.toBeNull();
  });
});

describe("issuer and audience pinning", () => {
  it("rejects a token from another Supabase project", async () => {
    const t = await token(claims(), { issuer: "https://evil.supabase.co/auth/v1" });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });

  it("rejects a non-'authenticated' audience", async () => {
    const t = await token(claims(), { audience: "anon" });
    expect(await verifySupabaseJwt(t, asymmetricDeps)).toBeNull();
  });
});

describe("malformed input and fail-closed config", () => {
  it.each([
    ["empty string", ""],
    ["not a jwt", "hello"],
    ["two segments", "a.b"],
    ["alg=none", `${Buffer.from('{"alg":"none"}').toString("base64url")}.e30.`],
  ])("rejects %s", async (_label, bad) => {
    expect(await verifySupabaseJwt(bad, asymmetricDeps)).toBeNull();
  });

  it("rejects everything when no issuer is configured", async () => {
    const t = await token(claims());
    expect(
      await verifySupabaseJwt(t, { ...asymmetricDeps, issuer: null }),
    ).toBeNull();
  });

  it("rejects when neither a key source nor a secret is configured", async () => {
    const t = await token(claims());
    expect(
      await verifySupabaseJwt(t, { jwks: null, secret: null, issuer: ISSUER }),
    ).toBeNull();
  });
});
