// IfThenPay integration — inbound callback: anti-spoof validation + parsing.
//
// IfThenPay confirms a payment by calling a configured callback URL with query
// params, including a shared ANTI-PHISHING KEY. That key is the only thing
// standing between a real settlement and a forged one, so this module is the
// security gate: nothing downstream (reconciliation, the ledger write) runs
// until authenticateCallback() has verified the key.
//
// Anti-spoof rules:
//   - The key is compared in CONSTANT TIME (crypto.timingSafeEqual) so a forger
//     cannot probe it byte-by-byte via response timing.
//   - A missing/short/mismatched key → IfThenPayCallbackAuthError (NEVER
//     retryable; a forged callback never becomes valid).
//   - The key is verified and then DISCARDED — it never enters the normalized
//     PaymentCallback, an Inngest event, or any log.
//
// Pure module (no `server-only`, only node:crypto) → unit-testable.

import { timingSafeEqual } from "node:crypto";
import { resolveCallbackKey } from "./config";
import { IfThenPayCallbackAuthError } from "./errors";
import { decimalStringToCents } from "./money";
import type {
  IftCallbackParams,
  PaymentCallback,
  PaymentMethod,
} from "./types";

/**
 * Constant-time string compare. Returns false (not throw) on any length
 * mismatch or non-string input, so callers get a uniform boolean. The
 * length check is intentionally before timingSafeEqual (which throws on
 * unequal lengths) — length is not itself secret.
 */
export function safeKeyEqual(received: string, expected: string): boolean {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Infer the settling method from the callback params. Defaults to multibanco
 * (an entity+reference settlement) when not explicitly an MB Way callback. */
function inferMethod(params: IftCallbackParams): PaymentMethod {
  const t = params.payment_type?.toLowerCase();
  if (t === "mbway" || t === "mb_way") return "mbway";
  if (t === "multibanco" || t === "mb") return "multibanco";
  // No explicit type: an MB Way callback carries no entity/reference.
  return params.entity || params.reference ? "multibanco" : "mbway";
}

/**
 * Verify the anti-phishing key against the configured secret, then normalize
 * the callback into an authenticated PaymentCallback. Throws
 * IfThenPayCallbackAuthError (non-retryable) on any auth failure, BEFORE any
 * downstream effect. The expected key may be injected for tests; in production
 * it resolves from env (and is fail-closed when unset).
 */
export function authenticateCallback(
  params: IftCallbackParams,
  expectedKey: string = resolveCallbackKey(),
): PaymentCallback {
  const received = params.key ?? "";
  if (!received || !safeKeyEqual(received, expectedKey)) {
    // No echo of the received value — that would leak a probe oracle.
    throw new IfThenPayCallbackAuthError(
      "IfThenPay callback rejected: anti-phishing key mismatch.",
    );
  }

  const orderId = params.orderId?.trim();
  if (!orderId) {
    throw new IfThenPayCallbackAuthError(
      "IfThenPay callback rejected: missing orderId.",
    );
  }

  return {
    orderId,
    amountCents: decimalStringToCents(params.amount),
    method: inferMethod(params),
    requestId: params.requestId ?? null,
    paidAt: params.payment_datetime ?? null,
  };
}
