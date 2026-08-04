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

/**
 * The action set a token authorises, per counsel §5 and the owner's 24h cancel
 * cutoff. It travels INSIDE the signature, so the offered actions cannot be
 * widened by editing the URL.
 *
 *   "confirm_cancel" — the 48h email link. Sent outside the cutoff.
 *   "confirm"        — the 24h SMS link. Arrives at or inside the cutoff, where
 *                      cancelling is no longer permitted.
 *
 * The scope is a CEILING, never a permission: the server re-evaluates the cutoff
 * against the clock at redemption regardless of what the scope allows, because a
 * confirm_cancel link issued at 48h is legitimately outside the cutoff when
 * created and may be clicked 30 hours later, inside it (§5).
 */
export type TokenScope = "confirm" | "confirm_cancel";

export type ReschedulePayload = {
  /** tenant_id — the RLS scope for the appointment lookup. */
  tenantId: string;
  /** appointment id the link resolves to. */
  appointmentId: string;
  /** absolute expiry, unix seconds. */
  exp: number;
  /** which actions this token may perform. */
  scope: TokenScope;
};

type WirePayload = { t: string; a: string; exp: number; s?: string };

const SCOPES: readonly TokenScope[] = ["confirm", "confirm_cancel"];

/**
 * exp (unix seconds) for a link tied to an appointment starting at `startsAt`:
 * the appointment START, and not one second later.
 *
 * WHY THERE IS NO GRACE WINDOW. Counsel requires 24 to 72 hours from issuance
 * and NEVER past the appointment start (docs/rgpd-token-flow.md §4), and names
 * this exact failure: a window that "would outlive the appointment and leave a
 * live token for a visit that has already happened". Tying expiry to the start
 * satisfies both constraints with one rule and kills the token the moment it
 * could no longer be acted on meaningfully.
 *
 * This REPLACES a 24-hour grace window that ran PAST the start. That was
 * survivable while the landing page was read-only, and is not survivable now
 * that the same token confirms and cancels: it would have left a link able to
 * act on an appointment that had already happened.
 *
 * Both offsets land inside counsel's 24-72h band by construction — the 48h email
 * gets 48 hours, the 24h SMS gets 24 — so no offset can drift outside the band
 * without also changing the reminder schedule.
 */
export function rescheduleTokenExpiry(startsAt: Date): number {
  return Math.floor(startsAt.getTime() / 1000);
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
    s: payload.scope,
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
    if (!secret) {
      // ASYMMETRY FIXED: signing throws when the secret is absent, verification
      // used to return null — the same value it returns for a forged or expired
      // token. A deployment missing the secret therefore presented to every
      // patient as "invalid link" with no operational signal anywhere.
      //
      // Still returns null (the caller must not distinguish, and must not leak
      // configuration state to an attacker), but no longer silently: a
      // misconfiguration is now greppable. No secret material is logged.
      console.error(
        `[reminders] link verification impossible: ${SECRET_ENV} is not configured. ` +
          `Every reschedule link will read as invalid until it is set.`,
      );
      return null;
    }

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
    // An unrecognised or absent scope is REFUSED rather than defaulted. The
    // permissive value (confirm_cancel) must never be reachable by omitting a
    // field, and the restrictive one must not be silently granted either: both
    // would be a policy decision made by a missing byte. A token this code did
    // not mint is not a token.
    if (!SCOPES.includes(wire.s as TokenScope)) return null;
    if (wire.exp * 1000 <= now.getTime()) return null;

    return {
      tenantId: wire.t,
      appointmentId: wire.a,
      exp: wire.exp,
      scope: wire.s as TokenScope,
    };
  } catch {
    return null;
  }
}
