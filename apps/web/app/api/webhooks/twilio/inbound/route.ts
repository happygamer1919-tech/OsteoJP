import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { normalizePhonePT } from "@osteojp/notify";

import { sqlStateOf } from "@/lib/observability/sql-state";
import { sendSms } from "@/lib/reminders/clients";
import { remindersInboundEnabled } from "@/lib/reminders/inbound-config";
import { applyInboundReply, type InboundReplyResult } from "@/lib/reminders/inbound-reply";
import { signedRequestUrl, verifyTwilioSignature } from "@/lib/reminders/inbound-signature";
import { recordInboundReply } from "@/lib/reminders/inbound-store";
import {
  REPLY_ACK_CANCELLED,
  REPLY_ACK_CONFIRMED,
  REPLY_ACK_REVIEW,
  REPLY_ACK_TEMPLATE_IDS,
} from "@/lib/reminders/reminder-copy";
import { DEFAULT_LOCALE } from "@osteojp/i18n";

// Inbound Twilio SMS webhook — the patient's reply to the 24h reminder.
//
// POST /api/webhooks/twilio/inbound   (application/x-www-form-urlencoded)
//
// It is UNAUTHENTICATED at the session layer: the path is excluded from the
// Supabase session proxy (apps/web/proxy.ts), like the IfThenPay and Stripe
// webhooks. THE X-TWILIO-SIGNATURE CHECK IS THE ONLY GATE, and this route
// changes appointment status, so that check is the difference between a
// reminder reply and a stranger cancelling someone's appointment.
//
// ARMED BY THREE THINGS AND NONE OF THEM IS SET HERE:
//   REMINDERS_INBOUND=true                the capability flag (404 while off)
//   TWILIO_SMS_FROM parses as E.164       a sender a reply can reach at all
//   REMINDERS_INBOUND_TENANT_ID=<uuid>    whose clinic this Twilio number is
// plus REMINDERS_INBOUND_BASE_URL for the signed URL and the existing
// TWILIO_AUTH_TOKEN for the signature. Missing any of them refuses the
// request; none of them is defaulted.
//
// THE FIRST TWO ARE ONE CALL AND TWO INDEPENDENT CONDITIONS (SR-47).
// `remindersInboundEnabled()` is true only when the flag says the capability
// is wanted AND the resolved sender is an E.164 number, because an
// unauthenticated route that changes appointment status must not come up as a
// side effect of somebody editing a variable about SENDING. An alphanumeric
// sender - `OsteoJP`, the live one - is a hard refusal here that no flag
// opens, and the mismatch is reported once per boot rather than returned
// quietly. See lib/reminders/inbound-config.ts.
//
// WHY THE TENANT COMES FROM CONFIGURATION AND NOT FROM THE REQUEST. The
// payload is attacker-controlled, so a tenant taken from it would let a forger
// choose which clinic to act on. The proper mapping is Twilio number -> tenant
// and there is no table for it (that is a migration, and authorship is frozen
// under SR-11). An env var naming the single tenant this number serves is the
// honest interim: explicit, unset-by-default, and impossible to influence from
// outside. When a second tenant gets a number, this becomes a lookup and the
// route's shape does not change.
//
// PII rule (#7): nothing here logs the body, the sender, or a patient name.
// Every database call and every provider call on this path is inside a guard.
// Only a SQLSTATE and a set of ids leave this guard; the error object itself is
// never handed on. See lib/observability/sql-state.ts.
//
// ==========================================================================
// WHAT TWILIO DOES WITH THE STATUS THIS ROUTE RETURNS. READ BEFORE CHANGING ONE
// ==========================================================================
// Webhook connection overrides, Twilio's own documentation
// (https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides),
// define the retry behaviour and its DEFAULTS:
//
//   rp  retry policy   default `ct` - retries on a TCP connect or TLS
//                      handshake failure ONLY. `4xx`, `5xx`, `rt` and `all`
//                      are opt-in values.
//   rc  retry count    default 1, range 0-5.
//   tt  total time     default 15000 ms, MAXIMUM 15000 ms, covering every
//                      attempt including retries.
//
// The overrides are appended to the webhook URL AS A FRAGMENT. This webhook's
// URL is not built in this repository, so its connection overrides are not
// expressible in a diff. The delivery-status callback's URL IS built in code;
// docs/QUESTIONS.md Q-COMMS-02-1 carries the open question for that one.
//
// SO THIS ROUTE DOES NOT RELY ON THE CALLER RE-DELIVERING. The message has
// already been received and billed on Twilio's side; the status this route
// returns decides only whether the reply's TwiML executes.
//
// EVERY PATH PAST THE SIGNATURE CHECK ANSWERS 200 AND REPORTS ITS FAILURES
// THROUGH THE CAPTURE: a refusal would not preserve the reply, and it would
// cost the acknowledgement the patient would otherwise get. The loud half has
// value here - the sid, tenant, outcome and SQLSTATE on the log line, and a
// Sentry capture on every failure - because the reply's text stays retrievable
// from Twilio by sid, so "a recepcao vai confirmar consigo" is a promise the
// clinic can still keep.

