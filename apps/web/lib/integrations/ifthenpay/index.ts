// IfThenPay integration — public surface.
//
// Typed client + Multibanco reference + MB Way request + an anti-spoofed
// callback handler + reconciliation onto the internal invoices ledger + Inngest
// retry wiring. NO LIVE CALLS by default: keys are owner-gated and unset
// (config.ts), so every outbound operation throws IfThenPayConfigError first,
// and every inbound callback is rejected fail-closed.
//
// IfThenPay records payment status to the INTERNAL ledger only; it NEVER issues
// a fiscal document — the InvoiceXpress relay owns that.

export {
  DEFAULT_BASE_URL,
  baseUrl,
  multibancoConfigured,
  mbWayConfigured,
  callbackKeyConfigured,
  resolveMbKey,
  resolveMbWayKey,
  resolveCallbackKey,
} from "./config";

export {
  IfThenPayError,
  IfThenPayConfigError,
  IfThenPayApiError,
  IfThenPayNetworkError,
  IfThenPayCallbackAuthError,
  isRetryableStatus,
} from "./errors";

export { centsToDecimalString, decimalStringToCents } from "./money";

export { IfThenPayClient, redactSecrets } from "./client";

export {
  generateMultibancoReference,
  MULTIBANCO_INIT_PATH,
} from "./multibanco";

export {
  requestMbWayPayment,
  MBWAY_PAYMENT_PATH,
  MBWAY_ACCEPTED_STATUS,
} from "./mbway";

export { authenticateCallback, safeKeyEqual } from "./callback";

export {
  reconcilePayment,
  type ReconcileOutcome,
  type ReconcileResult,
} from "./reconciliation";

export type {
  PaymentLedgerPort,
  LedgerInvoice,
  MarkPaidInput,
} from "./ledger";

export type {
  PaymentMethod,
  PaymentRequestStatus,
  MultibancoReferenceInput,
  MultibancoReference,
  MbWayRequestInput,
  MbWayRequest,
  PaymentCallback,
  IftCallbackParams,
} from "./types";

export {
  EVENT_PAYMENT_CALLBACK_RECEIVED,
  type PaymentCallbackReceivedData,
} from "./inngest/client";
