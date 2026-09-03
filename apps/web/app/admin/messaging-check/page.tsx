import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { confirmLinkEnabled, confirmLinkReason } from "@/lib/reminders/confirm-code";
import { resolveOutboundSender, senderLabel } from "@/lib/reminders/sender";
import {
  replyCapabilityReason,
  senderCanReceiveReplies,
} from "@/lib/reminders/reply-capability";
import { adminHelp, adminLabel } from "../admin-ui";
import { sendMessagingCheckAction } from "./actions";

export const metadata = { title: s["admin.messagingCheck.title"] };

// CONFIRM-02 task 2. The owner's own delivery test.
//
// OWNER ONLY, ENFORCED IN TWO PLACES. This route redirects any non-owner, and
// the server action re-checks — a page gate hides a form, it does not protect a
// POST. The action is the endpoint that matters.
//
// It sends ONE real message through the production path, five a day, audited.
// What it proves is what no test can: what a Portuguese handset shows.

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

  const banner =
    m === "sent"
      ? {
          ok: true,
          text:
            `${s["admin.messagingCheck.sent"]} ${len ?? "?"}/160` +
            ` — ${live === "1" ? s["admin.messagingCheck.liveCode"] : s["admin.messagingCheck.sampleCode"]}`,
        }
      : m === "limited"
        ? { ok: false, text: s["admin.messagingCheck.limited"] }
        : m === "invalid_phone"
          ? { ok: false, text: s["admin.messagingCheck.invalidPhone"] }
          : m === "landline"
            ? { ok: false, text: s["admin.messagingCheck.landline"] }
            : m === "no_link"
              ? { ok: false, text: s["admin.messagingCheck.noLink"] }
              : m === "body_refused"
                ? {
                    ok: false,
                    // A REFUSAL, NOT A FAILURE, AND THE SENTENCE SAYS SO. This
                    // is the outcome that used to be a 500 on this page: the
                    // body came to 185 characters and the single-segment rule
                    // refused it. Nothing was sent, nothing was written, and no
                    // code was spent - so "Não foi enviada" would have been the
                    // wrong sentence, implying an attempt that never happened.
                    // The rule's own words follow, with the length, because the
                    // reader of this page is the person who fixes it.
                    text: d
                      ? `${s["admin.messagingCheck.bodyRefused"]} ${d}`
                      : s["admin.messagingCheck.bodyRefused"],
                  }
                : m
                  ? {
                      ok: false,
                      // THE PROVIDER'S REASON, SHOWN. A diagnostic page that says
                      // only "not sent" sends the reader to a dashboard; this one
                      // exists to answer why.
                      text: d ? `${s["admin.messagingCheck.failed"]} ${d}` : s["admin.messagingCheck.failed"],
                    }
                  : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.messagingCheck.title"]}</h2>
      <p className={adminHelp}>{s["admin.messagingCheck.help"]}</p>

      {banner ? (
        <p
          className={
            banner.ok
              ? "rounded border border-brand-teal/40 bg-brand-teal/10 p-3 text-body-sm"
              : "rounded border border-border bg-bg p-3 text-body-sm"
          }
        >
          {banner.text}
        </p>
      ) : null}

      {/* THE ARMING STATE, IN WORDS, because the commonest reason a delivery
          test does nothing is that the capability is off — and the operator who
          armed it is the person reading this page. `confirmLinkReason` names
          which of the two variables is missing and never prints either value. */}
      <p className={adminHelp}>{confirmLinkReason()}</p>

      {/* THE SENDER AND THE REPLY LINE. See the block above the return. */}
      <dl className="rounded border border-border bg-bg p-3 text-body-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-text-primary">
            {s["admin.messagingCheck.senderLabel"]}:
          </dt>
          <dd data-testid="messaging-check-sender" className="text-text-primary">
            {senderLabel()}
          </dd>
        </div>
        <dd data-testid="messaging-check-reply-state" className="mt-2 text-text-secondary">
          {replyArmed
            ? s["admin.messagingCheck.replyArmed"]
            : s["admin.messagingCheck.replyDisarmed"]}{" "}
          {replyCapabilityReason()}
        </dd>
        {senderIsNumber && (
          <dd
            data-testid="messaging-check-sender-warning"
            className="mt-2 font-medium text-error"
          >
            {s["admin.messagingCheck.senderWarning"]}
          </dd>
        )}
      </dl>

      <form action={sendMessagingCheckAction} className="flex max-w-lg flex-col gap-4">
        <label className={adminLabel}>
          {s["admin.messagingCheck.phoneLabel"]}
          <input
            type="tel"
            name="phone"
            required
            placeholder="+351912345678"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
          />
        </label>

        <label className={adminLabel}>
          {s["admin.messagingCheck.appointmentLabel"]}
          <input
            type="text"
            name="appointmentId"
            placeholder="(opcional)"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={!armed}
          className="rounded bg-brand-teal px-4 py-2 font-medium text-text-inverse disabled:opacity-50"
        >
          {s["admin.messagingCheck.send"]}
        </button>
      </form>
    </section>
  );
}
