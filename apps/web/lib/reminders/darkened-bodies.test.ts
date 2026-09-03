/**
 * darkened-bodies.test.ts — the four bodies the owner darkened on 2026-09-04.
 *
 * INC-followup-ignores-a-future-booking. Owner ruling B: `approved: false` on
 * `follow_up.email`, `follow_up.sms`, `no_show.email` and `no_show.sms`, with no
 * new flag and no change to `REMINDERS_LIVE_SEND`.
 *
 * ==========================================================================
 * WHY THE ASSERTION IS "WRITES NOTHING" AND NOT "IS UNAPPROVED"
 * ==========================================================================
 * Reading `approved: false` back out of the registry proves the literal and
 * nothing else. What the owner actually bought is that a send under these four
 * ids REACHES NO PROVIDER, and that is a property of the GATE - so it is tested
 * through `createNotifier` with a transport that records every call, and the
 * assertion is that the recorder is empty.
 *
 * THE NEGATIVE ARM IS THE POINT OF THE FILE. Every case below is re-run against
 * a registry identical in every respect except `approved: true`, and each one
 * must FAIL to be refused - the transport is called, the outcome is `sent`. A
 * test that only ever sees the closed arm cannot tell a working gate from a
 * broken transport, which is the shape PORTAL-REHYDRATE 1.3 warns about: the
 * screen reports something reasonable either way.
 */
import { describe, expect, it } from "vitest";

import { buildRegistry, createNotifier, type TemplateEntry } from "@osteojp/notify";

// WEB_TEMPLATES is the ARRAY; `webRegistry` is the Map built from it. The
// negative arm needs the array so it can rebuild a registry that differs in
// exactly four entries.
import { WEB_TEMPLATES, webRegistry } from "./notification-registry";

/** The four ids the ruling names. */
const DARKENED = [
  { id: "follow_up.email", channel: "email" as const },
  { id: "follow_up.sms", channel: "sms" as const },
  { id: "no_show.email", channel: "email" as const },
  { id: "no_show.sms", channel: "sms" as const },
];

/** Ids that must be UNAFFECTED: the ruling darkens four bodies, not the stream. */
const STILL_ARMED = [
  { id: "reminder.24h.sms", channel: "sms" as const },
  { id: "confirmation.sms", channel: "sms" as const },
  { id: "confirmation.email", channel: "email" as const },
];

/** A transport that records instead of sending, so "writes nothing" is checkable. */
function recordingTransport() {
  const calls: Array<{ channel: string; to: string }> = [];
  return {
    calls,
    transport: {
      async sendSms(msg: { to: string; body: string }) {
        calls.push({ channel: "sms", to: msg.to });
        return { id: "SM_should_not_happen" };
      },
      async sendEmail(msg: { to: string; from: string; subject: string; body: string }) {
        calls.push({ channel: "email", to: msg.to });
        return { id: "em_should_not_happen" };
      },
    },
  };
}

/**
 * A notifier over the given registry, with everything downstream of the
 * approval check ARMED - the live-send flag on, the transport configured, a
 * real recipient. So the only thing that can refuse a send is approval, and a
 * refusal therefore means approval refused it.
 */
function armedNotifier(registry: ReturnType<typeof buildRegistry>) {
  const rec = recordingTransport();
  const notifier = createNotifier({
    registry,
    transport: rec.transport,
    transportConfigured: () => true,
    emailFrom: () => "reminders@send.osteojp.pt",
    envFlags: ["REMINDERS_LIVE_SEND"],
    // A COMPLETE armed environment, because `assertNotificationEnv` throws when
    // a live flag is on and any required name is blank - and a throw is not a
    // refusal. These are placeholder VALUES for names the package requires; no
    // real credential appears here or is read from one (standing rule 3), and
    // nothing in this file reaches a network.
    env: {
      REMINDERS_LIVE_SEND: "true",
      RESEND_API_KEY: "test-not-a-key",
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "test-not-a-token",
      REMINDERS_RESCHEDULE_BASE_URL: "https://app.example.test",
      REMINDERS_LINK_SECRET: "test-not-a-secret",
      TWILIO_SMS_FROM: "OsteoJP",
      TWILIO_MESSAGING_SERVICE_SID: "MGtest",
      REMINDERS_EMAIL_FROM: "reminders@send.example.test",
      INVITES_EMAIL_FROM: "invites@send.example.test",
    },
    logger: { error: () => {}, warn: () => {}, info: () => {}, log: () => {} } as never,
  });
  return { notifier, calls: rec.calls };
}

