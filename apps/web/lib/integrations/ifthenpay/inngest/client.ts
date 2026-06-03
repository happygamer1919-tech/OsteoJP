import { Inngest } from "inngest";
import type { PaymentMethod } from "../types";

// Inngest client for the IfThenPay integration (SDK v4).
//
// Its own app id — settling payments is an independent concern from reminders
// and from InvoiceXpress issuance, with its own retry/idempotency policy and its
// own serve endpoint (app/api/inngest/ifthenpay/route.ts). Keys are read from
// env by the SDK itself (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY); the local Dev
// Server needs neither. Never hardcode keys here.
//
// PII / payment-secrecy rule (CLAUDE.md #7 + the brief): the event payload is
// emitted ONLY after the webhook has verified the anti-phishing key, and it
// carries IDS + a settled amount ONLY — orderId (invoices.id), requestId, the
// amount in cents, and the method. NO payer phone/email, and NOT the
// anti-phishing key (it is verified at the edge and discarded). The tenant is
// resolved from the invoice row at run time.

export type PaymentCallbackReceivedData = {
  /** Our order id == invoices.id. Drives the tenant-scoped resolution. */
  orderId: string;
  /** Settled amount, integer cents — reconciliation matches it to the invoice. */
  amountCents: number;
  /** Which method settled it. */
  method: PaymentMethod;
  /** IfThenPay request id (correlation), or null. */
  requestId: string | null;
  /** Settlement instant (ISO-8601), or null → adapter defaults to now. */
  paidAt: string | null;
};

export const EVENT_PAYMENT_CALLBACK_RECEIVED =
  "payment/ifthenpay.callback.received" as const;

export const inngest = new Inngest({ id: "osteojp-ifthenpay" });
