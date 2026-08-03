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

  // The reconciliation, asserted rather than asserted-in-a-comment. The TOTALS
  // are unchanged by JP's approval — 10 web entries + 2 activation = 12 entries
  // over 11 distinct bodies. What changed is how many of them REFUSE.
  it("still totals 12 entries over 11 bodies across both apps", async () => {
    const { ACTIVATION_TEMPLATES } = await import(
      "../../../../apps/api/lib/notify/registry"
    );

    expect(REMINDER_TEMPLATES).toHaveLength(10);
    expect(ACTIVATION_TEMPLATES).toHaveLength(2);
    expect(REMINDER_TEMPLATES.length + ACTIVATION_TEMPLATES.length).toBe(12);

    // 11 BODIES, not 12: the two activation entries are one body on two channels.
    const activationBodies = new Set(ACTIVATION_TEMPLATES.map((t) => t.body));
    expect(activationBodies.size).toBe(1);
    expect(REMINDER_TEMPLATES.length + activationBodies.size).toBe(11);
  });

  it("leaves patient activation UNAPPROVED after JP's packet approval", async () => {
    // JP approved the packet. Activation was deliberately excluded from it as
    // dead code, so a blanket approval of the packet must not reach it.
    const { ACTIVATION_TEMPLATES } = await import(
      "../../../../apps/api/lib/notify/registry"
    );
    for (const t of ACTIVATION_TEMPLATES) {
      expect(t.approved).toBe(false);
      expect(t.approvedBy).toBeNull();
    }
  });

  it("records JP's 2026-08-03 blanket approval on every reminder body, with a real approver", () => {
    for (const t of REMINDER_TEMPLATES) {
      expect(t.approved).toBe(true);
      // Provenance is not decoration: an approval with no named approver and no
      // date is indistinguishable from a default, which is how unreviewed copy
      // reaches patients.
      expect(t.approvedBy).toBe("JP");
      expect(t.approvedAt).toBe("2026-08-03");
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

describe("the approval gate now passes, and the kill switch still holds", () => {
  it("passes all 10 approved bodies through when live send is armed", async () => {
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

    expect(outcomes.filter((o) => o.sent)).toHaveLength(10);
    expect(sink.records).toHaveLength(10);
  });

  // THE LOAD-BEARING TEST NOW. Approval removed one of the two gates; this is the
  // other, and it is the only thing standing between an approved body and a real
  // patient's phone. It must fail loudly if the kill switch ever stops holding.
  it("sends NOTHING with live send off, even though all 10 are approved", async () => {
    const { notifier, sink } = harness({});

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
      (o) => !o.sent && "reason" in o && o.reason === "live_send_disabled",
    );
    expect(refused).toHaveLength(10);
    expect(sink.records).toHaveLength(0);
  });

  it("still fails closed on an id that is not registered at all", async () => {
    const { notifier, sink } = harness(LIVE);
    const out = await notifier.dispatch({
      templateId: "reminder.24h.whatsapp",
      channel: "sms",
      to: "+351910000000",
      body: "corpo",
    });

    expect(out).toMatchObject({ sent: false, reason: "template_unapproved" });
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

  it("refuses a body the moment its approval is withdrawn, and only that one", async () => {
    // The inverse of the original assertion: now that all ten are approved, the
    // property worth proving is that UN-approving one stops exactly one.
    const flipped = WEB_TEMPLATES.map((t) =>
      t.id === "confirmation.sms"
        ? { ...t, approved: false, approvedBy: null, approvedAt: null }
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

    const withdrawn = await notifier.dispatch({
      templateId: "confirmation.sms",
      channel: "sms",
      to: "+351910000000",
      body: "corpo",
    });
    const stillApproved = await notifier.dispatch({
      templateId: "confirmation.email",
      channel: "email",
      to: "doente@example.test",
      subject: "assunto",
      body: "corpo",
    });

    expect(withdrawn).toMatchObject({ sent: false, reason: "template_unapproved" });
    expect(stillApproved.sent).toBe(true);
    expect(sink.records).toHaveLength(1);
  });
});
