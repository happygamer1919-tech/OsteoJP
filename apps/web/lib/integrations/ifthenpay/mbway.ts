// IfThenPay integration — MB Way payment request.
//
// Pushes a payment request to the payer's MB Way app. TENANT-SCOPED via the
// orderId (invoices.id). The payer's mobile/email is PII: it travels in the
// request BODY only (client.ts), never a URL, never a log (CLAUDE.md #7).
//
// NO retry logic, NO logging here — one HTTP call, then map the result. A
// successful response means the request was ACCEPTED; the actual payment is
// confirmed later by a callback. Owner-gated: resolveMbWayKey() throws
// IfThenPayConfigError before any fetch when the key is unset.

import { IfThenPayClient } from "./client";
import { resolveMbWayKey } from "./config";
import { IfThenPayApiError } from "./errors";
import { centsToDecimalString } from "./money";
import type {
  IftMbWayRequestBody,
  IftMbWayResponse,
  MbWayRequest,
  MbWayRequestInput,
} from "./types";

/** IfThenPay gateway path for an MB Way payment request. */
export const MBWAY_PAYMENT_PATH = "/spg/payment/mbway";

/** Vendor status that means "request accepted, awaiting payer confirmation". */
export const MBWAY_ACCEPTED_STATUS = "000";

/**
 * Request an MB Way payment for an unpaid invoice.
 *
 * Preconditions (fail-loud, non-retryable): a positive integer-cent amount, a
 * non-empty orderId, and a mobile number. We do NOT validate the phone format
 * beyond non-empty — IfThenPay is the authority on the "351#9XXXXXXXX" shape.
 */
export async function requestMbWayPayment(
  client: IfThenPayClient,
  input: MbWayRequestInput,
): Promise<MbWayRequest> {
  if (!input.orderId.trim()) {
    throw new IfThenPayApiError(400, "MB Way: orderId is required.");
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new IfThenPayApiError(
      400,
      "MB Way: amount must be a positive integer-cent value.",
    );
  }
  if (!input.mobileNumber.trim()) {
    throw new IfThenPayApiError(400, "MB Way: a payer mobile number is required.");
  }

  const body: IftMbWayRequestBody = {
    mbWayKey: resolveMbWayKey(),
    orderId: input.orderId,
    amount: centsToDecimalString(input.amountCents),
    mobileNumber: input.mobileNumber,
  };
  if (input.email) body.email = input.email;
  if (input.description) body.description = input.description;

  const res = await client.request<IftMbWayResponse>({
    method: "POST",
    path: MBWAY_PAYMENT_PATH,
    body,
  });

  if (res?.Status !== MBWAY_ACCEPTED_STATUS) {
    // Status code only — never the Message, which can echo payer contact.
    throw new IfThenPayApiError(
      502,
      `MB Way: request not accepted (status ${res?.Status ?? "?"}).`,
    );
  }

  return {
    orderId: res.OrderId ?? input.orderId,
    requestId: res.RequestId ?? null,
    statusCode: res.Status,
    status: "pending",
  };
}
