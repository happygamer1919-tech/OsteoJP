import { Inngest } from "inngest";

// Inngest client for the InvoiceXpress integration (SDK v4).
//
// Its own app id — issuing fiscal documents is an independent concern from
// reminders, with its own retry/idempotency policy and its own serve endpoint
// (app/api/inngest/invoicexpress/route.ts). Keys are read from env by the SDK
// itself (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY); the local Dev Server needs
// neither. Never hardcode keys here.
//
// PII / fiscal rule (CLAUDE.md #7): event payloads carry IDS ONLY — tenant id +
// the internal invoices.id. The fiscal data (NIF, patient name, amounts) is
// loaded from the tenant-scoped data layer at run time inside the function, so
// it never lands in Inngest's durable event store.

export type InvoiceIssueRequestedData = {
  /** Tenant the invoice belongs to. Drives the tenant-scoped data load. */
  tenantId: string;
  /** Internal invoices.id (uuid) — NOT the InvoiceXpress id. Ids only, no PII. */
  invoiceId: string;
};

export const EVENT_INVOICE_ISSUE_REQUESTED = "invoice/issue.requested" as const;

export const inngest = new Inngest({ id: "osteojp-invoicexpress" });
