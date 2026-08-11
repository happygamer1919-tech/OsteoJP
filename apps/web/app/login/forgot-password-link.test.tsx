/**
 * LE-staff-no-forgot-password - THE LOGIN SCREEN OFFERS A RECOVERY ROUTE.
 *
 * Before this card the staff login screen had no recovery entry point at all,
 * and the only way to start a password reset was the Supabase dashboard:
 * Authentication -> Users -> row menu -> Send password recovery. Today the only
 * staff are people who can reach that dashboard. On launch day Rodica, Lurdes
 * and Carlos cannot, so a forgotten password becomes a phone call to the owner
 * and a dashboard visit, every time.
 *
 * THE OMISSION WAS DELIBERATE AND IS RECORDED AS SUCH, which is why a test is
 * the right way to close it rather than a comment. The shipped page carried a
 * committed note reading "The staff app exposes no magic-link or password-reset
 * entry from /login today (only the post-reset /auth/update-password landing)".
 * That was true when it was written. A future rebuild of this screen (it has
 * been rebuilt at least once already, at W5-18) would restore the omission
 * without anyone noticing, because the omission looks like the absence of a
 * feature rather than the loss of one. This test makes it look like a failure.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// The page imports a "use server" module, which pulls next/headers and a
// Supabase server client at import time. Neither is reachable in a node test
// and neither is under test here: this file asserts what the screen OFFERS.
vi.mock("./actions", () => ({ login: vi.fn() }));

import LoginPage from "./page";

const html = () => renderToStaticMarkup(createElement(LoginPage));

describe("the staff login screen offers a password-recovery route", () => {
  it("guards against a vacuous pass: the page actually rendered", () => {
    // Every assertion below is a substring check, and a substring check against
    // an empty string fails for the wrong reason. This proves the render worked
    // and that the rest of the screen is intact.
    const out = html();
    expect(out.length).toBeGreaterThan(500);
    expect(out).toContain("Iniciar sessão");
    expect(out).toContain('name="password"');
  });

  /** THE LOAD-BEARING ASSERTION. */
  it("links to the forgot-password request form", () => {
    expect(html()).toContain('href="/auth/forgot-password"');
  });

  it("labels the link in pt-PT, so a locked-out user can recognise it", () => {
    // The label is the whole affordance. A correct href behind unreadable or
    // English text does not close this card.
    expect(html()).toContain("Esqueceu-se da palavra-passe?");
  });

  it("renders the link as a real anchor, not a button that needs JavaScript", () => {
    const out = html();
    const anchor = out.match(/<a[^>]*href="\/auth\/forgot-password"[^>]*>/);
    expect(
      anchor,
      "the recovery route must be a plain anchor: a staff member who cannot get " +
        "in is the least likely person to be on a healthy client bundle",
    ).not.toBeNull();
  });

  it("does not send the locked-out user to the patient portal", () => {
    // Patients authenticate by SMS OTP under Decision D and hold no password at
    // all. A recovery link that crossed into the portal would offer a password
    // reset to someone who has no password, and would leak the staff recovery
    // flow onto the patient surface.
    const out = html();
    expect(out).not.toContain("portal");
    expect(out).not.toContain("/auth/login");
  });
});
