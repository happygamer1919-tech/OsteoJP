// What arrived on the set-password landing URL, and where it arrived.
//
// Pure module - no DOM, no Supabase, no `server-only` - so the parsing that five
// verification rounds could not pin down is unit-testable without a browser.
//
// THERE ARE TWO SHAPES, and the whole LE-auth-recovery-deadend investigation is
// the story of the second one not being read:
//
//   NEW (token_hash), in the QUERY STRING, and what the emails now send:
//     /auth/update-password?token_hash=<hash>&type=recovery
//   Inert. Nothing is spent by loading it. `verifyOtp({token_hash, type})`
//   redeems it, and only from an explicit user action.
//
//   LEGACY (verify redirect), in the HASH FRAGMENT, still live for links that
//   were already sitting in inboxes when the fix shipped:
//     #access_token=...&refresh_token=...&type=recovery      (success)
//     #error=...&error_code=otp_expired&error_description=... (failure)
//
// WHY THE QUERY IS SAFE TO READ AND THE FRAGMENT WAS NOT.
//   auth-js deletes the `code` search param as part of detectSessionInUrl
//   (GoTrueClient.js:3062-3063) and then replaceState's the URL. It deletes
//   "code", NOT "token_hash", so our own param survives.
//   The old page then compounded that: scrubHash() ran on EVERY outcome
//   including the error path, so the one screen a human was looking at had just
//   erased what caused it. That is why five rounds produced no diagnosis, and it
//   is why `raw` below is captured BEFORE anything scrubs.

export type LinkParams = {
  /** The inert one-time token from the email. Present on the new shape only. */
  tokenHash: string | null;
  /** `recovery` for a password reset, `invite` for a staff invite. */
  type: string | null;
  /** Supabase's own error code, from either shape. `otp_expired` covers both
   *  "expired" and "already used" - Supabase collapses them. */
  errorCode: string | null;
  /** Human-readable error, when Supabase sent one. */
  errorDescription: string | null;
  /** The legacy fragment carried SOMETHING. Distinguishes "arrived from a verify
   *  redirect that failed" from "someone typed the URL". */
  hadHash: boolean;
  /**
   * Everything that arrived, flattened for display, MINUS anything secret.
   *
   * THE FAILURE SCREEN HAS TO BE ABLE TO SAY WHAT FAILED. The old one could not,
   * and that cost this project five verification rounds on a link that had to be
   * aged in a real inbox to reproduce. This is captured before any scrub and
   * surfaced behind a disclosure on the error view.
   */
  raw: string;
};

/**
 * Values never shown, even in the diagnostic line. `token_hash` is a live
 * credential until redeemed; the access/refresh tokens are a session. Their
 * PRESENCE is diagnostic and is reported; their VALUE is not.
 */
const REDACTED = new Set(["token_hash", "access_token", "refresh_token", "code"]);

function redact(params: URLSearchParams, where: string, into: string[]): void {
  for (const [k, v] of params) {
    into.push(`${where}.${k}=${REDACTED.has(k) ? `<${v.length} chars>` : v}`);
  }
}

/**
 * Parse both shapes out of a location. Takes `search` and `hash` as strings so
 * it is testable without a DOM and cannot accidentally read a live URL.
 */
export function readLinkParams(search: string, hash: string): LinkParams {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const frag = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const raw: string[] = [];
  redact(query, "query", raw);
  redact(frag, "hash", raw);

  return {
    tokenHash: query.get("token_hash"),
    // The query wins: on the new shape it is the authoritative type, and the
    // fragment is empty anyway. On the legacy shape only the fragment has one.
    type: query.get("type") ?? frag.get("type"),
    errorCode:
      query.get("error_code") ?? query.get("error") ?? frag.get("error_code") ?? frag.get("error"),
    errorDescription:
      query.get("error_description") ?? frag.get("error_description"),
    hadHash: [...frag.keys()].length > 0,
    raw: raw.length > 0 ? raw.join("\n") : "(nothing arrived on the URL)",
  };
}

/**
 * The two OTP types this page redeems. Narrowed rather than passed through:
 * `verifyOtp` accepts several types, and forwarding an arbitrary one from the
 * URL would let a crafted link ask for a verification this page is not for.
 *
 * `invite` and `recovery` are the two Supabase flows that land here, and both
 * end at the same place - a staff member choosing a password.
 */
export function verifiableOtpType(type: string | null): "recovery" | "invite" | null {
  return type === "recovery" || type === "invite" ? type : null;
}
