import "server-only";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

// Cryptographic verification of Supabase-issued patient JWTs (SEC-01/02/03).
//
// Before this module existed, apps/api DECODED the token and trusted the
// payload. Anyone could mint `base64(header).base64(payload).garbage` and pick
// their own patient_id. RLS was not a backstop: it keys on jwt_patient_id(),
// which reads request.jwt.claims, which was set from that same forged payload.
// The policy compared the forged id to itself. Verification here is therefore
// the ONLY thing standing between a request and another patient's record.
//
// Two signing modes, both supported, because Supabase lets them coexist during
// a key migration and rotation moves tokens between them. A verifier handling
// only one mode fails silently on rotation day.
//
//   asymmetric (current prod) — ES256/RS256, verified against the public JWKS.
//       No secret exists to hold; the public key is fetched from the project's
//       .well-known endpoint and cached.
//   symmetric (legacy)        — HS256, verified against SUPABASE_JWT_SECRET.
//       Dormant while prod is asymmetric; present so rotation cannot break auth.
//
// Dispatch is on the token's `alg` header. That header is attacker-controlled,
// which is exactly why each branch pins `algorithms` to the set it accepts: an
// attacker who claims alg=none or swaps ES256 for HS256 to try a key-confusion
// attack is rejected by the algorithm allowlist, not by the header they sent.

/** Claims every patient token must satisfy beyond its signature. */
const AUDIENCE = "authenticated";

/** Small leeway for clock drift between Supabase and the API instance. */
const CLOCK_TOLERANCE_S = 5;

export type JwtVerifierDeps = {
  /** Asymmetric key source (remote JWKS in prod, local set in tests). */
  jwks: JWTVerifyGetKey | null;
  /** Legacy symmetric secret, already encoded. Null when not configured. */
  secret: Uint8Array | null;
  issuer: string | null;
};

// The remote key set is built ONCE per process, never per request. jose caches
// the fetched keys (10 minute max age, matching the endpoint's own edge cache)
// and refetches only when it sees an unknown `kid`, which is what makes key
// rotation self-healing without a deploy.
let cachedJwks: JWTVerifyGetKey | null = null;
let cachedJwksOrigin: string | null = null;

function remoteJwks(supabaseUrl: string): JWTVerifyGetKey {
  if (cachedJwks && cachedJwksOrigin === supabaseUrl) return cachedJwks;
  cachedJwks = createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    { cacheMaxAge: 600_000, cooldownDuration: 30_000 },
  );
  cachedJwksOrigin = supabaseUrl;
  return cachedJwks;
}

/**
 * Build the verifier's dependencies from the environment.
 *
 * Env var NAMES (values are set in Vercel, never in code):
 *   NEXT_PUBLIC_SUPABASE_URL — already required by the app; derives both the
 *       issuer and the JWKS URL. Not a secret.
 *   SUPABASE_JWT_SECRET      — legacy HS256 secret. OPTIONAL. Only needed if
 *       the project is moved back to (or still issues) symmetric tokens.
 *
 * Fail-closed: with no NEXT_PUBLIC_SUPABASE_URL there is no issuer to pin and
 * no key source, so every token is rejected rather than let through unchecked.
 */
export function defaultVerifierDeps(): JwtVerifierDeps {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const rawSecret = process.env.SUPABASE_JWT_SECRET;
  return {
    jwks: supabaseUrl ? remoteJwks(supabaseUrl) : null,
    secret: rawSecret ? new TextEncoder().encode(rawSecret) : null,
    issuer: supabaseUrl ? `${supabaseUrl}/auth/v1` : null,
  };
}

/**
 * Verify a Supabase JWT and return its claims, or null (fail-closed) if the
 * token is not cryptographically valid and currently in force.
 *
 * Rejects, in every case by returning null rather than throwing:
 *   - a bad, absent, or algorithm-confused signature
 *   - `exp` in the past, AND `exp` absent entirely (a token with no expiry is a
 *     permanent credential, so a missing exp is a rejection, not a pass)
 *   - `nbf` in the future
 *   - an issuer that is not this project's auth server
 *   - an audience that is not `authenticated`
 */
export async function verifySupabaseJwt(
  token: string,
  deps: JwtVerifierDeps = defaultVerifierDeps(),
): Promise<JWTPayload | null> {
  if (!deps.issuer) return null;

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    return null; // not a well-formed JWS at all
  }
  if (!alg) return null;

  const options = {
    issuer: deps.issuer,
    audience: AUDIENCE,
    clockTolerance: CLOCK_TOLERANCE_S,
  };

  try {
    let payload: JWTPayload;

    if (alg === "HS256") {
      // Legacy symmetric mode. Absent secret => reject; never fall through to
      // the asymmetric path, which would be the key-confusion bug itself.
      if (!deps.secret) return null;
      ({ payload } = await jwtVerify(token, deps.secret, {
        ...options,
        algorithms: ["HS256"],
      }));
    } else {
      if (!deps.jwks) return null;
      ({ payload } = await jwtVerify(token, deps.jwks, {
        ...options,
        algorithms: ["ES256", "RS256"],
      }));
    }

    // jose enforces exp when present; it does NOT require presence. We do.
    if (typeof payload.exp !== "number") return null;

    return payload;
  } catch {
    // Signature failure, expiry, nbf, iss, aud, and network failure fetching
    // the JWKS all land here. Every one of them is a rejection.
    return null;
  }
}
