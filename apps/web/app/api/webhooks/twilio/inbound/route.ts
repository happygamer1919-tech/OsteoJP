import { NextResponse } from "next/server";

import { remindersInboundEnabled } from "@/lib/reminders/inbound-config";

// STUB inbound Twilio webhook (W12-11). This is NOT a live endpoint.
//
// The real inbound flow (SPEC §4.4) — X-Twilio-Signature HMAC validation,
// tenant-from-recipient-number + appointment correlation (NEVER trusting the
// request payload for tenant), keyword parsing via inbound-classify.ts, an
// idempotent confirmation_state/status flip, STOP/opt-out, per-sender rate
// limiting, and no-PII logging — all depend on the inbound-store migration
// (sms_inbound_events + opt-out), which is DEFERRED to the end of the migration
// relay. No Twilio number is registered to call this route, the path is NOT
// added to the session-proxy public allow-list, and REMINDERS_INBOUND is OFF by
// default. So this handler intentionally performs NO live processing:
//
//   - flag OFF (default): behave as if the route does not exist (404).
//   - flag ON:            fail closed (501) — the live path is not wired yet.
//
// The pure classifier (inbound-classify.ts) and the reception review UI are
// built and tested independently; this route is the documented shape that the
// deferred, owner-merged live handler will replace.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  if (!remindersInboundEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
