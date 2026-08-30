import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SEC-sentry-check-ungated.
 *
 * THE DISPATCH ASKED FOR A GATE. THE GATE WAS ALREADY THERE, and this file is
 * what was actually missing: the route had ZERO test coverage, so nothing stood
 * between a future edit and an anonymously-triggerable error generator in
 * production.
 *
 * The page is the one that produced OSTEOJP-SENTRY-VERIFY, the evidence
 * HANDOVER-STATE.md records as clearing "the last hard block on arming sends".
 * An error channel outsiders can flood is one that can be made useless exactly
 * when it is needed.
 *
 * A SOURCE ASSERTION AND NOT A RENDER. The gate is three lines at the top of an
 * async server component that reaches auth and the database; rendering it under
 * vitest would test the mocks. What must hold is that the three lines are there
 * and in that order, which is what this reads.
 */
const SRC = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("SEC - /admin/sentry-check is not reachable anonymously", () => {
  it("redirects an unauthenticated visitor to /login", () => {
    expect(SRC).toMatch(/const ctx = await getRequestContext\(\);/);
    expect(SRC).toMatch(/if \(!ctx\) redirect\("\/login"\);/);
  });

  it("redirects any non-owner role away", () => {
    expect(SRC).toMatch(/if \(ctx\.role !== "owner"\) redirect\("\/"\);/);
  });

  it("gates BEFORE the throw, not after", () => {
    const gate = SRC.indexOf('ctx.role !== "owner"');
    const thrower = SRC.indexOf('shouldThrow === "1"');
    expect(gate).toBeGreaterThan(-1);
    expect(thrower).toBeGreaterThan(-1);
    // If the throw ever moved above the role check, an anonymous request would
    // raise the event before being redirected.
    expect(gate).toBeLessThan(thrower);
  });

  it("throws ONLY on ?throw=1, so a bookmark or refresh cannot manufacture noise", () => {
    expect(SRC).toMatch(/if \(shouldThrow === "1"\)/);
    expect(SRC).toContain("OSTEOJP-SENTRY-VERIFY");
  });

  it("never renders the DSN value, only whether it is set", () => {
    expect(SRC).toContain("serverSentryConfigured()");
    expect(SRC).not.toMatch(/process\.env\.(NEXT_PUBLIC_)?SENTRY_DSN/);
  });
});
