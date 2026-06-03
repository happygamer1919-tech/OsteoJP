// Stripe integration — the domain operations: create / confirm / retrieve a
// PaymentIntent, and refund a payment.
//
// Every operation is TENANT-SCOPED: the create call writes the tenant + invoice
// reference into PaymentIntent.metadata, and read paths resolve that reference
// back. This is the boundary that keeps one tenant's payments from settling
// another tenant's invoice.
//
// These functions contain NO retry logic and NO logging — they do exactly one
// HTTP call each and translate the result. Retry/observability is the Inngest
// layer's job (inngest/functions.ts), so the operations stay pure-ish and
// directly unit-testable with a mocked client.
//
// CARD DATA: the only card reference accepted is a Stripe PaymentMethod token id
// (pm_…). A PAN never enters this module (CLAUDE.md: never store card PAN).

import { StripeClient } from "./client";
import { fromPaymentIntent, fromRefund, toCreatePaymentIntentForm } from "./mapper";
import type { FormParams } from "./client";
import type {
  ConfirmPaymentIntentInput,
  CreatePaymentIntentInput,
  PaymentIntentResult,
  RefundPaymentInput,
  RefundResult,
  SxPaymentIntent,
  SxRefund,
} from "./types";

/**
 * Create a card PaymentIntent for an invoice. Idempotent on the invoice id by
 * default (Stripe `Idempotency-Key`), so a retried create never opens two
 * charges for the same invoice. EUR-only (V1).
 *
 * NOTE (owner-gated, #107): a payment SETTLES an invoice whose VAT rate is not
 * authorized for real billing until the owner signs off. Building + sending the
 * intent requires the configured secret key, which is owner-provisioned and
 * unset by default (config.ts) — so this throws StripeConfigError before any
 * network call in this repo.
 */
export async function createPaymentIntent(
  client: StripeClient,
  input: CreatePaymentIntentInput,
): Promise<PaymentIntentResult> {
  const res = await client.request<SxPaymentIntent>({
    method: "POST",
    path: "/payment_intents",
    form: toCreatePaymentIntentForm(input),
    idempotencyKey:
      input.idempotencyKey ?? `pi-create:${input.reference.invoiceId}`,
  });
  return fromPaymentIntent(res);
}

/**
 * Confirm a previously-created PaymentIntent server-side (e.g. an off-session
 * charge). `paymentMethodId` is a Stripe token id, never a PAN.
 */
export async function confirmPaymentIntent(
  client: StripeClient,
  input: ConfirmPaymentIntentInput,
): Promise<PaymentIntentResult> {
  const form: FormParams = {};
  if (input.paymentMethodId) form.payment_method = input.paymentMethodId;
  const res = await client.request<SxPaymentIntent>({
    method: "POST",
    path: `/payment_intents/${encodeURIComponent(input.paymentIntentId)}/confirm`,
    form,
  });
  return fromPaymentIntent(res);
}

/**
 * Retrieve a PaymentIntent by id. This is the AUTHORITATIVE status read used by
 * the webhook job: rather than trusting the event payload's amount/status, the
 * job re-fetches the intent here so the ledger reflects Stripe's truth.
 */
export async function retrievePaymentIntent(
  client: StripeClient,
  paymentIntentId: string,
): Promise<PaymentIntentResult> {
  const res = await client.request<SxPaymentIntent>({
    method: "GET",
    path: `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
  });
  return fromPaymentIntent(res);
}

/**
 * Refund a settled payment, fully or partially. Idempotent on the PaymentIntent
 * id by default so a retried refund never double-refunds. `amountCents` omitted
 * → full refund of the captured amount.
 */
export async function refundPayment(
  client: StripeClient,
  input: RefundPaymentInput,
): Promise<RefundResult> {
  if (
    input.amountCents !== undefined &&
    (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
  ) {
    throw new Error("stripe/operations: refund amountCents must be a positive integer");
  }
  const form: FormParams = { payment_intent: input.paymentIntentId };
  if (input.amountCents !== undefined) form.amount = input.amountCents;
  if (input.reason) form.reason = input.reason;

  const res = await client.request<SxRefund>({
    method: "POST",
    path: "/refunds",
    form,
    idempotencyKey:
      input.idempotencyKey ?? `refund:${input.paymentIntentId}`,
  });
  return fromRefund(res);
}
