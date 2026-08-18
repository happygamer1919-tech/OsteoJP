/**
 * The apps/api approval ledger is EMPTY, and empty means refuses-everything.
 *
 * WHAT THIS FILE USED TO ASSERT, and why the change is a strengthening rather
 * than a loss of coverage. It proved that the two patient-activation templates
 * were registered `approved:false` and were refused even with live send armed —
 * a gate around a body that existed. W13-03 deleted the code behind them under
 * owner ruling WF-08 (R5, 2026-08-05): `sendPatientActivation` minted a Supabase
 * recovery link, which is a session grant, and Decision D permits no session
 * from anything but a verified OTP.
 *
 * So the property worth pinning is no longer "this body is refused" but "NO body
 * can be sent from this app at all", which is a wider claim and the one that
 * actually holds now. A registry with one unapproved entry could be made live by
 * flipping a boolean; an empty one has nothing to flip.
 *
 * THE FAIL-CLOSED DIRECTION IS THE POINT. `resolveApproved` treats an unknown
 * template id as unapproved, so an empty ledger refuses everything rather than
 * permitting everything. If that ever inverted, this suite goes red — which is
 * exactly the failure mode an empty-registry design has to be defended against.
 */
import { describe, it, expect } from "vitest";
import { createNotifier, createTestSink, resolveApproved } from "@osteojp/notify";
import { API_TEMPLATES, apiRegistry } from "./registry";

const silent = { info: () => {}, error: () => {} } as unknown as Console;

describe("apps/api approval ledger", () => {
  it("registers nothing", () => {
    expect(API_TEMPLATES).toEqual([]);
  });

  it("treats every id as unapproved, including ones that once existed", () => {
    for (const id of [
      "patient.activation.sms",
      "patient.activation.email",
      "reminder.48h.email",
      "anything.at.all",
    ]) {
      expect(resolveApproved(apiRegistry, id, "sms")).toBeFalsy();
      expect(resolveApproved(apiRegistry, id, "email")).toBeFalsy();
    }
  });

  it("sends NOTHING through the notifier with live send armed", async () => {
    // Live send deliberately ON: the refusal must come from the registry, not
    // from a flag. A test with the flag off would pass on either mechanism and
    // so would prove neither.
    const sink = createTestSink();
    const notifier = createNotifier({
      registry: apiRegistry,
      transport: sink,
      transportConfigured: () => true,
      // INC-12: `dispatch` asserts the notification env, so an armed flag needs
      // a complete environment or the throw would pre-empt the REGISTRY refusal
      // this test is about. Placeholders only; no real credential.
      env: {
        REMINDERS_LIVE_SEND: "true",
        INVITES_LIVE_SEND: "true",
        RESEND_API_KEY: "test",
        REMINDERS_EMAIL_FROM: "test",
        INVITES_EMAIL_FROM: "test",
        TWILIO_ACCOUNT_SID: "test",
        TWILIO_AUTH_TOKEN: "test",
        TWILIO_SMS_FROM: "test",
        REMINDERS_RESCHEDULE_BASE_URL: "test",
        REMINDERS_LINK_SECRET: "test",
      },
      logger: silent,
      emailFrom: () => "reminders@send.osteojp.pt",
      envFlags: ["REMINDERS_LIVE_SEND"],
    });

    const requests = [
      { templateId: "patient.activation.sms", channel: "sms" as const, to: "+351910000000" },
      {
        templateId: "patient.activation.email",
        channel: "email" as const,
        to: "doente@example.test",
      },
      { templateId: "reminder.48h.email", channel: "email" as const, to: "doente@example.test" },
    ];

    const outcomes = await Promise.all(
      requests.map((r) => notifier.dispatch({ ...r, subject: "assunto", body: "corpo" })),
    );

    expect(
      outcomes.filter((o) => !o.sent && "reason" in o && o.reason === "template_unapproved"),
    ).toHaveLength(3);
    // The transport is the assertion that matters: nothing reached it.
    expect(sink.records).toHaveLength(0);
  });
});
