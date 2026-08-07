/**
 * LE-auth-recovery-deadend — THE GET IS INERT, asserted in source.
 *
 * This is the property the whole fix rests on: a mail-provider link scanner
 * fetches the emailed link, and that fetch must spend nothing. It is a
 * SOURCE-LEVEL assertion rather than a render test on purpose - the failure it
 * guards is "someone moves the verify call into the effect because it makes the
 * UX one click shorter", and that reads as an improvement in review.
 *
 * The reminder lane has held this same property since it shipped
 * (apps/web/app/r/[token]/page.tsx: "Still performs nothing" at the render step,
 * redemption behind an explicit POST). The auth lane never adopted it, which is
 * the whole of this incident. These tests are the adoption made permanent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const CLIENT = "apps/web/app/auth/update-password/UpdatePasswordClient.tsx";
const RESET_TEMPLATE = "supabase/templates/reset-password.html";
const INVITE_TEMPLATE = "supabase/templates/invite.html";
const PROVISION = "apps/web/lib/auth/provision.ts";

/** Source with comments stripped: a comment that DISCUSSES verifyOtp must not
 *  read as a call to it. A guard that fires on documentation gets ignored - the
 *  same lesson blocking-status.test.ts already learned about SQL headers. */
const live = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Same rule for the email templates. Their headers DOCUMENT what was removed
 *  and why, naming {{ .ConfirmationURL }} and {{ .RedirectTo }} in prose - which
 *  is exactly the text the assertions below look for. */
const liveHtml = (src: string) => src.replace(/<!--[\s\S]*?-->/g, " ");

describe("the landing page spends nothing on load", () => {
  const src = live(read(CLIENT));

  it("guards against a vacuous pass: the file is read and non-empty", () => {
    expect(src.length).toBeGreaterThan(500);
    expect(src).toContain("verifyOtp");
  });

  /**
   * THE LOAD-BEARING ASSERTION. `verifyOtp` must appear exactly once, and inside
   * the submit handler - never in the effect that runs on mount.
   */
  it("calls verifyOtp exactly once, and only from the submit handler", () => {
    const calls = src.match(/supabase\.auth\.verifyOtp\s*\(/g) ?? [];
    expect(calls).toHaveLength(1);

    // Everything before handleSubmit is mount-time: the derivation and both
    // effects. verifyOtp must appear in NONE of it.
    const submitStart = src.indexOf("async function handleSubmit");
    expect(submitStart).toBeGreaterThan(-1);

    expect(
      src.slice(0, submitStart).includes("verifyOtp"),
      "verifyOtp is reachable at mount time. A link scanner's GET would then " +
        "spend the token before the staff member clicks, which is exactly the " +
        "defect this fix removes.",
    ).toBe(false);

    // ...and it IS in the submit path, so the assertion above is not passing
    // because the call was deleted.
    expect(src.slice(submitStart)).toContain("verifyOtp");
  });

  it("performs no other token-consuming call at mount time", () => {
    const mountTime = src.slice(0, src.indexOf("async function handleSubmit"));
    // exchangeCodeForSession is the other auth-js call that spends a one-time
    // credential. It must never appear here.
    expect(mountTime).not.toContain("exchangeCodeForSession");
    expect(mountTime).not.toContain("updateUser");
  });

  /**
   * THE TOKEN_HASH PATH RESOLVES IN A PURE DERIVATION, not an effect.
   *
   * Two things follow from that and both matter. There is no async step, so the
   * race the old implementation lost - the client's URL detection versus the
   * effect reading the URL - cannot recur. And there is no state to set at mount,
   * so the cascading-render lint rule has nothing to fire on. `phaseFromUrl` is
   * where that lives, and it must stay free of effects and awaits.
   */
  it("resolves the token_hash path in a pure function, with no await and no effect", () => {
    const start = src.indexOf("function phaseFromUrl(");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("export default function"));
    expect(body).toContain("link.tokenHash");
    expect(body).not.toContain("await");
    expect(body).not.toContain("useEffect");
    expect(body).not.toContain("setOverride");
    // It must not call anything that could touch the network or the session.
    expect(body).not.toContain("supabase");
  });

  /**
   * The params must be captured BEFORE any scrub. The old page called scrubHash
   * on every outcome including the error path, so the screen a human was looking
   * at had just erased what caused it. `captureLink` now runs during render, via
   * useSyncExternalStore, which is strictly earlier than any effect.
   */
  it("captures the arriving params during render, before any effect can scrub", () => {
    const capture = src.indexOf("readLinkParams(");
    // The first CALL, not the declaration: `function scrubHash(): void` contains
    // the substring "scrubHash()".
    const firstScrub = src.indexOf("scrubHash();");
    expect(capture).toBeGreaterThan(-1);
    expect(firstScrub).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(firstScrub);
    // And it is wired through the render-time store, not an effect.
    expect(src).toContain("useSyncExternalStore(noopSubscribe, captureLink");
  });

  it("surfaces the captured detail on the error view", () => {
    expect(src).toContain('data-testid="link-diagnostics"');
    expect(src).toContain("phase.detail");
  });

  it("keeps the legacy fragment path, for links already sitting in inboxes", () => {
    // Staff who were sent a link before this shipped still need to get in.
    expect(src).toContain("onAuthStateChange");
    expect(src).toContain("hadHash");
  });
});

