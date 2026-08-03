/**
 * RGPD payload minimisation, now a documented compliance property.
 *
 * Contact data tied to an appointment is art. 9 health data. Inngest is a US
 * subprocessor, so every field an event carries is a field that crosses a border
 * and sits in a third-party queue. The design keeps identifiers and instants in
 * the event and fetches the patient's phone and email at EXECUTION time, inside
 * the tenant-scoped read. Counsel reviewed this and requires it maintained.
 *
 * This test exists so a convenience refactor cannot regress it. Threading the
 * phone number into the event payload to "save a query" would be an entirely
 * reasonable-looking change and a compliance regression, and nothing else in the
 * codebase would object.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT = join(__dirname, "inngest/client.ts");

/** Field names that would put patient contact data or PII into an event. */
const FORBIDDEN = [
  "phone",
  "email",
  "patientName",
  "fullName",
  "nif",
  "address",
  "notes",
  "serviceName",
];

/** Strip comments so a mention in prose never satisfies or trips the check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("Inngest event payloads carry identifiers only", () => {
  const src = stripComments(readFileSync(CLIENT, "utf8"));

  // Guard the guard: if the payload types stop living here, this test would pass
  // vacuously while checking nothing.
  it("is actually reading the payload type definitions", () => {
    expect(src).toContain("AppointmentScheduledData");
    expect(src).toContain("ReminderDueData");
    expect(src).toContain("AppointmentStatusChangedData");
    expect(src).toContain("appointmentId");
  });

  it.each(FORBIDDEN)("declares no field whose name contains %s", (field) => {
    // Field position, SUBSTRING match on the name. `patientPhone` is exactly as
    // much of a leak as `phone`, and a word-boundary match would miss it — which
    // it did, until the negative arm caught the gap.
    const asField = new RegExp(`^\\s*[a-zA-Z0-9]*${field}[a-zA-Z0-9]*\\??\\s*:`, "im");
    expect(asField.test(src)).toBe(false);
  });

  it("keeps every declared payload field on the identifier/instant allowlist", () => {
    // Anything genuinely new must be added here deliberately, which is the point:
    // the decision to put a field in an event becomes visible in a diff.
    const ALLOWED = new Set([
      "appointmentId",
      "tenantId",
      "startsAt",
      "endsAt",
      "sendAt",
      "offsetId",
      "channel",
      "confirmationEligible",
    ]);

    const blocks = src.match(/=\s*\{[^}]*\}/g) ?? [];
    const declared = blocks
      .flatMap((b) => [...b.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\??\s*:/gm)])
      .map((m) => m[1]!);

    expect(declared.length).toBeGreaterThan(0);
    expect([...new Set(declared)].filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});
