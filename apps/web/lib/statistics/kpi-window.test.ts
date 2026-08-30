import { describe, expect, it, vi } from "vitest";

// kpi-queries pulls in server-only transitively. Repo convention for unit-
// testing a server module under the node environment (see
// app/r/[token]/rate-limit.test.ts).
vi.mock("server-only", () => ({}));
import { DEFAULT_WINDOW_MONTHS, defaultKpiFrom } from "./kpi-queries";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PERF-06 / Sentry OSTEOJP-WEB-4 - the indicadores reports must never run
 * unbounded again.
 *
 * The defect was an ABSENCE: `dayBounds` returned `start: null` when the URL
 * carried no `from`, and null means no date predicate at all. Ten aggregates
 * then scanned every appointment and invoice ever recorded. An absence is
 * exactly what a test has to pin, because nothing about the code looked wrong.
 */
describe("PERF-06 - the KPI window has a floor", () => {
  it("defaults to twelve months back, as a ymd string", () => {
    expect(DEFAULT_WINDOW_MONTHS).toBe(12);
    expect(defaultKpiFrom(new Date("2026-08-30T10:00:00Z"))).toBe("2025-08-30");
  });

  it("handles a month-end origin without rolling into the wrong month", () => {
    // 2026-03-31 minus 12 months is 2025-03-31, which exists. The guard is that
    // the arithmetic is on UTC parts, so a local timezone cannot shift the day.
    expect(defaultKpiFrom(new Date("2026-03-31T23:30:00Z"))).toBe("2025-03-31");
    expect(defaultKpiFrom(new Date("2026-01-01T00:00:00Z"))).toBe("2025-01-01");
  });

  it("is a pure function of the instant it is given", () => {
    const now = new Date("2026-08-30T10:00:00Z");
    expect(defaultKpiFrom(now)).toBe(defaultKpiFrom(now));
  });

  /**
   * The floor lives in dayBounds, which is module-private, so this asserts the
   * SOURCE rather than the behaviour. A behavioural test would need a database.
   * What must never come back is `const start = ... : null` - the null branch.
   */
  it("dayBounds no longer has a null-start branch", () => {
    const src = readFileSync(join(__dirname, "kpi-queries.ts"), "utf8");
    const fn = src.slice(src.indexOf("function dayBounds"), src.indexOf("return { start, end };"));
    expect(fn).toContain("defaultKpiFrom");
    // The old shape, which is the defect:
    expect(fn).not.toMatch(/DATE_RE\.test\(from\)\s*\?\s*new Date\([^)]*\)\s*:\s*null/);
  });

  it("the page resolves the default into the filters it shows the user", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "app", "estatisticas", "indicadores", "page.tsx"),
      "utf8",
    );
    // Without this the picker would render blank while the query used a
    // 12-month window - a screen lying about its own scope.
    expect(src).toContain("defaultKpiFrom");
    expect(src).toMatch(/firstParam\(sp\.from\)\s*\?\?\s*defaultKpiFrom/);
  });
});