describe("the emails carry an inert link", () => {
  for (const [name, path, type] of [
    ["reset-password", RESET_TEMPLATE, "recovery"],
    ["invite", INVITE_TEMPLATE, "invite"],
  ] as const) {
    describe(name, () => {
      const html = liveHtml(read(path));

      it("does NOT use {{ .ConfirmationURL }} — fetching that URL spends the token", () => {
        // The single most important line in this file. ConfirmationURL is
        // Supabase's own /auth/v1/verify GET; a scanner following it consumes
        // the one-time token before the human clicks.
        expect(html).not.toContain(".ConfirmationURL");
      });

      it("carries {{ .TokenHash }} to our own landing page, with the right type", () => {
        expect(html).toContain("{{ .TokenHash }}");
        expect(html).toContain(`type=${type}`);
        expect(html).toContain("https://app.osteojp.pt/auth/update-password?token_hash=");
      });

      /**
       * {{ .RedirectTo }} is populated only when the caller passed a redirect_to.
       * A DASHBOARD-triggered recovery passes none, so it renders EMPTY and the
       * link breaks. That conflation - one variable set on one trigger path and
       * empty on another - is the recorded root cause of this incident.
       */
      it("does NOT depend on {{ .RedirectTo }}, which is empty for dashboard triggers", () => {
        expect(html).not.toContain(".RedirectTo");
      });

      it("gives the same link in the copy-paste fallback, not a truncated one", () => {
        // The visible text exists so a staff member whose button does not work
        // can paste it. A shortened placeholder there would be unusable.
        const occurrences = html.split("{{ .TokenHash }}").length - 1;
        expect(occurrences).toBeGreaterThanOrEqual(3);
      });

      it("guards against a vacuous pass: the stripped template still has content", () => {
        // liveHtml removes the header comment. If it removed everything, the
        // two not-to-contain assertions above would pass on an empty string.
        expect(html).toContain("<html");
        expect(html.length).toBeGreaterThan(800);
      });
    });
  }
});

describe("the in-product staff invite link is inert too", () => {
  const src = live(read(PROVISION));

  it("no longer returns Supabase's action_link, which is the verify GET", () => {
    expect(src).not.toContain("properties?.action_link");
    expect(src).not.toContain("properties.action_link");
  });

  it("builds our own URL from the inert hashed_token", () => {
    expect(src).toContain("hashed_token");
    expect(src).toContain('searchParams.set("token_hash"');
    expect(src).toContain('searchParams.set("type", "recovery")');
  });

  /**
   * The var stopped being optional the moment we build the URL ourselves. PG7:
   * no silent degradation - a missing var fails loudly and the invite falls back
   * to the temporary-password hand-off, which is a visible working outcome.
   */
  it("fails LOUDLY when STAFF_INVITE_REDIRECT_URL is missing, rather than degrading", () => {
    expect(src).toContain("STAFF_INVITE_REDIRECT_URL is not set");
    expect(src).toContain("console.error");
  });
});
