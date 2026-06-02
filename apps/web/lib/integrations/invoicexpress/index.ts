// InvoiceXpress integration — public surface.
//
// Phase 4. Typed client + fatura-recibo mapping + the four operations
// (issue / retrieve / void / list) + Inngest retry wiring. NO LIVE CALLS by
// default: credentials are owner-gated and unset (config.ts), so any operation
// that would reach the network throws InvoiceXpressConfigError first.

export {
  credentialsConfigured,
  resolveCredentials,
  accountBaseUrl,
  type InvoiceXpressCredentials,
} from "./config";

export {
  InvoiceXpressError,
  InvoiceXpressConfigError,
  InvoiceXpressApiError,
  InvoiceXpressNetworkError,
  isRetryableStatus,
} from "./errors";

export { InvoiceXpressClient } from "./client";

export {
  centsToDecimalString,
  decimalStringToCents,
  taxNameForRate,
  toInvoiceReceiptInput,
  fromInvoiceReceipt,
  normalizeState,
  todayLisbon,
} from "./mapper";

export {
  issueInvoice,
  retrieveInvoice,
  voidInvoice,
  listInvoices,
} from "./operations";

export {
  buildTenantFiscalProfile,
  type TenantFiscalIdentity,
  type FiscalExtras,
} from "./profile";

export type {
  TenantFiscalProfile,
  InvoiceClient,
  InvoiceLineItem,
  IssueInvoiceInput,
  IssuedInvoice,
  InvoiceState,
  ListInvoicesInput,
  ListInvoicesResult,
} from "./types";

export {
  EVENT_INVOICE_ISSUE_REQUESTED,
  type InvoiceIssueRequestedData,
} from "./inngest/client";
