import { NextResponse } from "next/server";
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
// TODO(hardening-lane): this PUBLIC path must be excluded from the Supabase
// session proxy or it is redirected to /login in deployed envs. The matcher
// lives in apps/web/proxy.ts (owned by the hardening lane) — add
// `api/webhooks/ifthenpay` to the negative lookahead, alongside `api/inngest`
// and `api/v1/ingestion`. Do NOT edit that file from this stream. Until then the
// route works against local dev but is intercepted when deployed. The
// anti-phishing check below is the ONLY auth gate (no Supabase session).

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
