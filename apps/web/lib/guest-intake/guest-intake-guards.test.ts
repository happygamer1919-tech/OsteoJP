import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { can, ROLES } from "@osteojp/auth";

/**
 * INTAKE-01 (staff side) - the capability, and four source guards over the
 * files this card added. Each guard has a negative control proving its matcher
 * can see what it forbids, so a guard that matches nothing cannot pass green.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/** Code with comments removed, so a comment that NAMES a rule does not trip it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

const INTAKE_FILES = [
  "lib/guest-intake/view.ts",
  "lib/guest-intake/queries.ts",
  "lib/guest-intake/retention.ts",
  "lib/guest-intake/inngest/retention.ts",
  "components/guest-intake-answers.tsx",
];

describe("guest_intake:read - the capability", () => {
  it("owner, admin, reception and therapist all hold it (the ruling)", () => {
    for (const role of ["owner", "admin", "reception", "therapist"] as const) {
      expect(can(role, "guest_intake:read")).toBe(true);
    }
    expect([...ROLES].sort()).toEqual(["admin", "owner", "reception", "therapist"]);
  });

  it("it did NOT widen the guest QUEUE: a therapist still lacks guest_requests:read (SEC-01)", () => {
    expect(can("therapist", "guest_requests:read")).toBe(false);
    expect(can("reception", "guest_requests:read")).toBe(true);
  });

  it("negative control: `can` does refuse a capability a role lacks", () => {
    expect(can("reception", "clinical_records:read")).toBe(false);
  });
});

describe("source guards", () => {
  it("the comment stripper keeps code and drops comments (negative control for the guards below)", () => {
    const sample = "const a = 1; // contraindication_pacemaker\n/* converted_appointment_id */ set contraindication_x = true";
    expect(code(sample)).not.toContain("contraindication_pacemaker");
    expect(code(sample)).not.toContain("converted_appointment_id");
    expect(code(sample)).toContain("contraindication_x");
  });

  it("no intake file writes or even names a contraindication column in code (ruling 2)", () => {
    for (const f of INTAKE_FILES) expect(code(read(f)), f).not.toMatch(/contraindication/i);
  });

  it("the retention path never names converted_appointment_id (it is NULL on every row)", () => {
    for (const f of INTAKE_FILES) expect(code(read(f)), f).not.toContain("converted_appointment_id");
  });

  it("the only log line is the retention count; the reads and the views log nothing", () => {
    const consoleCalls = (f: string) => (code(read(f)).match(/console\.\w+\(/g) ?? []).length;
    expect(consoleCalls("lib/guest-intake/retention.ts")).toBe(1);
    for (const f of INTAKE_FILES.filter((x) => x !== "lib/guest-intake/retention.ts")) {
      expect(consoleCalls(f), f).toBe(0);
    }
    // The one line is built from the prefix and two counts, and nothing else.
    expect(code(read("lib/guest-intake/retention.ts"))).toMatch(
      /log\(`\$\{RETENTION_LOG_PREFIX\} tenants=\$\{tenantIds\.length\} purged=\$\{purged\}`\)/,
    );
  });

  it("nothing a client component reaches imports the database (the browser build)", () => {
    for (const f of ["app/notificacoes/guest-requests-queue.tsx", "components/guest-intake-answers.tsx", "lib/guest-intake/view.ts"]) {
      const src = code(read(f));
      expect(src, f).not.toContain("@osteojp/db");
      expect(src, f).not.toContain("guest-intake/queries");
    }
    // Negative control: the matcher does see the import where it IS allowed.
    expect(code(read("lib/guest-intake/queries.ts"))).toContain("@osteojp/db");
  });

  it("the retention cron is registered on the served endpoint, daily, in Lisbon", async () => {
    const route = code(read("app/api/inngest/route.ts"));
    expect(route).toMatch(/functions:\s*\[\.\.\.functions,\s*purgeExpiredGuestIntakesDaily\]/);
    const { GUEST_INTAKE_RETENTION_CRON } = await import("./inngest/retention");
    expect(GUEST_INTAKE_RETENTION_CRON).toMatch(/^TZ=Europe\/Lisbon \d{1,2} \d{1,2} \* \* \*$/);
  });
});
