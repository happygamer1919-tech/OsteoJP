// IfThenPay integration — runtime configuration + credential gating.
//
// NO LIVE CALLS by default. A real request to IfThenPay requires owner-supplied
// keys, none of which are committed. They are owner-gated: the IfThenPay sandbox
// keys are tied to the clinic's PT entity and are provisioned separately.
//
//   - IFTHENPAY_MB_KEY            — Multibanco backoffice key (entity sub-key)
//   - IFTHENPAY_MBWAY_KEY         — MB Way key
//   - IFTHENPAY_ANTIPHISHING_KEY  — shared secret echoed in every callback;
//                                   the anti-spoof gate for the webhook
//   - IFTHENPAY_BASE_URL          — optional; defaults to the gateway host
//
// Each outbound operation resolves ONLY the key it needs (resolveMbKey /
// resolveMbWayKey) and throws IfThenPayConfigError BEFORE any fetch when it is
// unset. The callback handler resolves the anti-phishing key the same way. That
// is what keeps "do not hit the live sandbox" enforceable in code, not just by
// convention.
//
// Pure module: no `server-only` so it is unit-testable under vitest's node env.
// Reads env at call time (not module load) so tests can flip env without
// re-importing.

import { IfThenPayConfigError } from "./errors";

/** Default IfThenPay gateway host. Overridable for the sandbox via env. */
export const DEFAULT_BASE_URL = "https://api.ifthenpay.com";

/** Base host for IfThenPay requests. Path + body are appended by the client. */
export function baseUrl(): string {
  return process.env.IFTHENPAY_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/** True only when the Multibanco key is present. */
export function multibancoConfigured(): boolean {
  return !!process.env.IFTHENPAY_MB_KEY?.trim();
}

/** True only when the MB Way key is present. */
export function mbWayConfigured(): boolean {
  return !!process.env.IFTHENPAY_MBWAY_KEY?.trim();
}

/** True only when the callback anti-phishing key is present. */
export function callbackKeyConfigured(): boolean {
  return !!process.env.IFTHENPAY_ANTIPHISHING_KEY?.trim();
}

/**
 * Resolve the Multibanco key or fail loud. Callers hit this before constructing
 * any request, so an unconfigured environment never reaches the network. The
 * error carries no secret material.
 */
export function resolveMbKey(): string {
  const key = process.env.IFTHENPAY_MB_KEY?.trim();
  if (!key) {
    throw new IfThenPayConfigError(
      "IfThenPay Multibanco key is not configured (IFTHENPAY_MB_KEY). This is " +
        "owner-gated: the sandbox key is tied to the clinic PT entity and is " +
        "never committed. No request was made.",
    );
  }
  return key;
}

/** Resolve the MB Way key or fail loud (same gating as resolveMbKey). */
export function resolveMbWayKey(): string {
  const key = process.env.IFTHENPAY_MBWAY_KEY?.trim();
  if (!key) {
    throw new IfThenPayConfigError(
      "IfThenPay MB Way key is not configured (IFTHENPAY_MBWAY_KEY). This is " +
        "owner-gated: the sandbox key is tied to the clinic PT entity and is " +
        "never committed. No request was made.",
    );
  }
  return key;
}

/**
 * Resolve the callback anti-phishing key or fail loud. The webhook uses this to
 * authenticate every inbound callback; with it unset, all callbacks are rejected
 * (fail-closed) — exactly the owner-gated default.
 */
export function resolveCallbackKey(): string {
  const key = process.env.IFTHENPAY_ANTIPHISHING_KEY?.trim();
  if (!key) {
    throw new IfThenPayConfigError(
      "IfThenPay anti-phishing key is not configured " +
        "(IFTHENPAY_ANTIPHISHING_KEY). Inbound callbacks cannot be authenticated " +
        "and are rejected. This is owner-gated.",
    );
  }
  return key;
}
