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

/**
 * Every var `missingNotificationEnv` demands once ANY stream is armed. Spread
 * UNDER each test's own env, so `env: LIVE` keeps meaning what it always meant:
 * armed AND correctly configured.
 *
 * INC-12 made this necessary. The env assertion now runs inside `dispatch`, so
 * a test that arms a flag against a bare `{}` would throw NotificationEnvError
 * instead of exercising the gate step it is actually about. Making the complete
 * environment the DEFAULT keeps every existing case testing its own property,
 * and the incomplete case gets its own describe block below where it is the
 * subject rather than a side effect.
 *
 * Values are placeholders. No real credential appears in this repo.
 */
const COMPLETE_ENV: Record<string, string> = {
  RESEND_API_KEY: "test",
  REMINDERS_EMAIL_FROM: "test",
  INVITES_EMAIL_FROM: "test",
  TWILIO_ACCOUNT_SID: "test",
  TWILIO_AUTH_TOKEN: "test",
  TWILIO_SMS_FROM: "test",
  REMINDERS_RESCHEDULE_BASE_URL: "test",
  REMINDERS_LINK_SECRET: "test",
};

const FLAGS = ["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"] as const;

function harness(
  over: {
    env?: Record<string, string | undefined>;
    entries?: TemplateEntry[];
    /** Omit the complete env, so the incomplete-config cases can be built. */
    bareEnv?: boolean;
  } = {},
) {
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
    env: over.bareEnv ? (over.env ?? {}) : { ...COMPLETE_ENV, ...(over.env ?? {}) },
    logger,
    emailFrom: () => "reminders@send.osteojp.pt",
    envFlags: FLAGS,
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
      env: { ...COMPLETE_ENV, ...LIVE },
      logger: { info: () => {}, error: () => {} } as unknown as Console,
      envFlags: FLAGS,
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

/**
 * ===========================================================================
 * INC-12 - the env guard is LAZY, and these are the two halves of that.
 * ===========================================================================
 * On 2026-08-18 `REMINDERS_LIVE_SEND=true` reached production with
 * `REMINDERS_LINK_SECRET` absent. `assertNotificationEnv` ran at MODULE
 * EVALUATION in three files, threw, and took down `/admin/staff` and the entire
 * `/api/inngest` route - two surfaces that send nothing.
 *
 * THE PROPERTY IS A PAIR AND EITHER HALF ALONE IS WRONG. "Does not throw on
 * import" without "throws on send" is a guard that was deleted. "Throws on send"
 * without "does not throw on import" is the outage. Both cases are here, next to
 * each other, so a future edit that satisfies one by breaking the other fails.
 *
 * THE NEGATIVE ARM IS THE FIRST TEST IN THIS BLOCK: put the assertion back at
 * module scope in gate.ts's importers and `constructing a notifier` starts
 * throwing. Building a notifier is the closest this package can get to "import
 * the app module", because the package has no app module to import - the
 * app-level version of the same pair lives in
 * apps/web/lib/reminders/invite-boot-env.test.ts, which imports the real file.
 */
describe("INC-12 - armed but incomplete env fails the SEND, not the module", () => {
  const ARMED_INCOMPLETE = { ...COMPLETE_ENV, REMINDERS_LIVE_SEND: "true" };
  delete (ARMED_INCOMPLETE as Record<string, string | undefined>).REMINDERS_LINK_SECRET;

  it("constructs a notifier without throwing, armed and incomplete", () => {
    // The outage, stated as a test. This is the exact production state of
    // 2026-08-18: the flag armed, the link secret absent.
    expect(() =>
      harness({ env: ARMED_INCOMPLETE, bareEnv: true }),
    ).not.toThrow();
  });

  it("throws NotificationEnvError from dispatch, naming the missing var", async () => {
    const { notifier, sink } = harness({ env: ARMED_INCOMPLETE, bareEnv: true });

    await expect(notifier.dispatch(REQ)).rejects.toThrow(/REMINDERS_LINK_SECRET/);
    // Nothing was sent. The throw is not a partial send.
    expect(sink.records).toHaveLength(0);
  });

  it("throws rather than degrading to a missing_provider_config suppression", async () => {
    // WHY THIS IS ITS OWN CASE. `transportConfigured` returns false for an
    // incomplete environment too, so an assertion placed one line later would
    // return `{sent:false, reason:"missing_provider_config"}` - the SAME line a
    // healthy sandbox deploy writes. A broken deploy would then be
    // indistinguishable from a safe one in the logs, which is the silent
    // degradation #763 and #778 removed from these paths.
    const sink = createTestSink();
    const notifier = createNotifier({
      registry: buildRegistry([APPROVED]),
      transport: sink,
      transportConfigured: () => false,
      env: ARMED_INCOMPLETE,
      logger: { info: () => {}, error: () => {} } as unknown as Console,
      envFlags: FLAGS,
    });

    await expect(notifier.dispatch(REQ)).rejects.toThrow(/REMINDERS_LINK_SECRET/);
  });

  it("does NOT throw when the stream is off, however incomplete the env", async () => {
    // The state dev, CI and every preview deploy are in. A flag that is off
    // demands nothing, which is what kept those builds working before and must
    // keep working now.
    const { notifier, sink } = harness({ env: {}, bareEnv: true });
    const out = await notifier.dispatch(REQ);

    expect(out).toMatchObject({ sent: false, reason: "live_send_disabled" });
    expect(sink.records).toHaveLength(0);
  });

  it("does NOT throw when armed and complete - no behaviour change", async () => {
    const { notifier, sink } = harness({ env: { REMINDERS_LIVE_SEND: "true" } });
    const out = await notifier.dispatch(REQ);

    expect(out).toMatchObject({ sent: true, sandbox: false });
    expect(sink.records).toHaveLength(1);
  });

  it("checks the APP's flag set, so the error names every missing var at once", async () => {
    // One pass to fix a misconfigured deploy, not one redeploy per variable.
    // The flag list comes from the app (`envFlags`), not from the template, so
    // the message is the same one the boot check produced.
    const twoMissing = { ...COMPLETE_ENV, REMINDERS_LIVE_SEND: "true" } as Record<
      string,
      string | undefined
    >;
    delete twoMissing.REMINDERS_LINK_SECRET;
    delete twoMissing.RESEND_API_KEY;

    const { notifier } = harness({ env: twoMissing, bareEnv: true });
    await expect(notifier.dispatch(REQ)).rejects.toThrow(/RESEND_API_KEY/);
    await expect(notifier.dispatch(REQ)).rejects.toThrow(/REMINDERS_LINK_SECRET/);
  });
});
