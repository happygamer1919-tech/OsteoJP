/**
 * The JP approval packet must stay in step with the registry.
 *
 * The failure this prevents: someone adds an eleventh patient-facing body, it
 * registers `approved: false` (so it is safely blocked), and it is then approved
 * in a batch alongside the others without JP ever having seen it — because the
 * packet he read only listed ten. The gate would be doing its job and the review
 * would still be wrong.
 *
 * So: every patient-facing template id in the registry must appear in the packet,
 * by id. Adding a body without adding its section fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REMINDER_TEMPLATES } from "./notification-registry";

const PACKET = join(__dirname, "../../../../docs/notifications-approval-packet.md");

describe("approval packet covers the registry", () => {
  const packet = readFileSync(PACKET, "utf8");

  it("names every patient-facing template id", () => {
    const missing = REMINDER_TEMPLATES.filter((t) => !packet.includes(`\`${t.id}\``));
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it("has one numbered section per template", () => {
    const sections = packet.match(/^### \d+\. /gm) ?? [];
    expect(sections).toHaveLength(REMINDER_TEMPLATES.length);
  });

  it("offers both 24h variants, A without the fee line and B with it", () => {
    expect(packet).toMatch(/^### Variante A /m);
    expect(packet).toMatch(/^### Variante B /m);
    expect(packet).toContain("50%");
  });

  it("carries the defaults matrix JP needs to read the rest", () => {
    expect(packet).toContain("reminder_sms_enabled");
    expect(packet).toContain("reminder_email_enabled");
  });

  it("does NOT put the dead activation template in front of a clinical owner", () => {
    expect(packet).not.toContain("patient.activation.sms");
    expect(packet).not.toContain("patient.activation.email");
  });

  it("states that the fee-notice flag is specified but not yet built", () => {
    // A packet that implies a protection already exists would be the same class
    // of false claim this lane has been unpicking all session.
    expect(packet).toContain("REMINDERS_FEE_NOTICE_ENABLED");
    expect(packet).toMatch(/ainda nao construido/i);
  });
});
