// THE choke point. Every outbound message in the platform goes through
// `dispatch()`. Nothing else may construct a Twilio or Resend client.
//
// Gate order, most decisive first. The order matters for the suppression log:
// the reason reported is the FIRST thing that would have stopped the send, so an
// unapproved body reads as `template_unapproved` even when live send is off.
//
//   1. template_unapproved     — not registered, wrong channel, or approved=false.
//                                Fail-closed: an unknown id is treated as
//                                unapproved, so adding a body without registering
//                                it cannot ship it.
//   2. live_send_disabled      — the stream's flag is not exactly "true".
//   3. THE ENV ASSERTION       — armed but required vars missing. THROWS; it is
//                                not a suppression reason. See below.
//   4. missing_provider_config — armed, approved, but the transport says it has
//                                no credentials.
//   5. invalid_recipient       — empty/blank destination.
//
// WHY THE ENV ASSERTION SITS AT 3 AND NOT ANYWHERE ELSE (INC-12, 2026-08-18).
//
// It is AFTER the flag check because a stream that is off requires nothing —
// that is what keeps dev, CI and preview builds working, and it is why arming
// reminders alone never demanded the invites sender.
//
// It is BEFORE `transportConfigured` because that check RETURNS rather than
// throws. Let an armed-but-incomplete config reach it and a broken deploy
// reports `missing_provider_config`, which is the same line a healthy sandbox
// deploy writes. The misconfiguration would then look exactly like the safe
// default state in the logs. That is the silent degradation #763 and #778
// removed from these paths, and putting the assertion one line later would
// reintroduce it.
//
// It THROWS rather than suppressing for the same reason. A suppression is a
// decision that the send should not happen; this is a statement that the send
// CANNOT happen and somebody must fix the environment.
//
// The approval gate sits INSIDE this function rather than beside it, so it holds
// even when live send is armed. There is no code path that consults the flag
// without also consulting the registry.
//
// PII rule (#7): the suppression log carries template id, channel, appointment
// id, and reason. Never a recipient, a subject, a body, or any credential.

import { assertNotificationEnv, liveSendEnabled } from "./env";
import { resolveApproved, type TemplateRegistry } from "./registry";
import type { Channel, SendOutcome, SuppressionReason, Transport } from "./types";

export type DispatchRequest = {
  templateId: string;
  channel: Channel;
  /** E.164 phone or email address, already normalized by the caller. */
  to: string;
  /** Required for email, ignored for SMS. */
  subject?: string;
  body: string;
  /** Correlation id for the log line. Ids are not PII. */
  appointmentId?: string;
};

export type Notifier = {
  dispatch(req: DispatchRequest): Promise<SendOutcome>;
};

export type NotifierOptions = {
  registry: TemplateRegistry;
  transport: Transport;
  /**
   * Every live-send flag this app can arm. REQUIRED, and required on purpose.
   *
   * INC-12 moved the env assertion out of module scope and into `dispatch`. If
   * this were optional, an app that forgot it would build, boot, pass its tests
   * and send with NO env check at all — a hole that announces itself nowhere,
   * because everything downstream carries on reporting something reasonable.
   * Making it mandatory turns "did you remember the guard" into a TYPE ERROR at
   * the one place a notifier is constructed.
   *
   * apps/web passes both flags (reminders and invites are both email streams
   * through this gate); apps/api passes REMINDERS_LIVE_SEND alone, because it
   * has no invite path and a global requirement would demand a variable it can
   * never use.
   */
  envFlags: readonly string[];
  /**
   * Reports whether the transport actually has credentials. Kept separate from
   * `transport` so the gate can report `missing_provider_config` WITHOUT
   * constructing a provider client.
   */
  transportConfigured: (channel: Channel, templateId?: string) => boolean;
  env?: Record<string, string | undefined>;
  /** Injectable for tests; defaults to console. */
  logger?: Pick<Console, "info" | "error">;
  /**
   * Resolved from-address for email. Called only on the live path.
   *
   * TAKES THE TEMPLATE ID because one app can have more than one sender. The
   * staff-invite stream and the patient-reminder stream now use different
   * from-addresses (LE-reminders-email-from-naming, owner ruling 2026-08-05:
   * split, not rename), and they share this choke point deliberately — a second
   * send path would be a second place for a live send to escape the gate. The
   * argument is optional to callers that only ever have one sender.
   */
  emailFrom?: (templateId: string) => string;
};

function suppressed(
  req: DispatchRequest,
  reason: SuppressionReason,
  logger: Pick<Console, "info" | "error">,
): SendOutcome {
  // One structured line per suppressed send. Stable key=value shape so it is
  // greppable in Vercel logs and parseable without a log pipeline.
  const line =
    `[notify] suppressed template=${req.templateId} channel=${req.channel} ` +
    `appointment=${req.appointmentId ?? "-"} reason=${reason}`;
  // An unapproved or unregistered body reaching dispatch is a build-time mistake
  // that shipped, so it is louder than the routine sandbox path.
  if (reason === "template_unapproved") logger.error(line);
  else logger.info(line);
  return {
    sent: false,
    sandbox: true,
    reason,
    templateId: req.templateId,
    channel: req.channel,
    id: `sandbox:${req.channel}`,
  };
}

export function createNotifier(opts: NotifierOptions): Notifier {
  const env = opts.env ?? process.env;
  const logger = opts.logger ?? console;

  return {
    async dispatch(req: DispatchRequest): Promise<SendOutcome> {
      const entry = resolveApproved(opts.registry, req.templateId, req.channel);
      if (!entry) return suppressed(req, "template_unapproved", logger);

      if (!liveSendEnabled(entry.liveSendFlag, env)) {
        return suppressed(req, "live_send_disabled", logger);
      }

      // Armed and approved: the environment must now be complete. Throws
      // NotificationEnvError naming every missing var at once. See the header.
      assertNotificationEnv(opts.envFlags, env);

      if (!opts.transportConfigured(req.channel, req.templateId)) {
        return suppressed(req, "missing_provider_config", logger);
      }

      if (req.to.trim() === "") {
        return suppressed(req, "invalid_recipient", logger);
      }

      const result =
        req.channel === "sms"
          ? await opts.transport.sendSms({ to: req.to, body: req.body })
          : await opts.transport.sendEmail({
              to: req.to,
              from: opts.emailFrom?.(req.templateId) ?? "",
              subject: req.subject ?? "",
              body: req.body,
            });

      return {
        sent: true,
        sandbox: false,
        templateId: req.templateId,
        channel: req.channel,
        id: result.id,
      };
    },
  };
}
