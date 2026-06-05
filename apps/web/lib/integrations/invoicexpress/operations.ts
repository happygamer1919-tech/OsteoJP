// InvoiceXpress integration — the four domain operations: issue / retrieve /
// void / list, against the fatura-recibo (invoice_receipts) resource.
//
// Every operation is TENANT-SCOPED: it takes the tenant's fiscal profile, which
// both identifies the issuing tenant and supplies the NIF/series. The profile is
// the boundary that keeps one tenant's invoices from being issued under
// another's identity.
//
// These functions contain NO retry logic and NO logging — they do exactly one
// HTTP call each and translate the result. Retry/observability is the Inngest
// layer's job (inngest/functions.ts), so the operations stay pure-ish and
// directly unit-testable with a mocked client.

import { InvoiceXpressClient } from "./client";
import { InvoiceXpressConfigError } from "./errors";
import {
  fromInvoiceReceipt,
  normalizeState,
  toInvoiceReceiptInput,
} from "./mapper";
import type {
  IssueInvoiceInput,
  IssuedInvoice,
  ListInvoicesInput,
  ListInvoicesResult,
  IxInvoiceReceiptRequestBody,
  IxInvoiceReceiptResponse,
  IxListResponse,
  TenantFiscalProfile,
} from "./types";

function toInt(v: number | string | undefined, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * Issue a fatura-recibo for a tenant.
 *
 * Preconditions enforced here (fail-loud, non-retryable) so we never send an
 * invalid fiscal document to InvoiceXpress:
 *   - the tenant fiscal profile must carry a NIF (a PT fiscal doc is issued
 *     under the clinic's NIF);
 *   - currency must be EUR (V1).
 *
 * NOTE (owner-gated, #107): the VAT rate that flows from the tenant's #4
 * BillingConfig into the line items is NOT authorized for real issuance until
 * the owner signs off. Building + mapping the request is safe; actually POSTing
 * it requires the configured credentials, which are owner-provisioned and unset
 * by default (config.ts).
 */
export async function issueInvoice(
  client: InvoiceXpressClient,
  profile: TenantFiscalProfile,
  input: IssueInvoiceInput,
): Promise<IssuedInvoice> {
  if (!profile.nif?.trim()) {
    throw new InvoiceXpressConfigError(
      `Tenant ${profile.tenantId} has no NIF — cannot issue a fatura-recibo.`,
    );
  }
  if (profile.currency !== "EUR") {
    throw new InvoiceXpressConfigError(
      `Tenant ${profile.tenantId} currency must be EUR for V1 issuance.`,
    );
  }

  const body: IxInvoiceReceiptRequestBody = {
    invoice_receipt: toInvoiceReceiptInput(profile, input),
  };

  const res = await client.request<IxInvoiceReceiptResponse>({
    method: "POST",
    path: "/invoice_receipts.json",
    body,
  });

  return fromInvoiceReceipt(res.invoice_receipt);
}

/** Retrieve a single fatura-recibo by its InvoiceXpress id. */
export async function retrieveInvoice(
  client: InvoiceXpressClient,
  _profile: TenantFiscalProfile,
  invoiceId: number,
): Promise<IssuedInvoice> {
  const res = await client.request<IxInvoiceReceiptResponse>({
    method: "GET",
    path: `/invoice_receipts/${invoiceId}.json`,
  });
  return fromInvoiceReceipt(res.invoice_receipt);
}

/**
 * Void (cancel) a fatura-recibo. PT fiscal rules require a cancellation reason,
 * which is recorded in the document's SAF-T trail — so `reason` is mandatory.
 * Implemented as an InvoiceXpress change-state → "canceled".
 */
export async function voidInvoice(
  client: InvoiceXpressClient,
  _profile: TenantFiscalProfile,
  invoiceId: number,
  reason: string,
): Promise<IssuedInvoice> {
  if (!reason.trim()) {
    throw new InvoiceXpressConfigError(
      "Voiding a fatura-recibo requires a cancellation reason (PT fiscal rule).",
    );
  }

  const res = await client.request<IxInvoiceReceiptResponse>({
    method: "PUT",
    path: `/invoice_receipts/${invoiceId}/change-state.json`,
    body: { invoice_receipt: { state: "canceled", message: reason } },
  });

  // Some change-state responses are empty (204); fall back to a canceled view.
  if (!res?.invoice_receipt) {
    return {
      id: invoiceId,
      sequenceNumber: null,
      state: "canceled",
      totalCents: 0,
      currency: "EUR",
      date: null,
      permalink: null,
    };
  }
  return fromInvoiceReceipt(res.invoice_receipt);
}

/** List a tenant's fatura-recibo documents, paginated. Filters are non-PII. */
export async function listInvoices(
  client: InvoiceXpressClient,
  _profile: TenantFiscalProfile,
  input: ListInvoicesInput = {},
): Promise<ListInvoicesResult> {
  const page = input.page ?? 1;
  const res = await client.request<IxListResponse>({
    method: "GET",
    path: "/invoice_receipts.json",
    query: {
      page,
      // InvoiceXpress filters by document status string; map our state back.
      status: input.state ? denormalizeState(input.state) : undefined,
      text: input.query,
    },
  });

  const invoices = (res.invoice_receipts ?? []).map(fromInvoiceReceipt);
  return {
    invoices,
    page: toInt(res.pagination?.current_page, page),
    totalPages: toInt(res.pagination?.total_pages, 1),
    totalEntries: toInt(res.pagination?.total_entries, invoices.length),
  };
}

/** Our InvoiceState → an InvoiceXpress status filter string. */
function denormalizeState(state: ListInvoicesInput["state"]): string | undefined {
  switch (state) {
    case "draft":
      return "draft";
    case "issued":
      return "final";
    case "settled":
      return "settled";
    case "canceled":
      return "canceled";
    case "second_copy":
      return "second_copy";
    default:
      return undefined;
  }
}

// Re-exported for the Inngest layer + tests.
export { normalizeState };
