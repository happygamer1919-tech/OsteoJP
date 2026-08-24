import { NextResponse } from "next/server";
import {
  RULES,
  checkRateLimit,
  clientKey,
  tooManyRequests,
} from "@osteojp/rate-limit";
import { constructEvent } from "@/lib/integrations/stripe/webhook";
import { referenceFromMetadata } from "@/lib/integrations/stripe/mapper";
import {
  inngest,
  EVENT_STRIPE_WEBHOOK_RECEIVED,
} from "@/lib/integrations/stripe/inngest/client";
import { StripeError } from "@/lib/integrations/stripe/errors";
import type { SxPaymentIntent } from "@/lib/integrations/stripe/types";

// Stripe webhook receiver.
//
// POST /api/v1/integrations/stripe/webhook
//
// Server-to-server, authenticated by the Stripe signature over the RAW body
// (see lib/integrations/stripe/webhook.ts) — NOT by a Supabase session. The
// handler:
//   1. verifies the signature + timestamp window           -> 400 on any failure
//   2. resolves tenant_id + invoice_id from the VERIFIED metadata
//   3. enqueues an Inngest event carrying IDS ONLY; the durable, idempotent
//      record-stripe-payment function re-fetches authoritative state and writes
//      the invoices ledger (with retries).
//
// Payment data (amount, status) is deliberately NOT forwarded — it is re-fetched
// inside the job from Stripe, so it never lands in logs, URLs, or Inngest's
// event store (CLAUDE.md #7 + task constraints).
//
// NO LIVE CALLS by default: STRIPE_WEBHOOK_SECRET is owner-gated and unset, so
// constructEvent() throws StripeConfigError before any verification — surfaced
// as a generic 500 (operator misconfiguration), never as an accepted event.
//
// Session middleware: `/api/v1/integrations/stripe/webhook` is excluded from
// the Supabase session proxy (apps/web/proxy.ts matcher negative lookahead),
// same as /api/v1/ingestion, so the signature check above is the only auth gate.
//
// ===========================================================================
// RATE LIMITED SINCE SEC-web-surface-limiter-adoption ROUTE 4.
// ===========================================================================
// SAME SHAPE AND SAME HONEST LIMIT AS THE INGESTION ROUTE, which is why the
// two shipped together. The gate is a Stripe signature over the raw body: an
// attacker without STRIPE_WEBHOOK_SECRET cannot produce one at any rate, so no
// number in RULES changes what is reachable. The limit bounds COST only - the
// body read and the signature computation an unauthenticated caller can force.
//
// FIRST STATEMENT IN THE HANDLER, ABOVE `req.text()`, so a source over budget
// cannot make us read a body at all.
//
// MEMORY STORE, NOT DURABLE: a Postgres upsert in front of a microsecond
// signature check would cost more than the thing it protects. Route 2 pays
// that price because its subject is a guess budget; there is none here. Coarse
// per-instance throttling, not a cap.
//
// A REFUSAL IS SAFE FOR STRIPE AND THAT IS NOT LUCK. Stripe redelivers on any
// non-2xx with backoff, and the enqueue below is already idempotent on the
// event id, so a throttled real event is DELAYED, never lost or double-counted.

export const runtime = "nodejs"; // node:crypto for signature verification
export const dynamic = "force-dynamic"; // signed, per-request; never cached

// Events we record to the ledger. Others are acknowledged (200) and ignored, so
// Stripe stops retrying them — but we never act on an event type we don't model.
const HANDLED_EVENTS = new Set<string>([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
]);

export async function POST(req: Request): Promise<Response> {
  // ABOVE the body read, deliberately: see the header.
  const verdict = checkRateLimit(
    clientKey(req, "stripe_webhook"),
    RULES.stripeWebhookIp,
  );
  if (!verdict.ok) return tooManyRequests(verdict);

  // Raw bytes first — the signature is over exactly what was sent, pre-parse.
  const rawBody = await req.text();

  let event: ReturnType<typeof constructEvent>;
  try {
    event = constructEvent(rawBody, req.headers);
  } catch (err) {
    if (err instanceof StripeError && err.name === "StripeSignatureError") {
      // Bad/missing/stale signature → reject. Never echo which check failed.
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    // Unset secret / unexpected: operator misconfiguration, no PII to leak.
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Acknowledge unhandled types so Stripe stops retrying; take no action.
  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }

  // The resource that changed. For our handled types it carries (or references)
  // a PaymentIntent with our metadata. We resolve the internal reference from
  // the VERIFIED payload only.
  const obj = event.data.object as SxPaymentIntent;
  const paymentIntentId =
    typeof obj.id === "string" && obj.id.startsWith("pi_") ? obj.id : undefined;
  const reference = referenceFromMetadata(obj.metadata);

  if (!paymentIntentId || !reference) {
    // A verified event without our reference is not ours to record. Acknowledge
    // so Stripe stops retrying; do not enqueue a job that can't be attributed.
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }

  try {
    await inngest.send({
      name: EVENT_STRIPE_WEBHOOK_RECEIVED,
      data: {
        eventId: event.id,
        eventType: event.type,
        paymentIntentId,
        tenantId: reference.tenantId,
        invoiceId: reference.invoiceId,
      },
    });
  } catch {
    // Enqueue failed → 500 so Stripe redelivers; idempotency keys the event id.
    return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true }, { status: 200 });
}
