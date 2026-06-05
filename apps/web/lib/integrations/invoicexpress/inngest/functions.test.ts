import { describe, expect, it } from "vitest";
import { NonRetriableError } from "inngest";
import {
  issueInvoiceWithRetryClassification,
  runIssueInvoiceJob,
  issueInvoiceFn,
  ISSUE_INVOICE_RETRIES,
  ISSUE_INVOICE_IDEMPOTENCY_KEY,
} from "./functions";
import {
  InvoiceXpressApiError,
  InvoiceXpressNetworkError,
} from "../errors";
import type { IssuedInvoice } from "../types";

const DATA = { tenantId: "t-1", invoiceId: "inv-1" };

const FAKE_INVOICE: IssuedInvoice = {
  id: 9001,
  sequenceNumber: "FR 2026/1",
  state: "issued",
  totalCents: 6000,
  currency: "EUR",
  date: "2026-06-02",
  permalink: null,
};

describe("retry classification", () => {
  it("returns the result on success", async () => {
    const out = await issueInvoiceWithRetryClassification(DATA, async () => FAKE_INVOICE);
    expect(out).toBe(FAKE_INVOICE);
  });

  it("converts a NON-retryable InvoiceXpressError to NonRetriableError (stop)", async () => {
    const runner = async () => {
      throw new InvoiceXpressApiError(422, "bad fiscal data"); // retryable=false
    };
    const err = await issueInvoiceWithRetryClassification(DATA, runner).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
  });

  it("rethrows a RETRYABLE error unchanged (Inngest will retry)", async () => {
    const original = new InvoiceXpressNetworkError("conn reset"); // retryable=true
    const err = await issueInvoiceWithRetryClassification(DATA, async () => {
      throw original;
    }).catch((e) => e);
    expect(err).toBe(original);
    expect(err).not.toBeInstanceOf(NonRetriableError);
  });

  it("also rethrows a retryable 5xx so Inngest retries", async () => {
    const err = await issueInvoiceWithRetryClassification(DATA, async () => {
      throw new InvoiceXpressApiError(503, "upstream");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(InvoiceXpressApiError);
    expect(err).not.toBeInstanceOf(NonRetriableError);
  });
});

describe("runIssueInvoiceJob (unwired by default)", () => {
  it("fails non-retryably until the invoices data layer is wired (Phase 4 follow-up)", async () => {
    await expect(runIssueInvoiceJob(DATA)).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("issueInvoiceFn config", () => {
  it("is configured with retries + a (tenant, invoice) idempotency key", () => {
    // Guards exactly-once issuance: a duplicated event never issues twice.
    expect(ISSUE_INVOICE_RETRIES).toBe(4);
    expect(ISSUE_INVOICE_IDEMPOTENCY_KEY).toContain("event.data.tenantId");
    expect(ISSUE_INVOICE_IDEMPOTENCY_KEY).toContain("event.data.invoiceId");
    expect(issueInvoiceFn.id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PENDING the owner-provisioned InvoiceXpress sandbox key (gate 1) AND the
// VAT-23% sign-off (gate 2, #107). This is the only test that would touch the
// live sandbox — it stays skipped until both gates clear. Do NOT un-skip it
// without the key in env; the rule is "do not hit the live sandbox".
// ---------------------------------------------------------------------------
describe.skip("sandbox happy-path (pending owner sandbox key + VAT sign-off)", () => {
  it("issues, retrieves, and voids a fatura-recibo against the InvoiceXpress sandbox", async () => {
    // Wiring outline once gates clear:
    //   1. Set INVOICEXPRESS_API_KEY / INVOICEXPRESS_ACCOUNT_NAME to the sandbox.
    //   2. const client = new InvoiceXpressClient();
    //   3. const issued = await issueInvoice(client, OSTEOJP_FISCAL_PROFILE, SAMPLE_ISSUE_INPUT);
    //   4. expect(issued.id).toBeGreaterThan(0);
    //   5. await retrieveInvoice(client, profile, issued.id);
    //   6. await voidInvoice(client, profile, issued.id, "test cleanup");
    expect(true).toBe(true);
  });
});