const send = (n: ReturnType<typeof armedNotifier>["notifier"], id: string, channel: "sms" | "email") =>
  n.dispatch({
    templateId: id,
    channel,
    to: channel === "sms" ? "+351910000000" : "patient@example.test",
    subject: "s",
    body: "b",
  });

describe("the four darkened bodies are refused, and nothing reaches a provider", () => {
  for (const { id, channel } of DARKENED) {
    it(`${id} is refused as template_unapproved and calls no transport`, async () => {
      const { notifier, calls } = armedNotifier(webRegistry);
      const out = await send(notifier, id, channel);

      // Narrowed with a throw rather than an expect, because `SendOutcome` is a
      // discriminated union and `reason` exists only on the refused arm - and
      // because "it sent" deserves a louder failure than a boolean mismatch.
      if (out.sent) throw new Error(`${id} was SENT and must not be`);
      // The REASON matters as much as the refusal: `template_unapproved` is what
      // 0075 records as the suppression reason, and it is the truthful one -
      // distinct from `live_send_disabled`, which would wrongly implicate the
      // flag the ruling explicitly did not touch.
      expect(out.reason).toBe("template_unapproved");
      expect(calls).toEqual([]);
    });
  }

  it("the whole stream is not darkened - the reminder and confirmation still send", async () => {
    // The ruling darkens FOUR BODIES. If this went red, the change had become a
    // silent outage of the messages the clinic depends on, which is exactly what
    // turning REMINDERS_LIVE_SEND off would have done and why it was not.
    for (const { id, channel } of STILL_ARMED) {
      const { notifier, calls } = armedNotifier(webRegistry);
      const out = await send(notifier, id, channel);
      expect(out.sent, `${id} must still send`).toBe(true);
      expect(calls).toHaveLength(1);
    }
  });
});

describe("THE NEGATIVE ARM: flipping approved back to true re-arms every one", () => {
  /** The shipped registry with the four ids forced back to approved. */
  const rearmedEntries = WEB_TEMPLATES.map((e) =>
    DARKENED.some((d) => d.id === e.id && d.channel === e.channel)
      ? { ...e, approved: true, approvedBy: "TEST", approvedAt: "2026-09-04" }
      : e,
  ) as readonly TemplateEntry[];
  const rearmed = buildRegistry(rearmedEntries);

  for (const { id, channel } of DARKENED) {
    it(`${id} SENDS again once approved is true, so the refusal was the approval`, async () => {
      const { notifier, calls } = armedNotifier(rearmed);
      const out = await send(notifier, id, channel);

      expect(out.sent).toBe(true);
      expect(calls).toHaveLength(1);
    });
  }

  it("and the shipped registry differs from the re-armed one in exactly four entries", () => {
    // Pins the BLAST RADIUS. If a future edit darkens or arms a fifth body, this
    // fails and names the count rather than letting the change ride along inside
    // a PR about something else.
    const differing = WEB_TEMPLATES.filter((e, i) => e.approved !== rearmedEntries[i]!.approved);
    expect(differing.map((e) => `${e.id}:${e.channel}`).sort()).toEqual([
      "follow_up.email:email",
      "follow_up.sms:sms",
      "no_show.email:email",
      "no_show.sms:sms",
    ]);
  });
});
