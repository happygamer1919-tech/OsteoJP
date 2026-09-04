// Inbound-SMS feature flags (W12-11).
//
// ==========================================================================
// ARMING TAKES TWO INDEPENDENT CONDITIONS, AND THE SENDER IS NOT A FLAG.
// ==========================================================================
// SR-47, ruled 2026-09-04:
//
//   > An inbound reply capability may not arm as a side effect of a sender
//   > change. Arming requires two independent conditions, both true, and a
//   > sender that is not E.164 is a hard refusal regardless of flag state.
//
// So this file answers `true` only when BOTH hold:
//
//   1. `REMINDERS_INBOUND` is exactly the string "true" - an operator saying
//      the capability is wanted; and
//   2. the resolved outbound sender is an E.164 NUMBER - a fact about the
//      world saying a reply can physically arrive.
//
// NEITHER IMPLIES THE OTHER, AND THAT IS THE WHOLE POINT. Condition 2 alone
// is the defect SR-47 was ruled on: buying a Portuguese number and setting
// `TWILIO_SMS_FROM` to it is a SENDER change made for outbound reasons, and if
// the inbound webhook armed itself on that change, an unauthenticated route
// that CHANGES APPOINTMENT STATUS would come up because somebody edited a
// variable about sending. Condition 1 alone is what stands today: the flag can
// be "true" against the live alphanumeric sender `OsteoJP`, and no reply can
// ever arrive at a one-way sender id.
//
// ==========================================================================
// THE SECOND CONDITION IS A HARD REFUSAL. NO FLAG OPENS IT.
// ==========================================================================
// This deliberately does NOT ask `senderCanReceiveReplies()`, which is the
// right answer to a DIFFERENT question. That function lets
// `REMINDERS_REPLY_CAPABLE` declare a messaging service replyable, because a
// service's sender pool genuinely cannot be inspected from here and the cost
// of a wrong "no" there is one line of SMS copy. The cost of a wrong "yes"
// HERE is an armed unauthenticated webhook, so the messaging-service case is
// refused too and the declaration cannot reach this decision at all.
//
// ==========================================================================
// A REFUSAL IS REPORTED. A QUIET FALSE IS WHAT LET THIS SIT.
// ==========================================================================
// An operator who has set the flag believes the capability is on. Returning
// `false` and saying nothing is §1.3's shape exactly - the unknown case
// (armed but impossible) rendered as the known one (not armed) - and it is how
// `notification-registry.ts` came to carry a comment asserting the capability
// was live in production while every reader of this function was refusing it.
// So the mismatch is reported once per process, with the sender SHAPE and
// never the sender VALUE (PII rule 7).
//
// ==========================================================================
// WHAT IS STILL TRUE FROM BEFORE
// ==========================================================================
// The inbound reply store and the "resposta por rever" review flag ship behind
// this same flag; the live Twilio inbound webhook is a flag-gated route
// (app/api/webhooks/twilio/inbound/route.ts) that 404s while this is off.
// Outbound live sends remain gated by the separate REMINDERS_LIVE_SEND
// (clients.ts). Read at CALL TIME, so an env flip takes effect without a
// re-import.

import type { EnvSource } from "@osteojp/notify";

import { resolveOutboundSender, type OutboundSender } from "./sender";

/** The env name this module reads. Exported so callers never spell it. */
export const INBOUND_FLAG = "REMINDERS_INBOUND" as const;

/**
 * Whether the inbound-reply capability is armed.
 *
 * Exactly "true" satisfies condition 1 - the same fail-safe rule
 * `REMINDERS_LIVE_SEND` and `REMINDERS_REPLY_CAPABLE` follow, and for the same
 * reason: a typo in a Vercel variable must fail closed, not open.
 *
 * Condition 2 is `resolveOutboundSender(...).kind === "number"`, which is the
 * ONE resolver every sender question in this app asks (SR-43). `kind: "number"`
 * is reachable only from `TWILIO_SMS_FROM` matching E.164 - the
 * messaging-service variable always classifies as `messaging_service`, by its
 * source rather than its shape - so asking the resolver and asking
 * "does TWILIO_SMS_FROM parse as E.164" are the same question. Asking it here
 * rather than restating the regex is the SR-43 lesson: a restated rule is a
 * second rule.
 */
export function remindersInboundEnabled(env: EnvSource = process.env): boolean {
  if (env[INBOUND_FLAG] !== "true") return false;

  const shape = resolveOutboundSender(env).kind;
  if (shape === "number") return true;

  reportArmedFlagRefused(shape);
  return false;
}

/**
 * Latched BEFORE the report is built, so a second caller in the same process
 * cannot slip past an in-flight async import and emit twice.
 *
 * Once per BOOT and not once per request: this fires on every page render and
 * every webhook POST while the misconfiguration stands, and an alert that
 * repeats at request rate is an alert nobody reads.
 */
let refusalReported = false;

/**
 * Say that an operator armed a capability the sender cannot support.
 *
 * SHAPE, NEVER VALUE. `OutboundSender["kind"]` is one of four constants -
 * `alphanumeric`, `messaging_service`, `none`, `number` - and carries nothing
 * about who the sender is. PII rule 7, and the same reason `senderLabel()`
 * exists for screens.
 */
function reportArmedFlagRefused(shape: OutboundSender["kind"]): void {
  if (refusalReported) return;
  refusalReported = true;

  const line =
    `[reminders/inbound] ${INBOUND_FLAG} is "true" but the outbound sender is ` +
    `${shape}, not an E.164 number. The inbound capability stays OFF and every ` +
    `reply is refused (SR-47). Sender shape only; the value is never logged.`;
  console.error(line);

  // Lazily imported inside the branch that needs it, exactly as
  // `lib/auth/context.ts` does: INC-12 is the recorded price of putting
  // something at module scope whose failure is not proportional to what it does.
  void import("@sentry/nextjs")
    .then((Sentry) =>
      Sentry.captureMessage("reminders/inbound: armed flag refused, sender is not E.164", {
        level: "warning",
        tags: {
          capability: "reminders-inbound",
          outcome: "refused-sender-not-e164",
          senderShape: shape,
        },
      }),
    )
    // NOT a swallowing catch. If the report cannot be sent, the failure to
    // report is itself printed - the refusal above has already been logged, so
    // nothing here decides anything, but a silent reporting failure would
    // recreate the quiet-false this whole file exists to end.
    .catch((cause: unknown) => {
      console.error("[reminders/inbound] could not report the refusal to Sentry", cause);
    });
}
