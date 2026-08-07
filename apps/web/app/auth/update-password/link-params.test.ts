/**
 * LE-auth-recovery-deadend — what arrives on the set-password URL.
 *
 * This is the parsing that five verification rounds could not pin down, because
 * the page erased its own evidence before a human could read the address bar.
 * It is a pure module now, so the question is answerable without a browser.
 */
import { describe, it, expect } from "vitest";
import { readLinkParams, verifiableOtpType } from "./link-params";

describe("the new shape: token_hash in the QUERY", () => {
  it("reads the token and type our own emails send", () => {
    const p = readLinkParams("?token_hash=abc123&type=recovery", "");
    expect(p.tokenHash).toBe("abc123");
    expect(p.type).toBe("recovery");
    expect(p.errorCode).toBeNull();
  });

  it("reads the invite variant the same way", () => {
    const p = readLinkParams("?token_hash=abc123&type=invite", "");
    expect(verifiableOtpType(p.type)).toBe("invite");
  });

  /**
   * WHY THE QUERY AND NOT THE FRAGMENT. auth-js deletes the `code` search param
   * during detectSessionInUrl and replaceState's the URL
   * (GoTrueClient.js:3062-3063). It deletes "code", not "token_hash" - so our own
   * param survives a library that was removing the evidence from under the old
   * implementation.
   */
  it("survives alongside a `code` param, which the library removes and ours is not", () => {
    const p = readLinkParams("?code=xyz&token_hash=abc123&type=recovery", "");
    expect(p.tokenHash).toBe("abc123");
  });
});

describe("the OTP type is narrowed, never forwarded", () => {
  it("accepts exactly the two flows that land here", () => {
    expect(verifiableOtpType("recovery")).toBe("recovery");
    expect(verifiableOtpType("invite")).toBe("invite");
  });

  /**
   * A crafted link must not be able to borrow this page to perform a
   * verification it is not for. `verifyOtp` accepts several types; forwarding an
   * arbitrary one straight from the URL would hand that choice to the sender.
   */
  it("refuses every other type, including ones verifyOtp would otherwise accept", () => {
    for (const t of ["email", "signup", "email_change", "magiclink", "sms", "phone_change", "", null]) {
      expect(verifiableOtpType(t)).toBeNull();
    }
  });
});

describe("the legacy shape: the verify redirect's fragment", () => {
  it("reads an error out of the fragment", () => {
    const p = readLinkParams("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
    expect(p.errorCode).toBe("otp_expired");
    expect(p.hadHash).toBe(true);
    expect(p.tokenHash).toBeNull();
  });

  it("reads an error out of the QUERY too, which the old page could not", () => {
    // Under PKCE the verify redirect returns errors as query params. The old
    // implementation read only window.location.hash, so it saw nothing and
    // settled "invalid" - the exact screen Ivan reported, on a pristine link.
    const p = readLinkParams("?error=access_denied&error_code=otp_expired", "");
    expect(p.errorCode).toBe("otp_expired");
    expect(p.hadHash).toBe(false);
  });

  it("distinguishes a failed verify redirect from someone typing the URL", () => {
    expect(readLinkParams("", "#type=recovery").hadHash).toBe(true);
    expect(readLinkParams("", "").hadHash).toBe(false);
  });
});

/**
 * THE DIAGNOSTIC LINE. A failure screen that cannot say what failed cost this
 * project five verification rounds on a link that has to be aged in a real inbox
 * to reproduce.
 */
describe("the raw capture, which the error screen shows", () => {
  it("reports what arrived, from both the query and the fragment", () => {
    const p = readLinkParams("?type=recovery", "#error_code=otp_expired");
    expect(p.raw).toContain("query.type=recovery");
    expect(p.raw).toContain("hash.error_code=otp_expired");
  });

  it("says so plainly when nothing arrived at all", () => {
    expect(readLinkParams("", "").raw).toBe("(nothing arrived on the URL)");
  });

  /**
   * PRESENCE IS DIAGNOSTIC; VALUE IS NOT. A token_hash is a live credential
   * until redeemed and the access/refresh tokens are a session. The screen is
   * shown to a person who may be sharing it in a support thread.
   */
  it("REDACTS every secret while still reporting that it was there", () => {
    const p = readLinkParams(
      "?token_hash=supersecrettoken&code=pkcecode",
      "#access_token=aaa&refresh_token=bbb&type=recovery",
    );
    for (const secret of ["supersecrettoken", "pkcecode", "aaa", "bbb"]) {
      expect(p.raw).not.toContain(secret);
    }
    // ...but the presence, and the length, are reported.
    expect(p.raw).toContain("query.token_hash=<16 chars>");
    expect(p.raw).toContain("hash.access_token=<3 chars>");
    expect(p.raw).toContain("hash.type=recovery");
  });

  it("still exposes the token to the CALLER, since redeeming it is the point", () => {
    // The redaction is for DISPLAY. `tokenHash` itself must be the real value.
    const p = readLinkParams("?token_hash=supersecrettoken&type=recovery", "");
    expect(p.tokenHash).toBe("supersecrettoken");
  });
});
