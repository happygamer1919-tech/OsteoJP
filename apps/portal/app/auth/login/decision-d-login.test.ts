/**
 * Decision D enforcement on the login surface — W13-03, superseding
 * SEC-portal-magic-link.
 *
 * Decision D (WAVE-13.md §1.4): "patient login is a 6-digit SMS OTP, phone only,
 * with a trusted device of 30 days. No password, no magic link, no session
 * minted from any other artefact."
 *
 * WHAT CHANGED AND WHY THE THIRD ASSERTION INVERTED. The 2026-08-05 version of
 * this file asserted the OPPOSITE of what it asserts now — that the login page
 * still called `signInWithPassword`, "so the portal is not left with zero
 * login". That was correct on the day it was written: the magic-link removal
 * would otherwise have locked every patient out, and LOOP 3 had built no
 * replacement yet. The condition it named has been met — the OTP screens are the
 * replacement — so the guard now points the other way. It is the same rule
 * throughout: exactly one way in, and it is the one Decision D names.
 *
 * THE THREE DELETED SCREENS ARE ASSERTED GONE, not just unlinked. Password
 * recovery and account activation each minted a Supabase session for a patient,
 * and `/auth/callback` was the code-exchange that completed both. Leaving any of
 * them reachable would have kept a second door open with no sign on it: a
 * patient with no password to recover would still have been able to walk a
 * recovery email into a live session.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const HERE = __dirname;
const AUTH_ROOT = join(HERE, "..");

/** Comments discuss the forbidden names; only code counts. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Every source file the login flow is built from. */
const FLOW = ["page.tsx", "LoginOtp.tsx", "actions.ts", "state.ts"].map((f) => join(HERE, f));

describe("the portal login offers no email-link sign-in", () => {
  for (const file of FLOW) {
    const src = code(file);
    const name = file.replace(`${HERE}/`, "");

    it(`${name} does not call signInWithOtp`, () => {
      expect(src).not.toContain("signInWithOtp");
    });

    it(`${name} has no magic-link mode, state or toggle`, () => {
      for (const t of ["magic", "Magic"]) expect(src).not.toContain(t);
    });

    it(`${name} does not read an access_token fragment`, () => {
      // The half that is easy to miss: the button was only the offer.
      expect(src).not.toContain("access_token");
    });

    it(`${name} does not call setSession`, () => {
      expect(src).not.toContain("setSession");
    });
  }
});

describe("the portal login offers no password either — Decision D, phone only", () => {
  for (const file of FLOW) {
    const src = code(file);
    const name = file.replace(`${HERE}/`, "");

    it(`${name} does not call signInWithPassword`, () => {
      // INVERTED FROM THE 2026-08-05 VERSION. See the header: the OTP screens are
      // the replacement that assertion was waiting for.
      expect(src).not.toContain("signInWithPassword");
    });

    it(`${name} touches Supabase auth at all`, () => {
      expect(src).not.toContain("supabase");
      expect(src).not.toContain("Supabase");
    });

    it(`${name} renders no password field`, () => {
      expect(src).not.toContain('type="password"');
      expect(src).not.toContain("login_password");
    });
  }
});

describe("the password-auth screens are deleted, not merely unlinked", () => {
  for (const gone of [
    "reset-password/page.tsx",
    "activate/page.tsx",
    "callback/route.ts",
  ]) {
    it(`/auth/${gone} does not exist`, () => {
      expect(existsSync(join(AUTH_ROOT, gone))).toBe(false);
    });
  }

  it("no portal source links to a deleted auth screen", () => {
    // A dead link on a patient screen is a 404 the patient meets, not a tidiness
    // problem — the account screen carried one to /auth/reset-password.
    const PORTAL_ROOT = join(HERE, "..", "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          const src = code(full);
          if (/["']\/auth\/(reset-password|activate|callback)/.test(src)) {
            offenders.push(full.replace(`${PORTAL_ROOT}/`, ""));
          }
        }
      }
    };
    walk(PORTAL_ROOT);
    expect(offenders).toEqual([]);
  });
});
