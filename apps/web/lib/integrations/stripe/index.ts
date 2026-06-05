// Stripe integration — public surface.
//
// Typed client + PaymentIntent operations (create / confirm / retrieve) + a
// refund operation + signed-webhook verification + the internal-ledger
// projection + Inngest retry wiring. NO LIVE CALLS by default: the secret key is
// owner-gated and unset (config.ts), so any operation that would reach the
// network throws StripeConfigError first.

export {
  credentialsConfigured,
  webhookSecretConfigured,
  resolveCredentials,
  resolveWebhookSecret,
  STRIPE_API_BASE,
  type StripeCredentials,
} from "./config";

export {
  StripeError,
  StripeConfigError,
  StripeApiError,
  StripeNetworkError,
  StripeSignatureError,
  isRetryableStatus,
  type SignatureRejection,
} from "./errors";

export { StripeClient, encodeForm, type FetchLike } from "./client";

export {
  toCreatePaymentIntentForm,
  normalizePaymentStatus,
  normalizeRefundStatus,
  referenceFromMetadata,
  fromPaymentIntent,
  fromRefund,
  META_TENANT_ID,
  META_INVOICE_ID,
} from "./mapper";

export {
  createPaymentIntent,
  confirmPaymentIntent,
  retrievePaymentIntent,
  refundPayment,
} from "./operations";

export {
  constructEvent,
  signWebhookPayload,
  TOLERANCE_SECONDS,
} from "./webhook";

export {
  paymentIntentToLedgerUpdate,
  refundToLedgerUpdate,
  type LedgerUpdate,
} from "./ledger";

export type {
  PaymentReference,
  CreatePaymentIntentInput,
  ConfirmPaymentIntentInput,
  RefundPaymentInput,
  RefundReason,
  PaymentStatus,
  PaymentIntentResult,
  RefundStatus,
  RefundResult,
} from "./types";

export {
  EVENT_STRIPE_WEBHOOK_RECEIVED,
  type StripeWebhookReceivedData,
} from "./inngest/client";
