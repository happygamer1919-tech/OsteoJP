import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The DSN accessors. The subject is NOT "does it return the value" — it is
 * "is the ABSENCE audible", because a silent absence is what cost this project
 * every server error it has ever thrown.
 *
 * MODULE STATE IS PER-PROCESS (the once-only warn flags), so each case
 * re-imports with `resetModules`. Without that, the second case asserts against
 * a flag the first one already tripped and passes for the wrong reason.
 */
/**
 * NODE_ENV is typed read-only, so it is assigned through a narrow helper rather
 * than by widening process.env at every call site. One cast, named, with the
 * reason attached - a scattered `as any` would be the same trick five times
 * with no explanation.
 */
const setNodeEnv = (v: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = v;
};

describe("serverSentryDsn", () => {
  const OLD = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD };
  });
  afterEach(() => {
    process.env = OLD;
    vi.restoreAllMocks();
  });

  it("returns the dsn when set, and says nothing", async () => {
    process.env.SENTRY_DSN = "https://example.invalid/1";
    setNodeEnv("production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { serverSentryDsn } = await import("./sentry-dsn");
    expect(serverSentryDsn()).toBe("https://example.invalid/1");
    expect(spy).not.toHaveBeenCalled();
  });

  it("LOGS LOUDLY when unset outside development - the whole point", async () => {
    delete process.env.SENTRY_DSN;
    setNodeEnv("production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { serverSentryDsn } = await import("./sentry-dsn");

    expect(serverSentryDsn()).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);

    const msg = String(spy.mock.calls[0]?.[0] ?? "");
    // It must name the VARIABLE and say what the consequence is. A message that
    // only said "sentry not configured" would be true and useless: the reader
    // needs to know that events are being DISCARDED, not merely unconfigured.
    expect(msg).toContain("SENTRY_DSN");
    expect(msg).toContain("DISCARD EVERY EVENT SILENTLY");
  });

  it("NEVER prints the value - standing rule 3", async () => {
    process.env.SENTRY_DSN = "https://sup3rsecret@o1.ingest.sentry.io/42";
    setNodeEnv("production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { serverSentryDsn } = await import("./sentry-dsn");
    serverSentryDsn();
    const all = spy.mock.calls.flat().join(" ");
    expect(all).not.toContain("sup3rsecret");
  });

  it("stays QUIET in development, so the warning keeps its meaning", async () => {
    // A warning every local `next dev` trains everyone to ignore it, and an
    // ignored warning is worse than none - the same failure ACC-vacuous-guard-sweep
    // keeps finding in a different costume.
    delete process.env.SENTRY_DSN;
    setNodeEnv("development");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { serverSentryDsn } = await import("./sentry-dsn");
    expect(serverSentryDsn()).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("warns ONCE, not per request", async () => {
    delete process.env.SENTRY_DSN;
    setNodeEnv("production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { serverSentryDsn } = await import("./sentry-dsn");
    serverSentryDsn();
    serverSentryDsn();
    serverSentryDsn();
    // A per-request log on a dead deployment buries the first occurrence, which
    // is the one that says when it started.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("serverSentryConfigured", () => {
  it("reports a boolean, never the value", async () => {
    process.env.SENTRY_DSN = "https://sup3rsecret@o1.ingest.sentry.io/42";
    const { serverSentryConfigured } = await import("./sentry-dsn");
    expect(serverSentryConfigured()).toBe(true);
  });
});
