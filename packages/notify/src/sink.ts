// In-memory transport for tests. Records what WOULD have been sent and never
// touches the network. This is the only transport any test may use — the
// provider adapters are never constructed under vitest.

import type { EmailPayload, SmsPayload, Transport } from "./types";

export type SinkRecord =
  | ({ channel: "email" } & EmailPayload)
  | ({ channel: "sms" } & SmsPayload);

export type TestSink = Transport & {
  readonly records: readonly SinkRecord[];
  reset(): void;
};

export function createTestSink(): TestSink {
  const records: SinkRecord[] = [];
  let seq = 0;
  return {
    records,
    reset() {
      records.length = 0;
      seq = 0;
    },
    async sendEmail(msg: EmailPayload) {
      records.push({ channel: "email", ...msg });
      return { id: `sink:email:${++seq}` };
    },
    async sendSms(msg: SmsPayload) {
      records.push({ channel: "sms", ...msg });
      return { id: `sink:sms:${++seq}` };
    },
  };
}
