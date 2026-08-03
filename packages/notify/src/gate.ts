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
//   3. missing_provider_config — armed, approved, but the transport says it has
//                                no credentials.
//   4. invalid_recipient       — empty/blank destination.
//
// The approval gate sits INSIDE this function rather than beside it, so it holds
// even when live send is armed. There is no code path that consults the flag
// without also consulting the registry.
//
// PII rule (#7): the suppression log carries template id, channel, appointment
// id, and reason. Never a recipient, a subject, a body, or any credential.

import { liveSendEnabled } from "./env";
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
   * Reports whether the transport actually has credentials. Kept separate from
   * `transport` so the gate can report `missing_provider_config` WITHOUT
   * constructing a provider client.
   */
  transportConfigured: (channel: Channel) => boolean;
  env?: Record<string, string | undefined>;
  /** Injectable for tests; defaults to console. */
  logger?: Pick<Console, "info" | "error">;
  /** Resolved from-address for email. Called only on the live path. */
  emailFrom?: () => string;
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

      if (!opts.transportConfigured(req.channel)) {
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
              from: opts.emailFrom?.() ?? "",
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
