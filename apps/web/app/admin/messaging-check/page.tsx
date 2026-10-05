import { redirect } from "next/navigation";
import { RULES } from "@osteojp/rate-limit";
import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { confirmLinkEnabled, confirmLinkReason } from "@/lib/reminders/confirm-code";
import { previewMessagingCheck } from "@/lib/reminders/messaging-check-body";
import { resolveOutboundSender, senderLabel } from "@/lib/reminders/sender";
import {
  replyCapabilityReason,
  senderCanReceiveReplies,
} from "@/lib/reminders/reply-capability";
import { sendMessagingCheckAction } from "./actions";
import { MessagingCheckView } from "./messaging-check-view";
import { messagingCheckOutcome } from "./outcome";

export const metadata = { title: s["admin.messagingCheck.title"] };

// CONFIRM-02 task 2. The owner's own delivery test.
//
// OWNER ONLY, ENFORCED IN TWO PLACES. This route redirects any non-owner, and
// the server action re-checks — a page gate hides a form, it does not protect a
// POST. The action is the endpoint that matters.
//
// It sends ONE real message through the production path, five a day, audited.
// What it proves is what no test can: what a Portuguese handset shows.
//
// THIS FILE ASKS THE QUESTIONS AND `messaging-check-view.tsx` DRAWS THE ANSWERS.
// The gate, the environment reads and the search params are here, because they
// need a request. Everything the owner sees is in the view, which takes plain
// props and can therefore be rendered, in both languages, by a test.

export default async function MessagingCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; len?: string; live?: string; d?: string }>;
}) {
  const actor = await getRequestContext();
  if (!actor) redirect("/login");
  if (actor.role !== "owner") redirect("/dashboard");

  const { m, len, live, d } = await searchParams;
  const armed = confirmLinkEnabled();

  // ==========================================================================
  // THE SENDER AND THE REPLY LINE, IN WORDS, BECAUSE A TWILIO LOG IS NOT A UI.
  // ==========================================================================
  // CONFIRM-08 / SR-43. On 2026-09-02 `TWILIO_SMS_FROM` held an E.164 number
  // Twilio does not own. That ONE variable produced BOTH symptoms: every
  // outbound message failed at the provider, and the reply line armed, because
  // an E.164 sender is exactly the condition the reply gate reads as replyable.
  //
  // It ran for two days. Nothing on any screen in this application said which
  // sender was in play or whether the reply line was on - the only place either
  // fact existed was a Twilio console the operator has to think to open. This
  // page is where somebody looks when messaging is wrong, so both facts belong
  // here, and the SECOND one has to be a sentence rather than a flag, because
  // "armed" is meaningless without "and here is why".
  //
  // NEVER THE WHOLE VALUE. `senderLabel` prints an alphanumeric id in full - it
  // is a brand name every patient already sees - and masks a number to its last
  // four digits, which is enough to tell two candidates apart and not enough to
  // be a contact detail on an admin screen.
  const sender = resolveOutboundSender();
  const replyArmed = senderCanReceiveReplies();
  // The one combination that is always a misconfiguration here: the approved
  // sender is the alphanumeric name, so a NUMBER means somebody set the wrong
  // variable or the wrong value, and it is the shape that cost two days.
  const senderIsNumber = sender.kind === "number";

  // WHAT THE LAST SEND DID, AS A SENTENCE. `outcome.ts` maps every reason the
  // send can refuse with to a string key; a marker it does not know is never
  // printed.
  const outcome = messagingCheckOutcome({ m, len, live, d });

  // THE MESSAGE, BEFORE IT IS SENT, FROM THE SEND'S OWN CODE.
  // `previewMessagingCheck` calls the function `sendMessagingCheck` calls, with
  // a placeholder where the random code goes, so what is shown here is what
  // leaves: same body, same length, same segment count. It sends nothing and
  // writes nothing.
  const preview = previewMessagingCheck();

  return (
    <MessagingCheckView
      s={s}
      action={sendMessagingCheckAction}
      outcome={outcome}
      preview={preview}
      armed={armed}
      // The limit the action enforces, read from the rule it enforces it with,
      // so the number on the screen cannot drift from the number in force.
      attemptLimit={RULES.messagingCheck.limit}
      // NEVER THE WHOLE VALUE: see the block above.
      sender={{ label: senderLabel(), isNumber: senderIsNumber }}
      replyArmed={replyArmed}
      // THE ARMING STATE AND THE REPLY LINE, EACH WITH ITS WHY. `confirmLinkReason`
      // names which of the two variables is missing and `replyCapabilityReason`
      // names the variable and the rule; neither ever prints a value.
      tech={{ confirmLink: confirmLinkReason(), reply: replyCapabilityReason() }}
    />
  );
}
