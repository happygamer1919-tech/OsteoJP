import { NextResponse, type NextRequest } from "next/server";

import { normalizePhonePT } from "@osteojp/notify";

import { sendSms } from "@/lib/reminders/clients";
import { remindersInboundEnabled } from "@/lib/reminders/inbound-config";
import { applyInboundReply } from "@/lib/reminders/inbound-reply";
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
// ARMED BY TWO THINGS AND NEITHER IS SET HERE:
//   REMINDERS_INBOUND=true                the capability flag (404 while off)
//   REMINDERS_INBOUND_TENANT_ID=<uuid>    whose clinic this Twilio number is
// plus REMINDERS_INBOUND_BASE_URL for the signed URL and the existing
// TWILIO_AUTH_TOKEN for the signature. Missing any of them refuses the
// request; none of them is defaulted.
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

/** Twilio treats any non-2xx as a delivery failure and retries. */
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

export async function POST(request: NextRequest): Promise<Response> {
  if (!remindersInboundEnabled()) {
    // Behave as if the route does not exist while the capability is off.
    return refuse(404, "not_found");
  }

  const tenantId = process.env.REMINDERS_INBOUND_TENANT_ID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!tenantId || !authToken) {
    // FAIL CLOSED AND LOUD. An armed capability with no tenant or no token
    // cannot verify anything, and a 200 here would tell Twilio the reply was
    // handled while it was silently discarded.
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

  const result = await applyInboundReply({
    tenantId,
    fromPhone,
    body,
    now: new Date(),
  });

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
  // BEST EFFORT, AND AFTER THE TRANSITION. The appointment has already moved
  // and the audit row is already written; a failure to file the working copy
  // must not turn a handled reply into a 500 that makes Twilio redeliver it
  // and take the same decision again.
  const normalizedFrom = normalizePhonePT(fromPhone);
  try {
    await recordInboundReply({
      tenantId,
      providerMessageSid: params.MessageSid ?? `no-sid:${crypto.randomUUID()}`,
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
    console.error(
      "[reminders/inbound] failed to file the reply for reception:",
      e instanceof Error ? e.name : "unknown",
    );
  }

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
    // Suppressed as `template_unapproved` until JP approves these three
    // bodies. The call is made anyway so the refusal is recorded in the
    // suppression log rather than the capability being quietly absent.
    await sendSms({ to, body: copy[DEFAULT_LOCALE], templateId });
  }

  // ALWAYS 200 ONCE THE SIGNATURE PASSED. A reply that changed nothing is a
  // handled reply, not a failure: returning non-2xx would make Twilio redeliver
  // it, and the second delivery would take the same decision again.
  return ack();
}
