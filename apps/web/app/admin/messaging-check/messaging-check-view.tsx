import { GlassPanel } from "@osteojp/ui";
import type { StringKey } from "@osteojp/i18n";

import {
  MESSAGING_CHECK_PREVIEW_CODE,
  type MessagingCheckPreview,
} from "@/lib/reminders/messaging-check-body";
import { adminHelp, adminInput, adminLabel } from "../admin-ui";
import type { MessagingCheckOutcome } from "./outcome";
import { SendButton } from "./send-button.client";

// THE SCREEN, AS A FUNCTION OF WHAT THE PAGE READ.
//
// `page.tsx` is an async server component that reads the request and redirects
// anybody who is not the owner, so it cannot be rendered in a test. Everything
// an owner SEES is here instead, takes plain props, and renders the same from
// a test as from a request. It reads no environment and no request: the page
// asks the questions and hands the answers down.
//
// READING ORDER, WHICH IS ALSO THE TAB ORDER:
//   1. the result of the last send, when there is one
//   2. what the screen is for, in two sentences
//   3. what it does, what it does not, who may use it, what it costs
//   4. the message, exactly as it will be sent
//   5. the form
//   6. the sender in use, and the technical lines for whoever configures it
//
// The strings arrive as a prop so the same component renders in Portuguese and
// in English; the page passes the platform's default locale.

type Strings = Readonly<Record<StringKey, string>>;

/**
 * Fill `{name}` slots in a string.
 *
 * A FUNCTION REPLACEMENT, never a string: `$&` and friends in a replacement
 * string are expanded by String.replace, and a sender label or a page title is
 * data, not a pattern.
 */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export type MessagingCheckViewProps = {
  s: Strings;
  /** The server action. A prop, so this file imports nothing server-only. */
  action: (formData: FormData) => void | Promise<void>;
  outcome: MessagingCheckOutcome;
  /** The body the next send would carry, from the code the send itself runs. */
  preview: MessagingCheckPreview;
  /** Whether the confirm link is armed. The send refuses without it. */
  armed: boolean;
  /** How many attempts the action allows in 24 hours. */
  attemptLimit: number;
  /** The sender, already masked for a screen. Never the raw value. */
  sender: { label: string; isNumber: boolean };
  /** Whether the message asks the patient to reply. */
  replyArmed: boolean;
  /** The two operator sentences, in English, exactly as the code states them. */
  tech: { confirmLink: string; reply: string };
};

const PHONE_ID = "messaging-check-phone";
const PHONE_HELP_ID = "messaging-check-phone-help";
const APPOINTMENT_ID = "messaging-check-appointment";
const APPOINTMENT_HELP_ID = "messaging-check-appointment-help";
const SEND_NOTE_ID = "messaging-check-send-note";

