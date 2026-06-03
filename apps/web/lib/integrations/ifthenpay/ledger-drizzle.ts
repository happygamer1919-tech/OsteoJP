import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { auditLog, getDbAdmin, invoices } from "@osteojp/db";
import type { LedgerInvoice, MarkPaidInput, PaymentLedgerPort } from "./ledger";

// IfThenPay integration — production ledger adapter (Drizzle).
//
// The ONLY DB-touching file in this module, hence `server-only`. It is loaded
// LAZILY by the Inngest runner (dynamic import) so it never enters the vitest
// graph — reconciliation is tested against a mock port instead.
//
// Why getDbAdmin (BYPASSRLS) and not withTenantContext: an IfThenPay callback is
// a server-to-server webhook with NO JWT, so there is no tenant claim to set.
// This is exactly the sanctioned use of getDbAdmin per packages/db (a background
// job that scopes tenant_id EXPLICITLY in its WHERE). Every write below carries
// `tenant_id = <resolved>` as defense-in-depth, and the invoice's tenant is
// resolved from its own row first — a callback can only ever settle the one
// invoice its orderId names.
//
// CLAUDE.md #6: marking an invoice paid is a financially-sensitive mutation, so
// it writes an audit_log row in the SAME transaction (system actor — no user;
// metadata is ids + method only, never payer contact or raw amounts).

/** invoices.id is a uuid; reject anything else before hitting the DB. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const drizzleLedgerPort: PaymentLedgerPort = {
  async findInvoiceByOrderId(orderId: string): Promise<LedgerInvoice | null> {
    if (!UUID_RE.test(orderId)) return null;
    const db = getDbAdmin();
    const rows = await db
      .select({
        invoiceId: invoices.id,
        tenantId: invoices.tenantId,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
      })
      .from(invoices)
      .where(eq(invoices.id, orderId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      invoiceId: row.invoiceId,
      tenantId: row.tenantId,
      amountCents: row.amountCents,
      currency: row.currency,
      status: row.status,
    };
  },

  async markInvoicePaid(input: MarkPaidInput): Promise<void> {
    const db = getDbAdmin();
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const paidAtValue = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt;

    await db.transaction(async (tx) => {
      // Idempotent + tenant-scoped: only an unpaid row for THIS tenant flips.
      const updated = await tx
        .update(invoices)
        .set({
          status: "paid",
          paymentProvider: input.method,
          paymentRef: input.requestRef,
          paidAt: paidAtValue,
        })
        .where(
          and(
            eq(invoices.id, input.invoiceId),
            eq(invoices.tenantId, input.tenantId),
            ne(invoices.status, "paid"),
          ),
        )
        .returning({ id: invoices.id });

      // No row changed → already paid or wrong tenant. Don't audit a no-op.
      if (updated.length === 0) return;

      await tx.insert(auditLog).values({
        tenantId: input.tenantId,
        actorUserId: null, // system actor: an IfThenPay webhook, not a user.
        action: "invoice.payment.recorded",
        entityType: "invoice",
        entityId: input.invoiceId,
        // Ids + method only — no payer contact, no raw amount.
        metadata: { provider: "ifthenpay", method: input.method },
      });
    });
  },
};
