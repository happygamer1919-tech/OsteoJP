// Stripe integration — runtime configuration + credential gating.
//
// NO LIVE CALLS by default. A real request to Stripe requires the owner-supplied
// secret key, which is NOT committed:
//   - STRIPE_SECRET_KEY      — account secret key (sk_test_… / sk_live_…)
//   - STRIPE_WEBHOOK_SECRET  — endpoint signing secret (whsec_…), for inbound
//                              webhook signature verification only
//
// Until the owner provisions the key (gate 1) and signs off the VAT-23% wiring
// (gate 2, see #107 — payments settle invoices whose VAT is owner-gated), the
// key stays UNSET and every operation that would touch the network resolves
// credentials → throws StripeConfigError BEFORE any fetch. That is what keeps
// the "do not hit live or test Stripe" rule enforceable in code, not just by
// convention.
//
// Pure module: no `server-only` so it is unit-testable under vitest's node env.
// Reads env at call time (not module load) so tests can flip env without
// re-importing.

import { StripeConfigError } from "./errors";

/** Resolved, validated Stripe secret key. */
export type StripeCredentials = {
  /** Secret API key. Never logged, never placed anywhere it could be persisted. */
  secretKey: string;
};

/** Stripe REST API base. The client appends the resource path. */
export const STRIPE_API_BASE = "https://api.stripe.com/v1";

/**
 * True only when the secret key is present. This is the single gate the rest of
 * the module asks before assuming a live call is even possible. With the key
 * left unset (the committed default) this is always false.
 */
export function credentialsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

/** True when the webhook signing secret is present. Gates webhook verification. */
export function webhookSecretConfigured(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET?.trim();
}

/**
 * Resolve the secret key or fail loud. Callers hit this before constructing any
 * request, so an unconfigured environment never reaches the network. The error
 * carries no secret material.
 */
export function resolveCredentials(): StripeCredentials {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new StripeConfigError(
      "Stripe credentials are not configured (STRIPE_SECRET_KEY). This is " +
        "owner-gated: the key is provisioned separately and never committed. " +
        "No request was made.",
    );
  }
  return { secretKey };
}

/**
 * Resolve the webhook signing secret or fail loud. A missing secret is an
 * operator misconfiguration, not a per-request failure — we must never treat an
 * unverifiable webhook as authentic. The error carries no secret material.
 */
export function resolveWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new StripeConfigError(
      "Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET). " +
        "Owner-gated and never committed. The webhook cannot be verified.",
    );
  }
  return secret;
}