export function MessagingCheckView({
  s,
  action,
  outcome,
  preview,
  armed,
  attemptLimit,
  sender,
  replyArmed,
  tech,
}: MessagingCheckViewProps) {
  return (
    <section className="flex flex-col gap-6">
      {/* The heading and the result share one block, with no gap of their own,
          so the result region takes no room while it is empty. */}
      <div className="flex flex-col">
        <h2 className="text-xl text-v2-text-primary">{s["admin.messagingCheck.title"]}</h2>

        {/* THE RESULT. Always in the DOM, empty until a send answers, so a
            screen reader announces the change instead of meeting a region that
            arrived already filled. `role="status"` is a polite live region. */}
        <div
          data-testid="messaging-check-result"
          data-state={outcome.kind}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {outcome.kind === "sent" ? (
            <Sent s={s} outcome={outcome} preview={preview} senderLabel={sender.label} />
          ) : null}
          {outcome.kind === "refused" ? (
            <div className="mt-4 flex flex-col gap-2 rounded-v2 border border-error bg-error-bg p-4 text-sm text-v2-text-primary">
              {/* The limit sentence carries the number in force; every other
                  sentence has no slot and passes through unchanged. */}
              <p className="font-medium text-error-800">
                {fill(s[outcome.sentence], { limit: attemptLimit })}
              </p>
              {/* A CODE, NEVER THE PROVIDER'S WORDS. Its message holds the
                  number that was typed, so it reaches neither this page nor
                  the address that leads to it; `outcome.ts` lets through only
                  a value shaped like an error code. */}
              {outcome.providerCode ? (
                <p data-testid="messaging-check-provider-code">
                  {fill(s["admin.messagingCheck.providerCodeLine"], {
                    code: outcome.providerCode,
                  })}
                </p>
              ) : null}
              {outcome.connectionCode ? (
                <p data-testid="messaging-check-connection-code">
                  {fill(s["admin.messagingCheck.connectionCodeLine"], {
                    code: outcome.connectionCode,
                  })}
                </p>
              ) : null}
              {outcome.length !== null ? (
                <p>
                  {fill(s["admin.messagingCheck.bodyRefusedLength"], {
                    length: outcome.length,
                    limit: preview.limit,
                  })}
                </p>
              ) : null}
              {outcome.linkNotWithdrawn ? (
                <p data-testid="messaging-check-link-not-withdrawn" className="font-medium">
                  {s["admin.messagingCheck.linkNotWithdrawn"]}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <p data-testid="messaging-check-purpose" className="max-w-3xl text-base text-v2-text-primary">
        {s["admin.messagingCheck.help"]}
      </p>

      <GlassPanel title={s["admin.messagingCheck.factsTitle"]}>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Fact term={s["admin.messagingCheck.doesTitle"]}>
            <p>{s["admin.messagingCheck.doesBody"]}</p>
          </Fact>
          <Fact term={s["admin.messagingCheck.doesNotTitle"]}>
            <p>{s["admin.messagingCheck.doesNotBody"]}</p>
            <p className="font-medium text-v2-text-primary">
              {s["admin.messagingCheck.doesNotCaveat"]}
            </p>
          </Fact>
          <Fact term={s["admin.messagingCheck.whoTitle"]}>
            <p>{s["admin.messagingCheck.whoBody"]}</p>
          </Fact>
          <Fact term={s["admin.messagingCheck.costTitle"]}>
            <p>{fill(s["admin.messagingCheck.costBody"], { limit: attemptLimit })}</p>
          </Fact>
          <Fact term={s["admin.messagingCheck.auditTitle"]}>
            <p>{s["admin.messagingCheck.auditBody"]}</p>
          </Fact>
        </dl>
      </GlassPanel>

      {/* `min-w-0` ON EVERY GRID CHILD. A grid item's minimum width is its
          content's, and `break-words` does not lower that: one long token (a
          confirm link on a long host) would widen the column past a 390 px
          screen and scroll the whole page sideways. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel className="min-w-0" title={s["admin.messagingCheck.previewTitle"]}>
          <Preview s={s} preview={preview} armed={armed} senderLabel={sender.label} />
        </GlassPanel>

        <GlassPanel className="min-w-0" title={s["admin.messagingCheck.formTitle"]}>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={PHONE_ID} className={adminLabel}>
                {s["admin.messagingCheck.phoneLabel"]}
              </label>
              <input
                id={PHONE_ID}
                type="tel"
                name="phone"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder={s["admin.messagingCheck.phonePlaceholder"]}
                aria-describedby={PHONE_HELP_ID}
                className={adminInput}
              />
              <p id={PHONE_HELP_ID} className={adminHelp}>
                {s["admin.messagingCheck.phoneHelp"]}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={APPOINTMENT_ID} className={adminLabel}>
                {s["admin.messagingCheck.appointmentLabel"]}
              </label>
              <input
                id={APPOINTMENT_ID}
                type="text"
                name="appointmentId"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={APPOINTMENT_HELP_ID}
                className={`${adminInput} font-mono`}
              />
              {/* ONE described-by block, two lines: what to do, then what an id
                  costs. The second is the only input on this screen that can
                  touch a real appointment, so it is never a tooltip. */}
              <div id={APPOINTMENT_HELP_ID} className="flex flex-col gap-1">
                <p className="text-xs font-medium text-v2-text-primary">
                  {s["admin.messagingCheck.appointmentHelp"]}
                </p>
                <p className={adminHelp}>
                  {fill(s["admin.messagingCheck.appointmentWarning"], {
                    idLabel: s["appointment.idLabel"],
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div>
                <SendButton
                  label={s["admin.messagingCheck.send"]}
                  sendingLabel={s["admin.messagingCheck.sending"]}
                  disabled={!armed}
                  describedBy={SEND_NOTE_ID}
                />
              </div>
              {/* ONE NOTE, AND IT SAYS WHY THE BUTTON IS WHAT IT IS. Disarmed, a
                  greyed button with no reason is the commonest way this screen
                  reads as broken. */}
              <p
                id={SEND_NOTE_ID}
                data-testid="messaging-check-send-note"
                className={armed ? adminHelp : "text-sm font-medium text-error"}
              >
                {armed
                  ? s["admin.messagingCheck.sendNote"]
                  : s["admin.messagingCheck.disabledNote"]}
              </p>
            </div>
          </form>
        </GlassPanel>
      </div>

      {/* THE SENDER AND THE REPLY LINE, IN WORDS, BECAUSE A TWILIO LOG IS NOT A
          UI. See page.tsx for why both facts live on this screen. */}
      <GlassPanel title={s["admin.messagingCheck.senderLabel"]}>
        <div className="flex flex-col gap-3 text-sm">
          <p
            data-testid="messaging-check-sender"
            className="break-words text-lg font-medium text-v2-text-primary"
          >
            {sender.label}
          </p>
          <p className="text-v2-text-secondary">{s["admin.messagingCheck.senderIntro"]}</p>
          {sender.isNumber ? (
            <p data-testid="messaging-check-sender-warning" className="font-medium text-error">
              {s["admin.messagingCheck.senderWarning"]}
            </p>
          ) : null}
          <p data-testid="messaging-check-reply-state" className="text-v2-text-primary">
            {replyArmed
              ? s["admin.messagingCheck.replyArmed"]
              : s["admin.messagingCheck.replyDisarmed"]}
          </p>
          <p data-testid="messaging-check-link-state" className="text-v2-text-primary">
            {armed
              ? s["admin.messagingCheck.confirmLinkOn"]
              : s["admin.messagingCheck.confirmLinkOff"]}
          </p>

          {/* THE OPERATOR'S LINES. They are the code's own sentences and name
              environment variables, so they are English and they are for
              whoever sets those variables. They sit behind a disclosure, under
              a Portuguese label that says who they are for, instead of in the
              middle of an owner's explanation. Never a value: the functions
              that write them print names and answers only. */}
          <details className="rounded-v2 border border-v2-border bg-v2-surface p-3">
            <summary className="cursor-pointer text-sm font-medium text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
              {s["admin.messagingCheck.techTitle"]}
            </summary>
            <dl className="mt-3 flex flex-col gap-2 text-xs text-v2-text-secondary">
              <TechLine term={s["admin.messagingCheck.techConfirmLink"]} value={tech.confirmLink} />
              <TechLine term={s["admin.messagingCheck.techReply"]} value={tech.reply} />
              {!preview.ok ? (
                <TechLine term={s["admin.messagingCheck.techPreview"]} value={preview.refusal} />
              ) : null}
            </dl>
          </details>
        </div>
      </GlassPanel>
    </section>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm font-semibold text-v2-text-primary">{term}</dt>
      <dd className="flex flex-col gap-1 text-sm text-v2-text-secondary">{children}</dd>
    </div>
  );
}

function TechLine({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-medium text-v2-text-primary">{term}</dt>
      <dd lang="en" className="min-w-0 wrap-anywhere font-mono">
        {value}
      </dd>
    </div>
  );
}

/**
 * The message, before it is sent.
 *
 * THREE ANSWERS, AND EACH IS WHAT THE SEND WOULD DO. Disarmed, the send
 * refuses before it renders anything, so there is no body to show and the
 * panel says so. Refused by the renderer, the send answers `body_refused`, so
 * the panel says nothing would go and why. Otherwise it shows the body.
 */
function Preview({
  s,
  preview,
  armed,
  senderLabel,
}: {
  s: Strings;
  preview: MessagingCheckPreview;
  armed: boolean;
  senderLabel: string;
}) {
  if (!armed) {
    return (
      <p data-testid="messaging-check-preview-none" className="text-sm text-v2-text-secondary">
        {s["admin.messagingCheck.previewDisarmed"]}
      </p>
    );
  }

  if (!preview.ok) {
    const sentence =
      preview.kind === "too_long"
        ? fill(s["admin.messagingCheck.previewTooLong"], {
            length: preview.length ?? "?",
            limit: preview.limit,
          })
        : preview.kind === "not_gsm7"
          ? s["admin.messagingCheck.previewNotGsm7"]
          : s["admin.messagingCheck.previewNoOrigin"];
    return (
      <p data-testid="messaging-check-preview-refused" className="text-sm font-medium text-error">
        {sentence}
      </p>
    );
  }

  return (
    <div data-testid="messaging-check-preview-box" className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-v2-text-secondary">{s["admin.messagingCheck.previewIntro"]}</p>
      <figure className="flex min-w-0 flex-col gap-1">
        <figcaption className={adminHelp}>
          {s["admin.messagingCheck.previewFrom"]}{" "}
          <span className="font-medium text-v2-text-primary">{senderLabel}</span>
        </figcaption>
        {/* `pre-wrap` keeps the message's own line breaks, which are part of
            what is being tested. The smaller type and padding below `sm` are so
            the longest line, the confirm link, fits at 390 px: a line the
            screen wrapped would read as a line break the message does not
            have. `wrap-anywhere` is the floor under that: a link too long to
            fit breaks inside the token, and (unlike `break-words`) it also
            lowers the element's minimum width, so it can never push the page
            wider than the screen. `min-w-0` and `max-w-full` are the same
            promise made to the flex column it sits in. */}
        <pre
          data-testid="messaging-check-preview"
          className="max-w-full min-w-0 whitespace-pre-wrap wrap-anywhere rounded-v2 border border-v2-border bg-v2-surface p-3 font-mono text-xs text-v2-text-primary sm:p-4 sm:text-sm"
        >
          {preview.body}
        </pre>
      </figure>
      <p data-testid="messaging-check-preview-count" className="text-sm font-medium text-v2-text-primary">
        {fill(s["admin.messagingCheck.previewCount"], {
          length: preview.length,
          limit: preview.limit,
          segments: preview.segments,
        })}
      </p>
      <p className={adminHelp}>
        {fill(s["admin.messagingCheck.previewCodeNote"], { code: MESSAGING_CHECK_PREVIEW_CODE })}
      </p>
      <p className={adminHelp}>{s["admin.messagingCheck.previewSampleNote"]}</p>
    </div>
  );
}

/** The sent state: that it went, and what to look for on the handset. */
function Sent({
  s,
  outcome,
  preview,
  senderLabel,
}: {
  s: Strings;
  outcome: Extract<MessagingCheckOutcome, { kind: "sent" }>;
  preview: MessagingCheckPreview;
  senderLabel: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-v2 border border-success bg-success-bg p-4 text-sm text-v2-text-primary">
      <p className="font-medium text-success-700">{s["admin.messagingCheck.sent"]}</p>
      <p>{s["admin.messagingCheck.sentAccepted"]}</p>
      {outcome.length !== null && outcome.segments !== null ? (
        <p>
          {fill(s["admin.messagingCheck.sentLength"], {
            length: outcome.length,
            limit: preview.limit,
            segments: outcome.segments,
          })}
        </p>
      ) : null}
      <p className="font-medium">{s["admin.messagingCheck.sentLookTitle"]}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>{fill(s["admin.messagingCheck.sentLookSender"], { sender: senderLabel })}</li>
        <li>{s["admin.messagingCheck.sentLookBody"]}</li>
        <li data-testid="messaging-check-sent-link">
          {outcome.live
            ? fill(s["admin.messagingCheck.liveCode"], {
                confirm: s["confirm.confirmCta"],
                reschedule: s["confirm.rescheduleCta"],
              })
            : fill(s["admin.messagingCheck.sampleCode"], { page: s["reschedule.invalidTitle"] })}
        </li>
      </ul>
    </div>
  );
}
