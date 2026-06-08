// IfThenPay integration — Multibanco reference generation.
//
// Generates a Multibanco (entity + reference + amount) the patient pays at an
// ATM or via homebanking. TENANT-SCOPED by contract: the caller passes the
// invoices.id as the orderId, and that invoice is tenant-owned — reconciliation
// later matches the callback back to that exact tenant's invoice.
//
// NO retry logic, NO logging here — one HTTP call, then map the result. Retry /
// observability is the Inngest layer's job. Owner-gated: resolveMbKey() throws
// IfThenPayConfigError before any fetch when the key is unset.

import { IfThenPayClient } from "./client";
import { resolveMbKey } from "./config";
import { IfThenPayApiError } from "./errors";
import { centsToDecimalString, decimalStringToCents } from "./money";
import type {
  IftMultibancoRequestBody,
  IftMultibancoResponse,
  MultibancoReference,
  MultibancoReferenceInput,
} from "./types";

/** IfThenPay gateway path for Multibanco reference creation. */
export const MULTIBANCO_INIT_PATH = "/multibanco/reference/init";

/**
 * Generate a Multibanco reference for an unpaid invoice.
 *
 * Preconditions (fail-loud, non-retryable) so we never ask for an invalid
 * reference: a positive integer-cent amount and a non-empty orderId.
 */
export async function generateMultibancoReference(
  client: IfThenPayClient,
  input: MultibancoReferenceInput,
): Promise<MultibancoReference> {
  if (!input.orderId.trim()) {
    throw new IfThenPayApiError(400, "Multibanco: orderId is required.");
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new IfThenPayApiError(
      400,
      "Multibanco: amount must be a positive integer-cent value.",
    );
  }

  const body: IftMultibancoRequestBody = {
    mbKey: resolveMbKey(),
    orderId: input.orderId,
    amount: centsToDecimalString(input.amountCents),
  };
  if (input.description) body.description = input.description;
  if (input.expiryDays !== undefined) body.expiryDays = input.expiryDays;

  const res = await client.request<IftMultibancoResponse>({
    method: "POST",
    path: MULTIBANCO_INIT_PATH,
    body,
  });

  // The gateway returns 2xx even for business errors; require the actual fields.
  if (!res?.Entity || !res?.Reference) {
    // Status only — never the Message, which can echo the submitted request.
    throw new IfThenPayApiError(
      502,
      `Multibanco: reference not returned (status ${res?.Status ?? "?"}).`,
    );
  }

  return {
    entity: res.Entity,
    reference: res.Reference,
    amountCents: decimalStringToCents(res.Amount) || input.amountCents,
    orderId: res.OrderId ?? input.orderId,
    requestId: res.RequestId ?? null,
    expiresAt: res.ExpiryDate ?? null,
  };
}
