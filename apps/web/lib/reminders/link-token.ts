import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless, HMAC-signed reschedule short-link token.
//
// The reminder EMAIL links to /r/<token>. The token is the ONLY thing in the
// URL — no patient name, email, or phone in the clear; the payload carries just
// the tenant + appointment uuids and an expiry, all under an HMAC signature.
// The token is fully stateless: no DB row, no migration. Integrity comes
// entirely from HMAC-SHA256 keyed on a dedicated secret (REMINDERS_LINK_SECRET),
// and the link self-expires via the `exp` claim.
//
// Carrying tenant_id IN the signed token (rather than discovering it from the
// appointment id) is deliberate: the public route can enter tenant-scoped RLS
// context directly from a value WE signed, with no global/cross-tenant lookup
// (hard architecture rule #3). The cost is a longer token — fine for email,
// which is why the SMS reminder points to the phone instead of this link.
//
// Token format:  base64url(JSON payload) "." base64url(HMAC-SHA256 of part 1)
//
// The secret is read at call time and is NEVER logged. Signing throws if it is
// missing — a misconfigured env must fail loud, not mint unverifiable links.
// Verification returns null on ANY problem (bad format, bad signature, expired,
// or missing secret) so the public route always renders a safe generic page and
// never leaks why a token was rejected.

const SECRET_ENV = "REMINDERS_LINK_SECRET";

export type ReschedulePayload = {
  /** tenant_id — the RLS scope for the appointment lookup. */
  tenantId: string;
  /** appointment id the link resolves to. */
  appointmentId: string;
  /** absolute expiry, unix seconds. */
  exp: number;
};

type WirePayload = { t: string; a: string; exp: number };

/** Grace window after the appointment start during which the link still works. */
export const RESCHEDULE_LINK_GRACE_MS = 24 * 60 * 60 * 1000;

/** exp (unix seconds) for a link tied to an appointment starting at `startsAt`. */
export function rescheduleTokenExpiry(startsAt: Date): number {
  return Math.floor((startsAt.getTime() + RESCHEDULE_LINK_GRACE_MS) / 1000);
}

function requireSecret(): string {
  const secret = process.env[SECRET_ENV];
  if (!secret) {
    throw new Error(`reminders/link: ${SECRET_ENV} is not configured`);
  }
  return secret;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function signRescheduleToken(payload: ReschedulePayload): string {
  const secret = requireSecret();
  const wire: WirePayload = {
    t: payload.tenantId,
    a: payload.appointmentId,
    exp: payload.exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(wire), "utf8").toString(
    "base64url",
  );
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a reschedule token and return its claims, or null if it is malformed,
 * tampered, expired, or the secret is unset. Constant-time signature compare.
 */
export function verifyRescheduleToken(
  token: string,
  now: Date = new Date(),
): ReschedulePayload | null {
  try {
    const secret = process.env[SECRET_ENV];
    if (!secret) return null;

    const dot = token.indexOf(".");
    if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    const expected = sign(payloadB64, secret);
    const got = Buffer.from(sigB64);
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;

    const wire = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as WirePayload;

    if (
      typeof wire.t !== "string" ||
      typeof wire.a !== "string" ||
      typeof wire.exp !== "number"
    ) {
      return null;
    }
    if (wire.exp * 1000 <= now.getTime()) return null;

    return { tenantId: wire.t, appointmentId: wire.a, exp: wire.exp };
  } catch {
    return null;
  }
}
