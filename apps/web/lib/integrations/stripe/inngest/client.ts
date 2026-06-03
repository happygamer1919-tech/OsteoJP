import { Inngest } from "inngest";

// Inngest client for the Stripe integration (SDK v4).
//
// Its own app id — processing payment webhooks is an independent concern from
// reminders and from InvoiceXpress, with its own retry/idempotency policy and
// its own serve endpoint (app/api/inngest/stripe/route.ts). Keys are read from
// env by the SDK itself (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY); the local Dev
// Server needs neither. Never hardcode keys here.
//
// PII / payment rule (CLAUDE.md #7 + task constraints): event payloads carry
// IDS ONLY — the Stripe event id + type, the PaymentIntent id, and the internal
// tenant + invoice ids resolved from already-verified metadata. NO amount, NO
// email, NO PAN (we never see one). The authoritative amount/status is re-fetched
// from Stripe inside the function at run time, so payment data never lands in
// Inngest's durable event store, logs, or URLs.

export type StripeWebhookReceivedData = {
  /** Stripe event id (evt_…) — idempotency anchor; one event processed once. */
  eventId: string;
  /** Stripe event type, e.g. "payment_intent.succeeded". */
  eventType: string;
  /** The PaymentIntent id (pi_…) the event concerns. Re-fetched authoritatively. */
  paymentIntentId: string;
  /** Internal tenant id, from the verified PaymentIntent metadata. */
  tenantId: string;
  /** Internal invoices.id, from the verified PaymentIntent metadata. */
  invoiceId: string;
};

export const EVENT_STRIPE_WEBHOOK_RECEIVED = "stripe/webhook.received" as const;

export const inngest = new Inngest({ id: "osteojp-stripe" });
