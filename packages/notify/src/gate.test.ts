import { describe, it, expect, beforeEach } from "vitest";
import { createNotifier } from "./gate";
import { buildRegistry, type TemplateEntry } from "./registry";
import { createTestSink } from "./sink";
import type { Channel } from "./types";

// Fixture templates. The real entries live in
// apps/web/lib/reminders/notification-registry.ts; these exist so the gate's own
// behaviour can be tested without importing an app.

function entry(over: Partial<TemplateEntry> & { id: string }): TemplateEntry {
  return {
    channel: "sms",
    audience: "patient",
    triggerEvent: "test/event",
    body: "corpo de teste",
    liveSendFlag: "REMINDERS_LIVE_SEND",
    approved: false,
    approvedBy: null,
    approvedAt: null,
    ...over,
  };
}

const APPROVED = entry({ id: "fixture.approved", approved: true, approvedBy: "test", approvedAt: "2026-08-03" });
const UNAPPROVED = entry({ id: "fixture.unapproved" });

function harness(over: { env?: Record<string, string | undefined>; entries?: TemplateEntry[] } = {}) {
  const sink = createTestSink();
  const lines: string[] = [];
  const logger = {
    info: (m: string) => void lines.push(m),
    error: (m: string) => void lines.push(m),
  } as unknown as Console;
  const notifier = createNotifier({
    registry: buildRegistry(over.entries ?? [APPROVED, UNAPPROVED]),
    transport: sink,
    transportConfigured: () => true,
    env: over.env ?? {},
    logger,
    emailFrom: () => "reminders@send.osteojp.pt",
  });
  return { notifier, sink, lines };
}

const REQ = {
  templateId: "fixture.approved",
  channel: "sms" as Channel,
  to: "+351910000000",
  body: "corpo de teste",
  appointmentId: "appt-1",
};

describe("kill switch — REMINDERS_LIVE_SEND is opt-in", () => {
  it("suppresses with live_send_disabled and zero sink records when the var is unset", async () => {
    const { notifier, sink, lines } = harness({ env: {} });
    const out = await notifier.dispatch(REQ);

    expect(out.sent).toBe(false);
    expect(out).toMatchObject({ sandbox: true, reason: "live_send_disabled" });
    expect(sink.records).toHaveLength(0);
  });

  it("emits exactly one structured suppression line naming template, channel, appointment, reason", async () => {
    const { notifier, lines } = harness({ env: {} });
    await notifier.dispatch(REQ);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "[notify] suppressed template=fixture.approved channel=sms appointment=appt-1 reason=live_send_disabled",
    );
  });

  it("never puts a recipient or a body in the suppression log", async () => {
    const { notifier, lines } = harness({ env: {} });
    await notifier.dispatch(REQ);

    expect(lines[0]).not.toContain("+351910000000");
    expect(lines[0]).not.toContain("corpo de teste");
  });

  it('sends through the sink when the var is exactly "true"', async () => {
    const { notifier, sink, lines } = harness({ env: { REMINDERS_LIVE_SEND: "true" } });
    const out = await notifier.dispatch(REQ);

    expect(out.sent).toBe(true);
    expect(out).toMatchObject({ sandbox: false, templateId: "fixture.approved", channel: "sms" });
    expect(sink.records).toEqual([
      { channel: "sms", to: "+351910000000", body: "corpo de teste" },
    ]);
    expect(lines).toHaveLength(0);
  });

  // Opt-in means opt-in. A typo in a Vercel env var must fail safe.
  it.each(["TRUE", "True", "1", "yes", "on", " true", "true ", "", "false"])(
    "treats %j as OFF",
    async (value) => {
      const { notifier, sink } = harness({ env: { REMINDERS_LIVE_SEND: value } });
      const out = await notifier.dispatch(REQ);

      expect(out).toMatchObject({ sent: false, reason: "live_send_disabled" });
      expect(sink.records).toHaveLength(0);
    },
  );

  it("keeps INVITES_LIVE_SEND independent of REMINDERS_LIVE_SEND", async () => {
    const invite = entry({
      id: "fixture.invite",
      audience: "staff",
      channel: "email",
      liveSendFlag: "INVITES_LIVE_SEND",
      approved: true,
      approvedBy: "test",
      approvedAt: "2026-08-03",
    });
    const { notifier, sink } = harness({
      env: { REMINDERS_LIVE_SEND: "true" },
      entries: [APPROVED, invite],
    });

    const out = await notifier.dispatch({
      templateId: "fixture.invite",
      channel: "email",
      to: "staff@example.test",
      subject: "assunto",
      body: "corpo",
    });

    expect(out).toMatchObject({ sent: false, reason: "live_send_disabled" });
    expect(sink.records).toHaveLength(0);
  });
});

describe("approval gate — holds even when live send is armed", () => {
  const LIVE = { REMINDERS_LIVE_SEND: "true" };

  it("refuses an unapproved template with template_unapproved", async () => {
    const { notifier, sink } = harness({ env: LIVE });
    const out = await notifier.dispatch({ ...REQ, templateId: "fixture.unapproved" });

    expect(out).toMatchObject({ sent: false, sandbox: true, reason: "template_unapproved" });
    expect(sink.records).toHaveLength(0);
  });

  it("fails closed on an id that is not registered at all", async () => {
    const { notifier, sink } = harness({ env: LIVE });
    const out = await notifier.dispatch({ ...REQ, templateId: "fixture.does-not-exist" });

    expect(out).toMatchObject({ sent: false, reason: "template_unapproved" });
    expect(sink.records).toHaveLength(0);
  });

  it("does not let an approved SMS body ship as email under the same id", async () => {
    const { notifier, sink } = harness({ env: LIVE });
    const out = await notifier.dispatch({
      ...REQ,
      channel: "email",
      to: "patient@example.test",
      subject: "assunto",
    });

    expect(out).toMatchObject({ sent: false, reason: "template_unapproved" });
    expect(sink.records).toHaveLength(0);
  });

  it("reports template_unapproved ahead of live_send_disabled when both apply", async () => {
    const { notifier } = harness({ env: {} });
    const out = await notifier.dispatch({ ...REQ, templateId: "fixture.unapproved" });

    expect(out).toMatchObject({ reason: "template_unapproved" });
  });

  it("suppresses missing_provider_config without constructing a provider client", async () => {
    const sink = createTestSink();
    const notifier = createNotifier({
      registry: buildRegistry([APPROVED]),
      transport: sink,
      transportConfigured: () => false,
      env: LIVE,
      logger: { info: () => {}, error: () => {} } as unknown as Console,
    });

    const out = await notifier.dispatch(REQ);
    expect(out).toMatchObject({ sent: false, reason: "missing_provider_config" });
    expect(sink.records).toHaveLength(0);
  });

  it("suppresses a blank recipient rather than calling the transport", async () => {
    const { notifier, sink } = harness({ env: LIVE });
    const out = await notifier.dispatch({ ...REQ, to: "   " });

    expect(out).toMatchObject({ sent: false, reason: "invalid_recipient" });
    expect(sink.records).toHaveLength(0);
  });
});

describe("registry construction", () => {
  it("rejects duplicate template ids", () => {
    expect(() => buildRegistry([APPROVED, APPROVED])).toThrow(/duplicate template id/);
  });
});
