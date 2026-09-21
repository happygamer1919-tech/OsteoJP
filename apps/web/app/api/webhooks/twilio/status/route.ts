import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";

import { sqlStateOf } from "@/lib/observability/sql-state";
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
 * ==========================================================================
 * THE 500 BELOW CLAIMS NO REDELIVERY. WHAT IT IS FOR IS WRITTEN OUT HERE
 * ==========================================================================
 * Twilio's webhook connection overrides
 * (https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides)
 * define the retry behaviour and its DEFAULTS: `rp` (retry policy) defaults to
 * `ct`, which retries on a TCP connect or TLS handshake failure and NOTHING
 * else; `rc` (retry count) defaults to 1, maximum 5; `tt` (total time) defaults
 * to 15000 ms and is capped there, covering every attempt including retries.
 * A 5xx is opted into, as an override appended to the webhook URL in a
 * FRAGMENT. This callback's URL is origin and path only, which
 * `lib/reminders/status-callback.test.ts` asserts. The 500 below is returned
 * because it reports what happened, not because it re-fetches anything.
 *
 * AND IT COSTS NOTHING TO RETURN. Nobody is waiting on this request: no patient
 * is in the loop and nothing goes to a handset either way. The write has
 * already failed by the time this status is chosen, so the choice is only
 * between reporting the failure and reporting a success that did not happen. A
 * 500 puts it on the provider's side of the wire, where the Debugger counts it,
 * rather than swallowing it here.
 *
 * WHETHER TO ASK FOR THE RETRY IS AN OWNER DECISION AND IS OPEN. It is recorded
 * in `docs/QUESTIONS.md`: this URL is built in code
 * (`lib/reminders/status-callback.ts`) rather than clicked into a console, so
 * an override would be a diff; `rp=all` is the value it would need, because
 * `rp=5xx` REPLACES the default rather than adding to it and would give up the
 * connect-failure retries already in force; and the same URL rides on every
 * `messages.create` in this app, so it needs one live send first. See
 * Q-COMMS-02-1. Note also that Twilio omits the fragment when it computes the
 * signature, so `signedRequestUrl(STATUS_CALLBACK_PATH)` below would be
 * unaffected either way.
 *
 * There is NO fallback URL for this webhook kind. `SmsFallbackUrl` is scoped to
 * "retrieving or executing the TwiML from `sms_url`"
 * (https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource),
 * which a status callback is not, and the Message resource
 * (https://www.twilio.com/docs/messaging/api/message-resource) defines no
 * counterpart.
 *
 * ==========================================================================
 * A 200 IS RETURNED FOR AN UNKNOWN SID, AND ONLY FOR THAT
 * ==========================================================================
 * A MessageSid we have no row for is not an error a second attempt can fix — it
 * is a message sent before this table existed, or from another system — so it
 * is answered 200 whatever the retry policy says.
 *
 * A FAILURE TO LOOK THE TENANT UP, OR TO WRITE, IS THE OPPOSITE CASE AND GETS A
 * 500. That write is the only thing this route does, so answering 200 for one
 * that did not happen spends the single signal there is: the row's
 * `provider_status` stays NULL, `reminder-log-core.ts:188-196` keeps rendering
 * it as the neutral "handed over", and `isFailure` (:209-214) keeps it out of
 * the failures filter for ever. The UPDATE is matched on tenant + provider id
 * and only ever WIDENS what is known, so a redelivery re-runs it to the same
 * state and costs nothing but the round trip. NOBODY IS WAITING ON THIS ONE:
 * no patient is in the loop and nothing goes to a handset either way, which is
 * why this webhook refuses where the inbound one acknowledges.
 *
 * NOT THE IFTHENPAY PRECEDENT. `app/api/webhooks/ifthenpay/route.ts:140-142`
 * answers 500 on a failed enqueue "so IfThenPay re-delivers the callback", and
 * that reasoning is about a DIFFERENT VENDOR'S retry behaviour, which does not
 * transfer to this one. The 500 here rests on the paragraph above and on
 * nothing that vendor does.
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
 * The write this callback exists for did not happen, so the callback did not
 * succeed. One helper for both failure points, so they cannot drift apart.
 *
 * IDS ONLY (rule 7). A status payload carries the RECIPIENT'S NUMBER, so
 * `params` never appears here: the sid is a provider id, the status is one of
 * Twilio's own words, and the SQLSTATE is five characters that cannot hold a
 * value. `lib/observability/sql-state.ts` says why the error itself does not.
 *
 * IT REPORTS AS WELL AS LOGS. Nothing in this app forwards console lines to
 * Sentry — `sentry.server.config.ts` only filters the default integrations — so
 * a line here alone reaches nobody. `lib/reminders/inbound-config.ts:124-133`
 * makes the same call for the same reason.
 */
function failed(
  code: string,
  providerMessageId: string,
  tenantId: string | null,
  providerStatus: string,
  cause: unknown,
): NextResponse {
  const sqlstate = sqlStateOf(cause);
  console.error(
    `[reminders/status] ${code} sid=${providerMessageId} ` +
      `tenantId=${tenantId ?? "unresolved"} status=${providerStatus} sqlstate=${sqlstate}`,
  );
  Sentry.captureMessage(`reminders/status: ${code}`, {
    level: "error",
    tags: { route: "reminders.status", code, sqlstate, providerStatus, sid: providerMessageId },
  });
  return refuse(500, code);
}

/**
 * Resolve the tenant that owns this MessageSid, through 0075's SECURITY DEFINER
 * function. Returns null when no dispatch row carries it.
 *
 * NULL MEANS NO ROW, AND ONLY THAT. It does not also mean "the lookup failed":
 * folding the two together makes a database fault indistinguishable from a sid
 * we have never seen and answers both with the 200 that only the second one
 * deserves. A failure throws and the caller refuses.
 *
 * IT RUNS WITHOUT A TENANT CONTEXT ON PURPOSE — it is the call that FINDS the
 * tenant, so it cannot be inside one. The function is SECURITY DEFINER, owned by
 * postgres, granted to `authenticated` alone, and returns exactly one uuid.
 */
async function resolveTenant(providerMessageId: string): Promise<string | null> {
  const rows = await withReminderResolverContext(async (tx) =>
    tx.execute(sql`select public.reminder_dispatch_tenant(${providerMessageId}) as tenant_id`),
  );
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
  const first = list[0] as { tenant_id?: string | null } | undefined;
  return first?.tenant_id ?? null;
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

  let tenantId: string | null;
  try {
    tenantId = await resolveTenant(providerMessageId);
  } catch (e) {
    return failed("tenant_resolution_failed", providerMessageId, null, providerStatus, e);
  }
  if (!tenantId) {
    // Not an error. See the header: a sid with no row predates this table or
    // belongs to another system, and retrying will never make a row appear.
    return ok();
  }

  try {
    await recordProviderStatus({
      tenantId,
      providerMessageId,
      providerStatus,
      // Twilio sends ErrorCode only on a failure, and it is numeric; the column
      // is text because Resend's are not.
      providerErrorCode: params.ErrorCode ? String(params.ErrorCode) : null,
    });
  } catch (e) {
    return failed("status_write_failed", providerMessageId, tenantId, providerStatus, e);
  }

  return ok();
}
