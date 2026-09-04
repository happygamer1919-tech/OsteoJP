// Email (Resend) + SMS (Twilio) adapters for apps/web.
//
// These are TRANSPORT ONLY. Every gating decision — is the template approved, is
// live send armed, is the provider configured — belongs to the choke point in
// @osteojp/notify, and there is no way to reach `messages.create` or
// `emails.send` except through it. This module supplies the provider calls and
// the env reads; it makes no policy.
//
// Callers pass a `templateId`. An id that is absent from
// notification-registry.ts, or present but approved:false, is refused before any
// SDK is constructed. That is deliberate: adding a body without registering it
// cannot ship it.
//
// No `server-only` here so the adapters stay unit-testable under vitest's node
// env. The SDKs are imported lazily inside the live path, so the suppressed path
// never loads them and fires zero network calls.
//
// PII rule (#7): nothing here logs recipients, subjects, or bodies.

import {
  createNotifier,
  liveSendEnabled as flagEnabled,
  warnNotificationEnv,
  type Channel,
  type SendOutcome,
  type TemplateRegistry,
  type Transport,
} from "@osteojp/notify";
import { INVITE_TEMPLATE, webRegistry } from "./notification-registry";
import { normalizePhonePT } from "@osteojp/notify";
import { statusCallbackParam } from "./status-callback";
import { outboundSenderValue, resolveOutboundSender } from "./sender";

/**
 * Every live-send flag apps/web can arm. BOTH, because either one arms an email
 * send that needs the same vars: staff invites run in a server action
 * (lib/admin/staff.ts -> lib/invites/email.ts -> sendEmail here) and reminders
 * run under Inngest, and both reach the same choke point.
 */
const WEB_LIVE_SEND_FLAGS = ["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"] as const;

// ===========================================================================
// INC-12, 2026-08-18: THIS LINE USED TO THROW HERE, AND IT TOOK /admin/staff
// DOWN WITH IT.
// ===========================================================================
// It was `assertNotificationEnv([...])` at module scope. On 2026-08-18
// REMINDERS_LIVE_SEND=true reached production with REMINDERS_LINK_SECRET
// absent, and the throw happened while this module was still being evaluated -
// so /admin/staff, which imports the invite chain, which imports this file,
// returned an error page. It sends nothing. It was collateral.
//
// The assertion did not go away; it MOVED to createNotifier().dispatch, which
// is the one place that actually sends. Same error, same full list of missing
// names, raised at the send instead of at the import.
//
// WHAT STAYS HERE IS THE DEPLOY-TIME SIGNAL WITHOUT THE DEPLOY-TIME CRASH.
// The boot check's real value was learning at deploy time, in one pass, which
// names were missing - a throw hours later at the first send does not give you
// that. So this logs the same list, loudly, once per process, and returns.
//
// IT IS NOT THE CHECK AND NOTHING RELIES ON IT (PORTAL-REHYDRATE 1.3). The send
// path asks the same question again and refuses. If this line were deleted, the
// only thing lost is the early warning; nothing becomes sendable.
//
// A no-op while every live-send flag is off, so dev, CI and preview builds are
// unaffected - missingNotificationEnv() returns an empty list unless a stream is
// actually live.
warnNotificationEnv("apps/web/lib/reminders/clients", WEB_LIVE_SEND_FLAGS);

export type SendChannel = Channel;

/**
 * Kept structurally identical to the pre-registry shape so callers and the
 * invite module (which imports these types) are unaffected.
 */
export type SendResult = {
  channel: SendChannel;
  /** true when no network call was made (suppressed by any gate). */
  sandbox: boolean;
  /** Provider message id when live; a synthetic marker otherwise. */
  id: string;
};

export type EmailMessage = { to: string; subject: string; body: string };
export type SmsMessage = { to: string; body: string };

/** Back-compat helper: the reminder stream's own flag. */
export function liveSendEnabled(): boolean {
  return flagEnabled("REMINDERS_LIVE_SEND");
}

