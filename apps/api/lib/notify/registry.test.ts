/**
 * Item 2 DoD, apps/api half: the eleventh patient-facing body.
 *
 * Patient activation is registered unapproved and refused even with live send
 * armed. It is dead code today (no caller), but registering it means it cannot
 * become live by someone merely wiring a route to it.
 */
import { describe, it, expect } from "vitest";
import { createNotifier, createTestSink } from "@osteojp/notify";
import { ACTIVATION_TEMPLATES, apiRegistry } from "./registry";

const silent = { info: () => {}, error: () => {} } as unknown as Console;

describe("patient activation registry", () => {
  it("registers both channels, both unapproved, both patient-facing", () => {
    expect(ACTIVATION_TEMPLATES).toHaveLength(2);
    for (const t of ACTIVATION_TEMPLATES) {
      expect(t.approved).toBe(false);
      expect(t.approvedBy).toBeNull();
      expect(t.audience).toBe("patient");
    }
  });

  it("refuses both with live send armed and sends nothing", async () => {
    const sink = createTestSink();
    const notifier = createNotifier({
      registry: apiRegistry,
      transport: sink,
      transportConfigured: () => true,
      env: { REMINDERS_LIVE_SEND: "true" },
      logger: silent,
      emailFrom: () => "reminders@send.osteojp.pt",
    });

    const outcomes = await Promise.all(
      ACTIVATION_TEMPLATES.map((t) =>
        notifier.dispatch({
          templateId: t.id,
          channel: t.channel,
          to: t.channel === "sms" ? "+351910000000" : "doente@example.test",
          subject: "assunto",
          body: t.body,
        }),
      ),
    );

    expect(
      outcomes.filter((o) => !o.sent && "reason" in o && o.reason === "template_unapproved"),
    ).toHaveLength(2);
    expect(sink.records).toHaveLength(0);
  });
});
