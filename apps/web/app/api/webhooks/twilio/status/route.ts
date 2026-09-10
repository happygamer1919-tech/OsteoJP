import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";

import { recordProviderStatus } from "@/lib/reminders/dispatch-ledger";
import { withReminderResolverContext } from "@/lib/reminders/context";
import { signedRequestUrl, verifyTwilioSignature } from "@/lib/reminders/inbound-signature";
import { STATUS_CALLBACK_PATH } from "@/lib/reminders/status-callback";

/**
 * TWILIO DELIVERY-STATUS WEBHOOK — the destination every reminder SMS has been
 * pointing at since OBS-04, and which did not exist until now.
 *
 * ==========================================================================
 * THE SENDS ALREADY CARRY THIS URL
 * ==========================================================================
 * `clients.ts` spreads `statusCallbackParam()` into every `messages.create`,
 * deliberately per-message rather than as a console setting, because "a console
 * setting is a click nobody can audit". That parameter names
 * `/api/webhooks/twilio/status`. THE ROUTE WAS NEVER BUILT, so for every message
 * sent with `REMINDERS_STATUS_CALLBACK_BASE_URL` configured, Twilio has been
 * POSTing delivery statuses at a 404.
 *
 * ==========================================================================
 * IT TURNS "HANDED TO TWILIO" INTO "TWILIO SAYS DELIVERED"
 * ==========================================================================
 * `reminder_dispatches.provider_status` is NULL until a callback arrives, which
 * is what keeps "handed over and never heard about again" distinguishable from
 * "delivered" (0075's own words). Without this route every row stays in the
 * first state for ever and the distinction is unusable.
 *
 * ==========================================================================
 * THE TENANT COMES FROM A VALUE WE WROTE, NEVER FROM THE PAYLOAD
 * ==========================================================================
 * Ruling 2 of 0075. The inbound webhook takes its tenant from
 * `REMINDERS_INBOUND_TENANT_ID`, which is the honest interim for one clinic and
 * does not survive a second. This route instead resolves the tenant with
 * `reminder_dispatch_tenant(provider_message_id)` — a SECURITY DEFINER function
 * over a column WE populated at send time — so a forged MessageSid resolves to
 * nothing and updates nothing, rather than naming a tenant of its own choosing.
 *
 * ==========================================================================
 * THE SIGNATURE IS THE ONLY GATE, AND IT IS NOT OPTIONAL
 * ==========================================================================
 * Same shape as the inbound route: unauthenticated at the session layer,
 * X-Twilio-Signature verified over the parsed params and the reconstructed
 * signed URL. Missing configuration FAILS CLOSED with 503 and a loud log naming
 * the VARIABLES and never their values (rule 7). Nothing from the body is
 * logged: a status payload carries the recipient's number.
 *
 * A 200 IS RETURNED FOR AN UNKNOWN SID. Twilio retries on a non-2xx, and a
 * MessageSid we have no row for is not an error we can fix by being retried at
 * — it is a message sent before this table existed, or from another system.
 * Refusing it would buy an indefinite retry loop for nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refuse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Twilio wants a 2xx; an empty TwiML document is the cheapest valid one. */
function ok(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

/**
 * Resolve the tenant that owns this MessageSid, through 0075's SECURITY DEFINER
 * function. Returns null when no dispatch row carries it.
 *
 * IT RUNS WITHOUT A TENANT CONTEXT ON PURPOSE — it is the call that FINDS the
 * tenant, so it cannot be inside one. The function is SECURITY DEFINER, owned by
 * postgres, granted to `authenticated` alone, and returns exactly one uuid.
 */
async function resolveTenant(providerMessageId: string): Promise<string | null> {
  try {
    const rows = await withReminderResolverContext(async (tx) =>
      tx.execute(sql`select public.reminder_dispatch_tenant(${providerMessageId}) as tenant_id`),
    );
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    const first = list[0] as { tenant_id?: string | null } | undefined;
    return first?.tenant_id ?? null;
  } catch (e) {
    console.error(
      `[reminders/status] tenant resolution failed: ${e instanceof Error ? e.name : "unknown"}`,
    );
    return null;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error(
      "[reminders/status] TWILIO_AUTH_TOKEN is missing, so no callback can be verified and " +
        "every delivery status is being refused. Names only; values are never logged.",
    );
    return refuse(503, "not_configured");
  }

  // Read ONCE, then parse. The signature is computed over the parsed params, so
  // reading twice would risk signing a different string than the one acted on.
  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = v;

  const url = signedRequestUrl(STATUS_CALLBACK_PATH);
  if (!url) {
    console.error(
      "[reminders/status] REMINDERS_INBOUND_BASE_URL is not set; the signed URL cannot be " +
        "reconstructed and every callback is refused.",
    );
    return refuse(503, "not_configured");
  }

  if (
    !verifyTwilioSignature({
      authToken,
      url,
      params,
      signature: request.headers.get("x-twilio-signature"),
    })
  ) {
    return refuse(403, "bad_signature");
  }

  const providerMessageId = params.MessageSid ?? params.SmsSid;
  const providerStatus = params.MessageStatus ?? params.SmsStatus;
  if (!providerMessageId || !providerStatus) {
    // A SIGNED request missing the two fields the callback is defined to carry
    // is a contract change, not a caller error. Loud, and ids only.
    console.error(
      "[reminders/status] signed callback carried no MessageSid and/or MessageStatus; " +
        "nothing was recorded.",
    );
    return refuse(400, "validation");
  }

  const tenantId = await resolveTenant(providerMessageId);
  if (!tenantId) {
    // Not an error. See the header: a sid with no row predates this table or
    // belongs to another system, and retrying will never make a row appear.
    return ok();
  }

  await recordProviderStatus({
    tenantId,
    providerMessageId,
    providerStatus,
    // Twilio sends ErrorCode only on a failure, and it is numeric; the column is
    // text because Resend's are not.
    providerErrorCode: params.ErrorCode ? String(params.ErrorCode) : null,
  });

  return ok();
}
