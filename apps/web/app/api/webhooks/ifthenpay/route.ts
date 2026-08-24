import { NextResponse } from "next/server";
import {
  RULES,
  checkDurableRateLimit,
  clientKey,
  createDurableRateLimitStore,
  tooManyRequests,
} from "@osteojp/rate-limit";
import { authenticateCallback } from "@/lib/integrations/ifthenpay/callback";
import {
  IfThenPayCallbackAuthError,
  IfThenPayConfigError,
} from "@/lib/integrations/ifthenpay/errors";
import {
  inngest,
  EVENT_PAYMENT_CALLBACK_RECEIVED,
} from "@/lib/integrations/ifthenpay/inngest/client";
import type { IftCallbackParams } from "@/lib/integrations/ifthenpay/types";

// IfThenPay payment callback webhook.
//
// GET /api/webhooks/ifthenpay
//
// IfThenPay confirms a settlement by calling this URL with query params,
// including the shared ANTI-PHISHING KEY. The handler:
//   1. authenticates the callback (constant-time key check)  -> 401 on mismatch
//      (fail-closed: also 503 when the key is unset/owner-gated)
//   2. emits a PII-free Inngest event for durable, idempotent reconciliation
//   3. acks 200 fast — the ledger write happens in the background job so a slow
//      DB never makes IfThenPay time out and re-deliver.
//
// PII / payment-secrecy (CLAUDE.md #7 + the brief): the anti-phishing key is
// verified then DISCARDED — never logged, never forwarded. The event carries
// ids + the settled amount only (no payer phone/email). Nothing here logs the
// query string.
//
// Session middleware: this PUBLIC path is excluded from the Supabase session
// proxy (apps/web/proxy.ts matcher negative lookahead, alongside `api/inngest`
// and `api/v1/ingestion`) so it is not redirected to /login in deployed envs.
// The anti-phishing check below is the ONLY auth gate — there is no Supabase
// session on this route.
//
// ===========================================================================
// RATE LIMITED SINCE SEC-web-surface-limiter-adoption ROUTE 2.
// ===========================================================================
// THE GATE ON THIS ROUTE IS GUESSABLE AND THE OTHER TWO PUBLIC WEBHOOKS' ARE
// NOT. That is the whole reason this one was taken before them, and the card's
// original ordering had it second. The ingestion and Stripe endpoints verify an
// HMAC OVER THE BODY: forging one needs the secret, and the signature is not
// reachable by guessing at any rate. `safeKeyEqual` here compares a STATIC
// SHARED SECRET for equality. Constant time defeats a timing oracle; it does
// nothing about how many guesses an attacker may make, and until now that was
// bounded by nothing at all.
//
// A successful guess is not a read. It is a FORGED SETTLEMENT — an invoice
// marked paid for money that never arrived, written by the reconciliation job
// this handler enqueues.
//
// THE LIMIT IS TAKEN BEFORE `authenticateCallback`, deliberately, because the
// budget being spent is the GUESS budget. Checking it afterwards would count
// only the guesses that already happened.
//
// DURABLE STORE, NOT THE MEMORY ONE, and that is not the default choice on this
// surface. limiter.ts's own header settles it: "a control an attacker can reset
// by waiting for a cold instance is not a control." A per-instance counter
// against a guessing attack is exactly that. The price is one row written per
// request — see the rule's own note, which states plainly that this limiter
// does not bound its own cost.
//
// 429, NOT A SILENT 401. Unlike the staff login, there is no enumeration oracle
// to protect here: the only caller who should ever see this is IfThenPay, and
// Retry-After tells them when to redeliver. IfThenPay treats any non-200 as a
// redelivery signal, so a throttled real settlement is delayed, never lost.

export const runtime = "nodejs"; // node:crypto (timing-safe compare) + server-only deps
export const dynamic = "force-dynamic"; // signed, per-request; never cached

function paramsFromUrl(url: string): IftCallbackParams {
  const sp = new URL(url).searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;
  return {
    key: get("key"),
    orderId: get("orderId"),
    amount: get("amount"),
    requestId: get("requestId"),
    entity: get("entity"),
    reference: get("reference"),
    payment_datetime: get("payment_datetime"),
    payment_type: get("payment_type"),
  };
}

export async function GET(req: Request): Promise<Response> {
  // Per source, two windows. There is deliberately NO GLOBAL CEILING: one would
  // hand any single attacker a switch that stops real settlements reaching the
  // ledger while IfThenPay carries on taking the money. See the rule.
  const store = createDurableRateLimitStore();
  const perMinute = await checkDurableRateLimit(
    clientKey(req, "ifthenpay_callback"),
    RULES.ifthenpayCallbackIp,
    store,
  );
  if (!perMinute.ok) return tooManyRequests(perMinute);

  const perHour = await checkDurableRateLimit(
    clientKey(req, "ifthenpay_callback_hour"),
    RULES.ifthenpayCallbackIpHour,
    store,
  );
  if (!perHour.ok) return tooManyRequests(perHour);

  const params = paramsFromUrl(req.url);

  let callback;
  try {
    callback = authenticateCallback(params);
  } catch (err) {
    if (err instanceof IfThenPayConfigError) {
      // Anti-phishing key not provisioned (owner-gated) — fail closed.
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    if (err instanceof IfThenPayCallbackAuthError) {
      // Spoofed / malformed. No echo of the received value (no probe oracle).
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  try {
    await inngest.send({
      name: EVENT_PAYMENT_CALLBACK_RECEIVED,
      data: {
        orderId: callback.orderId,
        amountCents: callback.amountCents,
        method: callback.method,
        requestId: callback.requestId,
        paidAt: callback.paidAt,
      },
    });
  } catch {
    // Couldn't enqueue — return 500 so IfThenPay re-delivers the callback.
    return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  }

  // IfThenPay only requires a 200 ack; the reconciliation runs asynchronously.
  return new NextResponse("OK", { status: 200 });
}