export const runtime = "nodejs"; // node:crypto for the HMAC
export const dynamic = "force-dynamic"; // signed, per-request; never cached

/**
 * The classifier verdict as 0069's CHECK spells it. The route does not
 * re-derive it from the body: the outcome already IS the verdict, and a second
 * derivation is a second thing that can disagree with the first.
 */
function classificationOf(result: { outcome: string }): string {
  if (result.outcome === "confirmed") return "confirmada";
  if (result.outcome === "cancelled") return "cancelada";
  return "opt_out";
}

/**
 * A non-2xx. IT CLAIMS NO REDELIVERY - see the header. Every refusal below is
 * a condition no second attempt could fix in any case: the capability is off,
 * the route is unconfigured, or the request is not from Twilio.
 */
function refuse(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

/**
 * An empty 200 with the TwiML content type: "received, nothing to say".
 *
 * THE ACKNOWLEDGEMENT IS NOT SENT IN THIS RESPONSE. Replying in TwiML would
 * bypass @osteojp/notify entirely - no registry, no approval gate, no
 * live-send flag - which is precisely the second send path clients.ts exists
 * to prevent. The ack goes out through `sendSms` like every other body, and is
 * refused as `template_unapproved` until JP approves the wording.
 */
function ack(): Response {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

/**
 * The CLASS of a thrown value, and nothing else from it - the counterpart of
 * `sqlStateOf` for a failure that is not a database error. Only the class is
 * reported; the thrown value's message is never logged. The name comes from the
 * prototype rather than from anything the thrower assigned, and it is bounded
 * to an identifier shape here so this field cannot carry a value either.
 */
function classOf(e: unknown): string {
  const name = (e as { constructor?: { name?: unknown } } | null)?.constructor?.name;
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : "unknown";
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!remindersInboundEnabled()) {
    // Behave as if the route does not exist while the capability is off.
    return refuse(404, "not_found");
  }

  const tenantId = process.env.REMINDERS_INBOUND_TENANT_ID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!tenantId || !authToken) {
    // FAIL CLOSED AND LOUD. An armed capability with no tenant or no token
    // cannot verify anything, so nothing here can be acted on. The refusal does
    // not preserve the reply either, but a 200 would record the delivery as
    // handled and leave no trace anywhere, while this one is reported on the
    // line below.
    console.error(
      "[reminders/inbound] armed but unconfigured: REMINDERS_INBOUND_TENANT_ID and/or " +
        "TWILIO_AUTH_TOKEN are missing. Every inbound reply is being refused. Names only; " +
        "values are never logged.",
    );
    return refuse(503, "not_configured");
  }

  // The body is read ONCE, as text, then parsed. The signature is computed
  // over the parsed params, so reading it twice (once for the signature, once
  // for the values) would risk signing a different string than the one acted
  // on.
  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = v;

  const url = signedRequestUrl(new URL(request.url).pathname + new URL(request.url).search);
  if (!url) {
    console.error(
      "[reminders/inbound] REMINDERS_INBOUND_BASE_URL is not set; the signed URL cannot be " +
        "reconstructed and every request is refused. Set it to the public origin configured " +
        "in the Twilio console.",
    );
    return refuse(503, "not_configured");
  }

  const valid = verifyTwilioSignature({
    authToken,
    url,
    params,
    signature: request.headers.get("x-twilio-signature"),
  });
  if (!valid) {
    // No detail, and no distinction between "absent" and "wrong". Both are the
    // same event to anyone who is not Twilio.
    console.warn("[reminders/inbound] refused: signature verification failed");
    return refuse(403, "forbidden");
  }

  const fromPhone = params.From ?? "";
  const body = params.Body ?? "";
  // ONE READ, TWO FIELDS, USED EVERYWHERE BELOW. Twilio posts `SmsSid` on every
  // inbound SMS alongside `MessageSid`, and the delivery-status route one
  // directory over already reads both (status/route.ts). Reading only the first
  // here would report `sid=absent` on a delivery that did carry an id, and the
  // whole of the mitigation on the classifier-fault path is that the reply
  // stays retrievable from the provider BY SID. It also narrows the minted
  // fallback id below to the deliveries that really carry neither.
  const providerMessageSid = params.MessageSid ?? params.SmsSid;

  // ================================================================== //
  // THE CLASSIFIER RUNS INSIDE A GUARD.
  // ================================================================== //
  // It is a database transaction, so it can throw. Only a SQLSTATE and a set of
  // ids leave this guard; the error object itself is never handed on.
  //
  // IT ANSWERS 200 AND SENDS NOTHING. There is no verdict, so there is no
  // acknowledgement that could be true - a reply that was in fact a STOP must
  // never be answered with an SMS - and a refusal would not preserve the reply
  // (see the header). The capture is the signal.
  let result: InboundReplyResult;
  try {
    result = await applyInboundReply({
      tenantId,
      fromPhone,
      body,
      now: new Date(),
    });
  } catch (e) {
    const sqlstate = sqlStateOf(e);
    console.error(
      `[reminders/inbound] the reply could not be applied: ` +
        `sid=${providerMessageSid ?? "absent"} tenantId=${tenantId} sqlstate=${sqlstate}`,
    );
    Sentry.captureMessage("reminders/inbound: the reply could not be applied", {
      level: "error",
      tags: {
        route: "reminders.inbound",
        outcome: "not_applied",
        sqlstate,
        sid: providerMessageSid ?? "absent",
      },
    });
    return ack();
  }

  // ================================================================== //
  // EVERY REPLY IS FILED, NOT ONLY THE ONES NEEDING REVIEW.
  // ================================================================== //
  // The stub this replaces was called on the review outcome alone, which was
  // right while there was no table: a queue of things to do. With 0069 the row
  // is also the only place the MESSAGE TEXT lives, and "what did the patient
  // actually write" is a question reception asks about a reply that confirmed
  // an appointment just as often as about one that confused the classifier.
  // A confirmed reply is filed already-resolved, so it never enters the queue.
  //
  // BEST EFFORT, FOR EVERY OUTCOME. A failure to file is reported and does not
  // change what this route answers: the refusal that would express it buys no
  // second attempt at the row (see the header), and for `confirmed` and
  // `cancelled` the appointment has already moved and the audit row is already
  // written, so there is nothing a second delivery could put right.
  const normalizedFrom = normalizePhonePT(fromPhone);
  const messageSid = providerMessageSid;
  try {
    await recordInboundReply({
      tenantId,
      // The minted fallback for a delivery carrying neither id. It is fresh per
      // delivery; that and the review-reason timing are unchanged here and
      // tracked separately.
      providerMessageSid: messageSid ?? `no-sid:${crypto.randomUUID()}`,
      // Hashed inside the store; never stored or logged in clear. An
      // unnormalizable sender is filed under its raw form's hash so two
      // messages from the same bad number still group.
      fromPhone: normalizedFrom ?? fromPhone,
      body,
      classification: result.outcome === "review" ? "review" : classificationOf(result),
      reviewReason: result.outcome === "review" ? result.reason : null,
      patientId: result.patientId,
      appointmentId: result.appointmentId,
      resolved: result.outcome !== "review",
    });
  } catch (e) {
    // IDS ONLY (rule 7), AND ENOUGH OF THEM TO ACT ON. A class name on its own
    // does not locate the reply that went missing; the sid does. It is Twilio's
    // own id for the message and the key to retrieving its text from their
    // console; the body, the sender and the patient's name are never here, and
    // the error itself is reduced to a SQLSTATE because its message carries the
    // statement parameters.
    const sqlstate = sqlStateOf(e);
    console.error(
      `[reminders/inbound] failed to file the reply for reception: ` +
        `sid=${messageSid ?? "absent"} tenantId=${tenantId} ` +
        `outcome=${result.outcome} sqlstate=${sqlstate}`,
    );
    // The console is not a report: nothing in this app forwards console lines
    // to Sentry, so the line above reaches nobody on its own. This fires for
    // EVERY outcome, and it is the only signal there is, because the response
    // is a 200 either way.
    Sentry.captureMessage("reminders/inbound: the reply could not be filed for reception", {
      level: "error",
      tags: {
        route: "reminders.inbound",
        outcome: result.outcome,
        sqlstate,
        sid: messageSid ?? "absent",
      },
    });
  }

  // ================================================================== //
  // A REPLY THAT COULD NOT BE FILED IS STILL ANSWERED, AND STILL ACKNOWLEDGED.
  // ================================================================== //
  // The row is the only copy of the text (inbound-store.ts:23-29) and the only
  // thing that puts the reply in front of reception (listReviewQueue,
  // :139-161 - the audit row carries ids only and no staff surface reads it),
  // so a filing failure is a real loss and the capture above exists for it.
  // What a refusal would add is nothing: it does not file the row, it does not
  // ask Twilio for the message again (header), and it subtracts the
  // acknowledgement. The text stays retrievable from Twilio by sid, so "a
  // recepcao vai confirmar consigo" is still true - reception can be told to
  // look - whereas silence tells the patient nothing at all.
  //
  // The sid-less fallback id and the review-reason timing are unchanged and
  // tracked separately.

  // The acknowledgement. A normalized sender is required - the same E.164
  // guard every other send passes through - and an opt-out gets NOTHING back,
  // because answering a STOP with an SMS is the one reply that contradicts the
  // instruction it is answering.
  const to = normalizedFrom;
  if (to && result.outcome !== "opt_out") {
    const [templateId, copy] =
      result.outcome === "confirmed"
        ? [REPLY_ACK_TEMPLATE_IDS.confirmed, REPLY_ACK_CONFIRMED]
        : result.outcome === "cancelled"
          ? [REPLY_ACK_TEMPLATE_IDS.cancelled, REPLY_ACK_CANCELLED]
          : [REPLY_ACK_TEMPLATE_IDS.review, REPLY_ACK_REVIEW];
    // ================================================================== //
    // THIS SENDS. IT DID NOT WHEN THE LINE BELOW WAS WRITTEN.
    // ================================================================== //
    // The comment here used to read "suppressed as `template_unapproved`
    // until JP approves these three bodies", and it was true when written.
    // WF-18 approved all three on 2026-09-01 and notification-registry.ts now
    // carries `approved: true` on every one of them, so the notify gate lets
    // them through and a patient receives an SMS.
    //
    // IT IS CORRECTED RATHER THAN DELETED because of WHEN somebody reads it:
    // this is the paragraph in front of anyone deciding whether arming
    // REMINDERS_INBOUND is safe, and a stale sentence there answers "does
    // anything go out to patients?" with a confident no. That is the SR-43
    // shape - a fact that was true once, believed later, and only checkable
    // by opening something else.
    // ================================================================== //
    // THE SEND IS GUARDED, AND THE FAILURE IS SWALLOWED.
    // ================================================================== //
    // `sendSms` can throw - from the env assertion inside dispatch, or from the
    // provider's client. So this await is guarded like the classifier's above,
    // and what is reported is ids plus the thrown value's CLASS: `classOf`,
    // never its message.
    //
    // SWALLOWED RATHER THAN REFUSED, because everything this route is for has
    // already happened: the reply was decided and the row was filed. A refusal
    // would report the whole delivery as failed although both succeeded, and on
    // a number whose webhook URL was later given a 5xx retry policy it would
    // fetch a second delivery that re-decides an appointment that has moved.
    try {
      await sendSms({ to, body: copy[DEFAULT_LOCALE], templateId });
    } catch (e) {
      console.error(
        `[reminders/inbound] the acknowledgement could not be sent: ` +
          `sid=${messageSid ?? "absent"} tenantId=${tenantId} ` +
          `outcome=${result.outcome} template=${templateId} error=${classOf(e)}`,
      );
      Sentry.captureMessage("reminders/inbound: the acknowledgement could not be sent", {
        level: "error",
        tags: {
          route: "reminders.inbound",
          outcome: result.outcome,
          template: templateId,
          error: classOf(e),
          sid: messageSid ?? "absent",
        },
      });
    }
  }

  // 200 ONCE THE SIGNATURE PASSED. Every path that gets this far answers 200,
  // including the ones that lost something, because a non-2xx buys no second
  // delivery (header) and costs the acknowledgement. What a failure gets is the
  // Sentry capture, on each of the three things that can fail here.
  return ack();
}
