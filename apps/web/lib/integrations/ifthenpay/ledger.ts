// IfThenPay integration — the internal-ledger port.
//
// Reconciliation depends on the invoices ledger through THIS interface, not on
// Drizzle directly, so the matching logic stays pure and unit-testable with a
// mock (reconciliation.test.ts) — and so the only `server-only`, DB-touching
// code (ledger-drizzle.ts) is loaded lazily, never pulled into the test graph.
//
// CLAUDE.md alignment:
//   - record to the INTERNAL ledger only; never self-issue a fiscal document;
//   - every write is tenant-scoped (the adapter filters on tenant_id);
//   - payment data never appears in logs (the port deals in cents + ids only).

import type { PaymentMethod } from "./types";

/** The minimal invoice view reconciliation needs, resolved by orderId. */
export type LedgerInvoice = {
  /** invoices.id (== the orderId). */
  invoiceId: string;
  /** Owning tenant — every subsequent write is scoped to this. */
  tenantId: string;
  /** Recorded amount, integer cents. */
  amountCents: number;
  currency: string;
  /** invoices.status — "paid" means a prior callback already settled it. */
  status: "draft" | "issued" | "paid" | "void";
};

/** Fields written when a validated callback settles an invoice. */
export type MarkPaidInput = {
  tenantId: string;
  invoiceId: string;
  method: PaymentMethod;
  /** IfThenPay request id, stored as the payment reference. NON-PII. */
  requestRef: string | null;
  /** Settlement instant; defaults to now in the adapter when null. */
  paidAt: string | null;
};

/**
 * The seam between reconciliation and the database. The production
 * implementation (ledger-drizzle.ts) is tenant-scoped and audited; tests pass a
 * hand-rolled object.
 */
export type PaymentLedgerPort = {
  /** Resolve the invoice an IfThenPay orderId refers to, or null if unknown. */
  findInvoiceByOrderId(orderId: string): Promise<LedgerInvoice | null>;
  /** Mark the invoice paid. MUST be idempotent + tenant-scoped in the WHERE. */
  markInvoicePaid(input: MarkPaidInput): Promise<void>;
};
