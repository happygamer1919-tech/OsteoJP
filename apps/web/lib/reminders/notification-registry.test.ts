/**
 * Item 2 DoD: every patient-facing body is registered and refused.
 *
 * Count is ELEVEN, not eight. The original "eight" was a miscount carried from
 * the five-function audit: templates.ts holds TEN slots (48h, 24h, confirmation,
 * follow-up, no-show, each in email and SMS), and apps/api adds patient
 * activation. Ten here plus one activation body = eleven patient-facing bodies,
 * all approved:false. The activation half is asserted in apps/api's own suite;
 * this file asserts the ten it owns and the total registry shape.
 */
import { describe, it, expect } from "vitest";
import { createNotifier, createTestSink } from "@osteojp/notify";
import { REMINDER_TEMPLATES, INVITE_TEMPLATE, WEB_TEMPLATES, webRegistry } from "./notification-registry";

const silent = { info: () => {}, error: () => {} } as unknown as Console;

function harness(env: Record<string, string | undefined>) {
  const sink = createTestSink();
  const notifier = createNotifier({
    registry: webRegistry,
    transport: sink,
    transportConfigured: () => true,
    env,
    logger: silent,
    emailFrom: () => "reminders@send.osteojp.pt",
  });
  return { notifier, sink };
}

const LIVE = { REMINDERS_LIVE_SEND: "true", INVITES_LIVE_SEND: "true" };

describe("registry contents", () => {
  it("registers exactly 10 patient-facing reminder bodies", () => {
    expect(REMINDER_TEMPLATES).toHaveLength(10);
    expect(REMINDER_TEMPLATES.every((t) => t.audience === "patient")).toBe(true);
  });

  it("has every reminder body unapproved, with no approver invented", () => {
    for (const t of REMINDER_TEMPLATES) {
      expect(t.approved).toBe(false);
      expect(t.approvedBy).toBeNull();
      expect(t.approvedAt).toBeNull();
    }
  });

  it("covers both channels for all five notification kinds", () => {
    expect([...REMINDER_TEMPLATES].map((t) => t.id).sort()).toEqual([
      "confirmation.email",
      "confirmation.sms",
      "follow_up.email",
      "follow_up.sms",
      "no_show.email",
      "no_show.sms",
      "reminder.24h.email",
      "reminder.24h.sms",
      "reminder.48h.email",
      "reminder.48h.sms",
    ]);
  });

  it("registers the grandfathered staff invite as approved and staff-facing", () => {
    expect(INVITE_TEMPLATE.approved).toBe(true);
    expect(INVITE_TEMPLATE.audience).toBe("staff");
    expect(INVITE_TEMPLATE.liveSendFlag).toBe("INVITES_LIVE_SEND");
  });

  it("carries the real body, not a re-authored copy", async () => {
    const { CONFIRMATION_SMS } = await import("./templates");
    const entry = REMINDER_TEMPLATES.find((t) => t.id === "confirmation.sms");
    expect(entry?.body).toBe(CONFIRMATION_SMS.pt);
  });
});

describe("approval gate refuses every patient body, live send armed", () => {
  it("refuses all 10 web patient bodies and sends none", async () => {
    const { notifier, sink } = harness(LIVE);

    const outcomes = await Promise.all(
      REMINDER_TEMPLATES.map((t) =>
        notifier.dispatch({
          templateId: t.id,
          channel: t.channel,
          to: t.channel === "sms" ? "+351910000000" : "doente@example.test",
          subject: "assunto",
          body: t.body,
          appointmentId: "appt-1",
        }),
      ),
    );

    const refused = outcomes.filter(
      (o) => !o.sent && "reason" in o && o.reason === "template_unapproved",
    );
    expect(refused).toHaveLength(10);
    expect(sink.records).toHaveLength(0);
  });

  it("lets the grandfathered invite through, proving the gate is not blanket-deny", async () => {
    const { notifier, sink } = harness(LIVE);
    const out = await notifier.dispatch({
      templateId: INVITE_TEMPLATE.id,
      channel: "email",
      to: "novo@osteojp.pt",
      subject: "Convite",
      body: "corpo",
    });

    expect(out.sent).toBe(true);
    expect(sink.records).toHaveLength(1);
  });

  it("dispatches a body the moment it is approved, and only that one", async () => {
    const flipped = WEB_TEMPLATES.map((t) =>
      t.id === "confirmation.sms"
        ? { ...t, approved: true, approvedBy: "JP (test)", approvedAt: "2026-08-03" }
        : t,
    );
    const sink = createTestSink();
    const { buildRegistry } = await import("@osteojp/notify");
    const notifier = createNotifier({
      registry: buildRegistry(flipped),
      transport: sink,
      transportConfigured: () => true,
      env: LIVE,
      logger: silent,
      emailFrom: () => "reminders@send.osteojp.pt",
    });

    const approved = await notifier.dispatch({
      templateId: "confirmation.sms",
      channel: "sms",
      to: "+351910000000",
      body: "corpo",
    });
    const stillRefused = await notifier.dispatch({
      templateId: "confirmation.email",
      channel: "email",
      to: "doente@example.test",
      subject: "assunto",
      body: "corpo",
    });

    expect(approved.sent).toBe(true);
    expect(stillRefused).toMatchObject({ sent: false, reason: "template_unapproved" });
    expect(sink.records).toHaveLength(1);
  });
});
