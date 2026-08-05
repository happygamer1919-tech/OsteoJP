/**
 * SEC-portal-magic-link — Decision D enforcement, W13.
 *
 * Decision D: "patient login is a 6-digit SMS OTP, phone only... No password,
 * NO MAGIC LINK, no session minted from any other artefact."
 *
 * Email-link sign-in went live on the patient portal as a side effect of the
 * 2026-08-05 Supabase SMTP fix: until then every auth email failed silently on
 * an unverifiable gmail.com sender, so the button produced nothing and the
 * violation was inert. The owner's own verification email ("Your sign-in link")
 * was that path working.
 *
 * THIS GUARDS BOTH HALVES, because removing only the first is the obvious
 * mistake: the surface that OFFERS a sign-in link, and the code that HONOURS one.
 * A link already sitting in an inbox, or one issued from the Supabase dashboard,
 * would still have minted a session through the hash-fragment handler after the
 * button was gone.
 *
 * WHAT IS DELIBERATELY STILL ALLOWED, so a later reader does not "finish the
 * job" and break recovery: /auth/callback still exchanges a `?code=` param, and
 * password recovery still redirects there. That is the existing password-based
 * auth which LOOP 3 replaces wholesale with OTP. Removing it now would strand
 * any patient who forgot their password, with no replacement built yet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const LOGIN = join(__dirname, "page.tsx");

/** Comments discuss the forbidden names; only code counts. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the portal login page offers no email-link sign-in", () => {
  const src = code(LOGIN);

  it("does not call signInWithOtp", () => {
    expect(src).not.toContain("signInWithOtp");
  });

  it("has no magic-link mode, state or toggle", () => {
    for (const t of ["magic", "Magic", "setMode"]) expect(src).not.toContain(t);
  });

  it("still offers password login, so the portal is not left with zero login", () => {
    // LOOP 3 replaces this with OTP. Until then it is the only way in, and
    // removing it alongside the magic link would have locked every patient out.
    expect(src).toContain("signInWithPassword");
  });
});

describe("the portal login page HONOURS no email link either", () => {
  const src = code(LOGIN);

  it("does not read an access_token fragment", () => {
    // The half that is easy to miss: the button was only the offer.
    expect(src).not.toContain("access_token");
  });

  it("does not call setSession", () => {
    expect(src).not.toContain("setSession");
  });
});