/**
 * The verified Resend sender. REQUIRED — there is no fallback. The previous
 * default was `reminders@osteojp.pt`, a root-domain address Resend would reject
 * at send time because the verified identity is the `send.osteojp.pt` subdomain.
 * A guaranteed send-time failure that looks healthy at boot is worse than a boot
 * failure, so this throws.
 */
function requiredEmailFrom(templateId?: string): string {
  const name = emailFromVarFor(templateId);
  const from = process.env[name];
  if (!from || from.trim() === "") {
    throw new Error(
      `reminders/email: ${name} is required and has no default. ` +
        "Set it to a verified Resend identity on send.osteojp.pt.",
    );
  }
  return from;
}

/**
 * Which from-address variable this template sends under.
 * LE-reminders-email-from-naming, owner ruling 2026-08-05: SPLIT, not rename.
 *
 * The name `REMINDERS_EMAIL_FROM` had come to power staff invites as well as
 * patient reminders, so the name lied about its scope and the two streams could
 * not have different senders without a second migration of everyone's
 * environment. They are separate variables now.
 *
 * DEFAULTS TO THE REMINDERS SENDER, not to the invites one. Every template in
 * this app except the staff invite is a patient reminder, so an unrecognised id
 * is far more likely to be a new reminder than a new invite — and if the guess
 * is ever wrong the failure is a loud boot/send error naming the missing
 * variable, never a silent send from the wrong identity.
 */
function emailFromVarFor(templateId?: string): string {
  return templateId === INVITE_TEMPLATE.id
    ? "INVITES_EMAIL_FROM"
    : "REMINDERS_EMAIL_FROM";
}

/**
 * The configured sender, or undefined.
 *
 * ==========================================================================
 * IT USED TO BE `TWILIO_SMS_FROM ?? TWILIO_MESSAGING_SERVICE_SID`, AND THE
 * OPERATOR MATTERED. (SR-43)
 * ==========================================================================
 * `??` is NULLISH, so an empty-string `TWILIO_SMS_FROM` was a VALUE: the sender
 * resolved to "", `transportConfigured` answered false, and the send was
 * suppressed as missing_provider_config. reply-capability.ts trimmed the same
 * variable, saw falsy, and answered about the MESSAGING SERVICE instead - a
 * different sender from the one this file would have used. One input, two
 * answers, in the two files that must agree.
 *
 * Both now call `resolveOutboundSender`, where blank is not a sender. Nothing
 * else about the precedence changes: TWILIO_SMS_FROM still wins.
 */
function twilioSender(): string | undefined {
  return outboundSenderValue();
}

/**
 * Which Twilio parameter carries the sender.
 *
 * ==========================================================================
 * A MESSAGING SERVICE SID IS NOT A `From`. IT IS A `MessagingServiceSid`.
 * ==========================================================================
 * Every send in this file went out as `messages.create({ to, from, body })`
 * with `from` set to whatever `twilioSender()` returned - and that fallback
 * returns `TWILIO_MESSAGING_SERVICE_SID` when `TWILIO_SMS_FROM` is unset.
 * `From` takes a phone number, an alphanumeric sender id or a short code;
 * routing through a Messaging Service is a DIFFERENT parameter, and the
 * service is what owns the sender pool, the sticky sender and - the reason
 * this matters now - the inbound webhook that a two-way number replies to.
 *
 * docs/qa/twilio-proof.md asserts the old behaviour "(which Twilio accepts)".
 * That claim was never exercised: the 2026-07-11 delivery proof ran with
 * `TWILIO_SMS_FROM=OsteoJP` set, so the fallback branch has never sent a
 * message. It is untested, not proven, and this makes it correct rather than
 * leaving it to be discovered by a patient who gets nothing.
 *
 * NOTHING CHANGES FOR THE CURRENT PRODUCTION CONFIG. With
 * `TWILIO_SMS_FROM=OsteoJP` this still resolves to `from: "OsteoJP"`,
 * byte-identical to before; twilio-proof.test.ts pins that.
 */
