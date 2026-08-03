/**
 * Item 2 DoD: every patient-facing body is registered and refused.
 *
 * COUNT RECONCILIATION (the arithmetic, so it cannot drift a third time):
 *
 *   10  patient-facing reminder BODIES in templates.ts
 *       (48h, 24h, confirmation, follow-up, no-show; each in email and SMS)
 *  + 1  patient activation BODY in apps/api (lib/auth/activation.ts)
 *  ---
 *   11  distinct patient-facing bodies
 *
 *   10  refusing registry ENTRIES here (one per body, since each reminder body
 *       is already channel-specific)
 *  + 2  refusing registry ENTRIES in apps/api — the ONE activation body is
 *       delivered on TWO channels, and the registry is keyed per (id, channel)
 *       so an SMS approval can never leak into an email approval
 *  ---
 *   12  refusing registry entries in total
 *
 * So: 11 bodies, 12 entries. Both numbers are correct; they count different
 * things. Earlier reports said "eight" (a miscount from the five-function audit)
 * and then "eleven entries" (conflating bodies with entries). This file asserts
 * the 10 it owns; apps/api/lib/notify/registry.test.ts asserts the other 2.
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

  // The reconciliation above, asserted rather than asserted-in-a-comment.
  it("totals 12 refusing entries across both apps: 10 here + 2 activation", async () => {
    const { ACTIVATION_TEMPLATES } = await import(
      "../../../../apps/api/lib/notify/registry"
    );
    const refusingHere = REMINDER_TEMPLATES.filter((t) => !t.approved);
    const refusingApi = ACTIVATION_TEMPLATES.filter((t) => !t.approved);

    expect(refusingHere).toHaveLength(10);
    expect(refusingApi).toHaveLength(2);
    expect(refusingHere.length + refusingApi.length).toBe(12);

    // 11 BODIES, not 12: the two activation entries are one body on two channels.
    const activationBodies = new Set(ACTIVATION_TEMPLATES.map((t) => t.body));
    expect(activationBodies.size).toBe(1);
    expect(refusingHere.length + activationBodies.size).toBe(11);
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
