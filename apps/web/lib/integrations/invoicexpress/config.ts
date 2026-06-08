// InvoiceXpress integration — runtime configuration + credential gating.
//
// Phase 4. NO LIVE CALLS by default. A real request to InvoiceXpress requires
// BOTH owner-supplied secrets, neither of which is committed:
//   - INVOICEXPRESS_API_KEY     — account API key (secret)
//   - INVOICEXPRESS_ACCOUNT_NAME — the account subdomain (<name>.app.invoicexpress.com)
//
// Until the owner provisions the sandbox key (gate 1) and signs off the VAT rate
// wiring (gate 2, see #107), the key stays UNSET and every operation that would
// touch the network resolves credentials → throws InvoiceXpressConfigError
// BEFORE any fetch. That is what keeps the "do not hit the live sandbox" rule
// enforceable in code, not just by convention.
//
// Pure module: no `server-only` so it is unit-testable under vitest's node env.
// Reads env at call time (not module load) so tests can flip env without
// re-importing.

import { InvoiceXpressConfigError } from "./errors";

/** Resolved, validated credentials for a single InvoiceXpress account. */
export type InvoiceXpressCredentials = {
  /** Account subdomain — e.g. "osteojp" → https://osteojp.app.invoicexpress.com */
  accountName: string;
  /** Secret API key. Never logged, never placed anywhere it could be persisted. */
  apiKey: string;
};

/** Base host for an account. Path + api_key are appended by the client. */
export function accountBaseUrl(accountName: string): string {
  return `https://${accountName}.app.invoicexpress.com`;
}

/**
 * True only when both credentials are present. This is the single gate the rest
 * of the module asks before assuming a live call is even possible. With the key
 * left unset (the committed default) this is always false.
 */
export function credentialsConfigured(): boolean {
  return (
    !!process.env.INVOICEXPRESS_API_KEY?.trim() &&
    !!process.env.INVOICEXPRESS_ACCOUNT_NAME?.trim()
  );
}

/**
 * Resolve credentials or fail loud. Callers hit this before constructing any
 * request, so an unconfigured environment never reaches the network. The error
 * carries no secret material.
 */
export function resolveCredentials(): InvoiceXpressCredentials {
  const apiKey = process.env.INVOICEXPRESS_API_KEY?.trim();
  const accountName = process.env.INVOICEXPRESS_ACCOUNT_NAME?.trim();

  if (!apiKey || !accountName) {
    throw new InvoiceXpressConfigError(
      "InvoiceXpress credentials are not configured (INVOICEXPRESS_API_KEY / " +
        "INVOICEXPRESS_ACCOUNT_NAME). This is owner-gated: the sandbox key is " +
        "provisioned separately and never committed. No request was made.",
    );
  }

  return { accountName, apiKey };
}
