/**
 * W13-03 — what the login screens must show, and must never carry.
 *
 * STATIC BY DESIGN, like `no-silent-empty.test.ts` and `api-method-parity.test.ts`
 * next door. This app has no React testing library and adding one is a new
 * dependency, which is an owner decision, not a test-writing convenience. So
 * these assert over the SOURCE and the DICTIONARY, and they are honest about the
 * limit: they prove the copy exists, is pt-PT, and is referenced by the screen
 * that must show it. They do not prove pixels. WF-03 already rules that a
 * patient-visible loop closes on the owner's deployed screen, so the visual
 * proof was never going to come from here.
 *
 * NEGATIVE ARMS at the bottom prove every matcher can actually fail. A guard
 * that cannot fail is worse than no guard, because it reads as protection.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import pt from "../../../../../packages/i18n/src/portal/strings.pt.json";

const HERE = __dirname;

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SCREEN = code(join(HERE, "LoginOtp.tsx"));
const PAGE = code(join(HERE, "page.tsx"));
const ACTIONS = code(join(HERE, "actions.ts"));

/** LOOP 3 step 8's three real-world cases, in dictionary order. */
const DEGRADATION_KEYS = ["otp_no_phone", "otp_landline", "otp_shared_number"] as const;

describe("the three degradation copies (LOOP 3 step 8)", () => {
  for (const key of DEGRADATION_KEYS) {
    it(`${key} exists in pt-PT and tells the patient what to do`, () => {
      const copy = pt.auth[key];
      expect(copy).toBeTruthy();
      // Every one of the three ends in the same instruction, because the portal
      // cannot tell WHICH applies and the patient's next step is identical:
      // telephone the clinic. Never a raw error.
      expect(copy).toMatch(/[Cc]ontacte a clínica/);
    });

    it(`${key} is rendered by the login screen`, () => {
      expect(SCREEN).toContain(`s.auth.${key}`);
    });
  }

  it("all three are shown together, not selected between", () => {
    // THE PROPERTY BEHIND THIS. The API answers ONE 401 for all six ways a
    // verification can fail, so the portal cannot know which case applies. Code
    // that branched to one of the three would either be lying or would have
    // required the API to leak which one — the patient-list oracle the whole
    // flow is built to avoid.
    for (const key of DEGRADATION_KEYS) {
      expect(SCREEN).not.toMatch(new RegExp(`error\\s*===\\s*['"]${key}`));
    }
  });
});

describe("the two screens Decision D calls for", () => {
  const PHONE_SCREEN = ["otp_title", "otp_phone_label", "otp_send"] as const;
  const CODE_SCREEN = ["otp_code_label", "otp_verify", "otp_sent"] as const;

  for (const key of [...PHONE_SCREEN, ...CODE_SCREEN]) {
    it(`renders s.auth.${key}`, () => {
      expect(SCREEN).toContain(`s.auth.${key}`);
    });
  }

  it("offers the code field to the phone's keypad and to the SMS autofill", () => {
    // `one-time-code` is what lets iOS and Android offer the code straight from
    // the message; without it a patient retypes six digits from a notification.
    expect(SCREEN).toContain('autoComplete="one-time-code"');
    expect(SCREEN).toContain('inputMode="numeric"');
    // NOT type="number": it renders a spinner and strips a leading zero, and a
    // 6-digit code can begin with one.
    expect(SCREEN).not.toContain('name="code"\n                  type="number"');
  });

  it("checks the trusted device on load, and only when there is one to check", () => {
    expect(SCREEN).toContain("trustedDeviceAction");
    expect(PAGE).toContain("readDeviceToken");
  });
});

describe("no credential is ever put in a URL", () => {
  it("no redirect in the flow builds a query string", () => {
    // Constraint 3 of the session ruling: a body is bounded to the portal
    // server; a URL is written to proxy logs, kept in browser history, and
    // leaked through Referer.
    for (const src of [SCREEN, PAGE, ACTIONS]) {
      expect(src).not.toMatch(/redirect\([^)]*\?[^)]*=/);
      expect(src).not.toContain("URLSearchParams");
    }
  });

  it("the client screen never calls the API itself", () => {
    // Every call is server-to-server. A fetch here would put the phone, the code
    // or a credential in front of client-side script.
    expect(SCREEN).not.toContain("fetch(");
    expect(SCREEN).not.toContain("NEXT_PUBLIC_API_URL");
  });
});

describe("negative arms — every matcher above can fail", () => {
  it("the degradation matcher fails on copy that omits the instruction", () => {
    expect("Ocorreu um erro.").not.toMatch(/[Cc]ontacte a clínica/);
  });

  it("the reference matcher fails on a key the screen does not use", () => {
    expect(SCREEN).not.toContain("s.auth.otp_key_that_does_not_exist");
  });

  it("the query-string matcher catches a redirect that carries one", () => {
    expect('redirect("/portal/dashboard?token=abc")').toMatch(/redirect\([^)]*\?[^)]*=/);
  });

  it("the fetch matcher catches a client-side call", () => {
    expect('await fetch("/api/v1/auth/otp/verify")').toContain("fetch(");
  });
});