export function twilioSenderParam(
  sender: string,
): { from: string } | { messagingServiceSid: string } {
  // THE CLASSIFICATION IS THE RESOLVER'S, not a second regex here. A `MG`
  // pattern maintained in two files is two patterns, and this is the one place
  // where getting it wrong sends the request under the wrong parameter.
  return resolveOutboundSender({ TWILIO_SMS_FROM: sender }).kind === "messaging_service"
    ? { messagingServiceSid: sender }
    : { from: sender };
}

/** Credential presence only. Never constructs a client, never logs a value. */
function transportConfigured(channel: Channel, templateId?: string): boolean {
  if (channel === "email") {
    // The sender is checked PER STREAM: an invite is configured when the invites
    // sender is set, a reminder when the reminders sender is. Checking a single
    // shared name here would report a stream as configured on the strength of the
    // other stream's variable, and the send would then fail at Resend instead of
    // being suppressed with `missing_provider_config`.
    return !!process.env.RESEND_API_KEY && !!process.env[emailFromVarFor(templateId)];
  }
  return (
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!twilioSender()
  );
}

const providerTransport: Transport = {
  async sendEmail(msg) {
    // Lazy import: only on the live path, never in sandbox/tests.
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    if (error) throw new Error(`reminders/email: Resend send failed (${error.name})`);
    return { id: data?.id ?? "unknown" };
  },
  async sendSms(msg) {
    const { default: twilio } = await import("twilio");
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const result = await client.messages.create({
      to: msg.to,
      ...twilioSenderParam(twilioSender()!),
      // OBS-04: the delivery-status destination travels WITH THE MESSAGE, not
      // as a Messaging Service setting in the console. A console setting is a
      // click nobody can audit - not in the diff, not assertable, and knowable
      // only by logging in and looking. That is the SR-43 shape exactly: the
      // sender was configured somewhere invisible, it was wrong, and every
      // message failed for two days while the system reported nothing.
      //
      // Spread rather than a nullable field: when the origin is unconfigured
      // the parameter is ABSENT, and a missing variable then costs the STATUS
      // and never the MESSAGE.
      ...statusCallbackParam(),
      body: msg.body,
    });
    return { id: result.sid };
  },
};

function toSendResult(o: SendOutcome): SendResult {
  return { channel: o.channel, sandbox: o.sandbox, id: o.id };
}

/**
 * Bind the adapters to a registry. Production uses `webRegistry`; tests inject a
 * fixture so TRANSPORT behaviour (sender resolution, E.164, error propagation)
 * stays testable without approving a real body. The gate is unchanged either
 * way — an injected registry still has to mark a template approved to send.
 */
export function createSender(registry: TemplateRegistry = webRegistry) {
  const notifier = createNotifier({
    registry,
    transport: providerTransport,
    transportConfigured,
    emailFrom: requiredEmailFrom,
    // INC-12: the env assertion the module scope used to run. Required by the
    // type, so a notifier cannot be constructed without declaring its flags.
    envFlags: WEB_LIVE_SEND_FLAGS,
  });

  return {
    async sendEmail(
      msg: EmailMessage & { templateId: string; appointmentId?: string },
    ): Promise<SendResult> {
      return toSendResult(
        await notifier.dispatch({
          templateId: msg.templateId,
          channel: "email",
          to: msg.to,
          subject: msg.subject,
          body: msg.body,
          appointmentId: msg.appointmentId,
        }),
      );
    },
    async sendSms(
      msg: SmsMessage & { templateId: string; appointmentId?: string },
    ): Promise<SendResult> {
      // E.164 guard — nothing may reach messages.create un-normalized (Twilio
      // rejects non-E.164 with 21211). PII rule (#7): the value is never logged.
      const to = normalizePhonePT(msg.to);
      if (!to) {
        console.warn("[reminders] sms skipped (invalid_phone)");
        return { channel: "sms", sandbox: true, id: "skipped:invalid_phone" };
      }
      return toSendResult(
        await notifier.dispatch({
          templateId: msg.templateId,
          channel: "sms",
          to,
          body: msg.body,
          appointmentId: msg.appointmentId,
        }),
      );
    },
  };
}

const defaultSender = createSender();

export const sendEmail = defaultSender.sendEmail;
export const sendSms = defaultSender.sendSms;
