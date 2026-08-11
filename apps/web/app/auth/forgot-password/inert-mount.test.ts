/**
 * LE-staff-no-forgot-password - NOTHING IS SENT ON MOUNT, and the screen has
 * exactly one outcome. Both asserted in SOURCE.
 *
 * WHY A SOURCE SCAN. apps/web runs its tests in the node environment with no
 * jsdom (apps/web/vitest.config.ts), so a click cannot be simulated here. That
 * makes the difference between "called on submit" and "called on mount"
 * invisible to a render test - and it is precisely the difference that matters,
 * because the failure this guards reads as an improvement in review: someone
 * prefills the address from a query param and fires the send on load to save a
 * click.
 *
 * The pattern is the sibling screen's (../update-password/inert-get.test.ts),
 * including its comment strip. That strip is not decoration: this file's own
 * subject discusses `resetPasswordForEmail` in prose, and a guard that fires on
 * documentation gets suppressed rather than fixed. It is also the exact defect
 * carded as LE-vacuous-template-guard, found the same day one directory away -
 * an assertion in supabase-email-templates.test.ts that passes because the
 * string it looks for survives in a comment warning against using it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const CLIENT = "apps/web/app/auth/forgot-password/ForgotPasswordClient.tsx";
const LOGIN = "apps/web/app/login/page.tsx";

/** Source with comments stripped. */
const live = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("the request screen sends nothing until a human asks it to", () => {
  const src = live(read(CLIENT));

  it("guards against a vacuous pass: the file is read, stripped and still real", () => {
    // Every assertion below is a search over `src`. If the strip ate the file,
    // or the path is wrong, they would all pass while proving nothing - which
    // is the failure mode this whole suite exists to name.
    expect(src.length).toBeGreaterThan(500);
    expect(src).toContain("resetPasswordForEmail");
  });

  /** THE LOAD-BEARING ASSERTION. */
  it("calls resetPasswordForEmail exactly once, and only from the submit handler", () => {
    const calls = src.match(/supabase\.auth\.resetPasswordForEmail\s*\(/g) ?? [];
    expect(calls).toHaveLength(1);

    const submitStart = src.indexOf("async function handleSubmit");
    expect(submitStart).toBeGreaterThan(-1);

    expect(
      src.slice(0, submitStart).includes("resetPasswordForEmail"),
      "resetPasswordForEmail is reachable at mount time. Loading this page " +
        "would then mail whoever the URL named, including for every link " +
        "scanner that follows a pasted support-thread link.",
    ).toBe(false);

    // ...and it IS in the submit path, so the assertion above is not passing
    // because the call was deleted.
    expect(src.slice(submitStart)).toContain("resetPasswordForEmail");
  });

  it("runs no effect at all, so there is no mount-time seam to move it into", () => {
    // The screen needs none: every state change is a user action. useEffect
    // appearing here later is not itself wrong, but it is the seam this defect
    // arrives through, so it fails and gets read.
    expect(src).not.toContain("useEffect");
  });

  it("mints no session and issues no other credential-spending auth call", () => {
    // This screen asks for an email to be sent. It must not acquire a session
    // on the way: that is ../update-password/'s job, from the emailed token,
    // behind its own explicit submit.
    for (const forbidden of [
      "signInWithPassword",
      "signInWithOtp",
      "signInWithOAuth",
      "exchangeCodeForSession",
      "verifyOtp",
      "setSession",
    ]) {
      expect(src, `${forbidden} must not appear on the request screen`).not.toContain(forbidden);
    }
  });
});

describe("the screen cannot become a staff-roster oracle", () => {
  const src = live(read(CLIENT));

  /**
   * The single-outcome rule lives in ./request.ts and is proven there against
   * values. What THIS asserts is that the component actually defers to it - a
   * pure function nobody calls proves nothing about a screen.
   */
  it("routes the outcome through collapseRecoveryOutcome", () => {
    expect(src).toContain("collapseRecoveryOutcome");
  });

  it("never branches its rendering on the transport error", () => {
    // The error is bound once, handed to the collapser, and used only for the
    // log line. If a future edit renders from it, the two callers diverge and
    // the address becomes distinguishable. `error` must not reach a conditional
    // render.
    expect(src).not.toMatch(/error\s*\?\s*[<(]/);
    expect(src).not.toMatch(/\{\s*error\s*&&/);
    // The success flag is a plain boolean with no error dimension.
    expect(src).toContain("setSent(true)");
    expect(src).not.toMatch(/setSent\((?!true\))/);
  });

  it("logs the failure by message only, never the address", () => {
    // CLAUDE.md rule 7. The log line interpolates the collapser's own detail
    // string, which is never given the address.
    expect(src).toContain("outcome.logDetail");
    expect(src).not.toMatch(/console\.(error|log|warn)\([^)]*email/i);
  });
});

describe("the login screen keeps its entry point", () => {
  const src = live(read(LOGIN));

  it("links to this route, with the link outside any comment", () => {
    // The href assertion in ../../login/forgot-password-link.test.tsx runs
    // against rendered HTML and so cannot be satisfied by a comment. This is
    // the source-side twin, and it is stripped for the same reason.
    expect(src).toContain('href="/auth/forgot-password"');
  });
});
