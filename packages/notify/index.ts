// @osteojp/notify — the single choke point for outbound patient and staff
// messages, plus the approval registry that gates the copy.
//
// Nothing outside this package may import `twilio` or `resend`. The provider
// adapters live in the apps (they own their env), but they are only ever reached
// through `createNotifier().dispatch`, which enforces, in order: registered +
// approved template, live-send flag exactly "true", REQUIRED ENV PRESENT (this
// one THROWS rather than suppressing - INC-12), provider configured, valid
// recipient.

export { createNotifier } from "./src/gate";
export type { DispatchRequest, Notifier, NotifierOptions } from "./src/gate";

export { buildRegistry, resolveApproved } from "./src/registry";
export type { TemplateEntry, TemplateRegistry } from "./src/registry";

export {
  assertNotificationEnv,
  liveSendEnabled,
  missingNotificationEnv,
  NotificationEnvError,
  REQUIRED_WHEN_LIVE,
  resetNotificationEnvWarnings,
  TWILIO_SENDER_ONE_OF,
  warnNotificationEnv,
} from "./src/env";
export type { EnvSource } from "./src/env";

export { createTestSink } from "./src/sink";
export type { SinkRecord, TestSink } from "./src/sink";

export type {
  Audience,
  Channel,
  EmailPayload,
  LiveSendFlag,
  SendOutcome,
  SmsPayload,
  SuppressionReason,
  Transport,
} from "./src/types";
