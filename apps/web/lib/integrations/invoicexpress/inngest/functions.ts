import { NonRetriableError } from "inngest";
import {
  inngest,
  EVENT_INVOICE_ISSUE_REQUESTED,
  type InvoiceIssueRequestedData,
} from "./client";
import { InvoiceXpressError } from "../errors";
import type { IssuedInvoice } from "../types";

// Inngest retry wiring for issuing a fatura-recibo (SDK v4 API).
//
// Why this layer exists: issuing a fiscal document is a network call that can
// fail transiently (rate limit, 5xx, connection reset) or permanently (bad
// fiscal data, unknown id, missing credentials). Inngest gives us durable
// retries; this function decides WHICH failures are worth retrying using the
// `retryable` flag on InvoiceXpressError, converting permanent failures to
// NonRetriableError so attempts aren't burned on a request that will fail
// identically every time.
//
// IDEMPOTENCY: keyed on tenant + internal invoice id, so a duplicated
// invoice/issue.requested event NEVER issues two fiscal documents for the same
// invoice — the single most important guard for an invoicing job.
//
// The actual data load + live call live behind runIssueInvoiceJob (the seam),
// which is owner-gated and unwired by default (see below).

export const ISSUE_INVOICE_RETRIES = 4;
export const ISSUE_INVOICE_IDEMPOTENCY_KEY =
  'event.data.tenantId + ":" + event.data.invoiceId';

/**
 * The work of issuing one invoice: load the tenant-scoped invoice + fiscal
 * profile from the data layer, map, and call operations.issueInvoice through a
 * configured InvoiceXpressClient.
 *
 * UNWIRED BY DEFAULT (Phase 4, owner-gated). Two owner dependencies gate a real
 * run: the InvoiceXpress sandbox/live API key (config.ts, unset) and the VAT
 * sign-off (#107). Until the invoices data layer is wired, this throws a
 * non-retryable error so a stray event fails fast instead of looping. Tests
 * inject their own runner via issueInvoiceWithRetryClassification(data, runner).
 */
export async function runIssueInvoiceJob(
  data: InvoiceIssueRequestedData,
): Promise<IssuedInvoice> {
  // tenantId/invoiceId are ids, not PII/fiscal — safe to name in the message.
  throw new NonRetriableError(
    `invoicexpress: issue job for tenant ${data.tenantId} invoice ${data.invoiceId} ` +
      "is not wired to the invoices data layer yet (Phase 4 follow-up). " +
      "No credentials, no data load — nothing was sent.",
  );
}

/**
 * Run the issue job and translate failures for Inngest:
 *   - InvoiceXpressError with retryable=false → NonRetriableError (stop).
 *   - retryable error (429/5xx/network) → rethrow as-is (Inngest retries).
 * `runner` is injectable so this classification is unit-testable without Inngest.
 */
export async function issueInvoiceWithRetryClassification(
  data: InvoiceIssueRequestedData,
  runner: (d: InvoiceIssueRequestedData) => Promise<IssuedInvoice> = runIssueInvoiceJob,
): Promise<IssuedInvoice> {
  try {
    return await runner(data);
  } catch (err) {
    if (err instanceof InvoiceXpressError && !err.retryable) {
      throw new NonRetriableError(err.message, { cause: err });
    }
    throw err;
  }
}

export const issueInvoiceFn = inngest.createFunction(
  {
    id: "issue-invoice",
    triggers: [{ event: EVENT_INVOICE_ISSUE_REQUESTED }],
    retries: ISSUE_INVOICE_RETRIES,
    // Exactly-once per (tenant, invoice): a duplicated request never issues two
    // fiscal documents for the same internal invoice.
    idempotency: ISSUE_INVOICE_IDEMPOTENCY_KEY,
  },
  async ({ event, step }) => {
    const data = event.data as InvoiceIssueRequestedData;
    const result = await step.run("issue-invoice", () =>
      issueInvoiceWithRetryClassification(data),
    );
    return { invoiceId: data.invoiceId, externalId: result.id, state: result.state };
  },
);

export const functions = [issueInvoiceFn];
