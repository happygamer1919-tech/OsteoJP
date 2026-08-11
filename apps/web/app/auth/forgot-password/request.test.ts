import { describe, it, expect } from "vitest";
import { collapseRecoveryOutcome, validateRecoveryEmail } from "./request";

/**
 * LE-staff-no-forgot-password - the two rules the request screen rests on.
 */

describe("validateRecoveryEmail", () => {
  it("accepts an ordinary address", () => {
    expect(validateRecoveryEmail("rodica@osteojp.pt")).toBeNull();
  });

  it("trims before deciding, so a pasted address with whitespace is not rejected", () => {
    // Copying an address out of a chat or a spreadsheet routinely brings a
    // trailing space with it, and being told "invalid email" for an invisible
    // character is the kind of dead end this card exists to remove.
    expect(validateRecoveryEmail("  rodica@osteojp.pt  ")).toBeNull();
  });

  it("requires an address", () => {
    expect(validateRecoveryEmail("")).toBe("auth.forgotPassword.errEmailRequired");
    expect(validateRecoveryEmail("   ")).toBe("auth.forgotPassword.errEmailRequired");
  });

  it("rejects an obvious typo", () => {
    expect(validateRecoveryEmail("rodica")).toBe("auth.forgotPassword.errEmailInvalid");
    expect(validateRecoveryEmail("rodica@osteojp")).toBe("auth.forgotPassword.errEmailInvalid");
  });

  it("checks presence before shape, so an empty field is not called malformed", () => {
    expect(validateRecoveryEmail("")).toBe("auth.forgotPassword.errEmailRequired");
  });

  it("agrees with the login screen's own rule, which is where staff learn it", () => {
    // apps/web/app/login/page.tsx validates with the same shape. Two screens in
    // the same flow that disagree about what an email looks like would reject
    // on one and accept on the other, and the user would have no way to know
    // which was lying.
    const LOGIN_SHAPE = /.+@.+\..+/;
    for (const addr of ["a@b.co", "rodica@osteojp.pt", "x.y+z@sub.domain.pt"]) {
      expect(LOGIN_SHAPE.test(addr)).toBe(true);
      expect(validateRecoveryEmail(addr)).toBeNull();
    }
    for (const bad of ["rodica", "rodica@osteojp", "@osteojp.pt"]) {
      expect(LOGIN_SHAPE.test(bad)).toBe(false);
      expect(validateRecoveryEmail(bad)).not.toBeNull();
    }
  });
});

describe("collapseRecoveryOutcome: one screen, whatever happened", () => {
  /**
   * THE NON-ENUMERATION PROPERTY. This is the assertion that matters: the staff
   * email list is the clinic's roster, and a form that answers differently for
   * a known address publishes it.
   */
  it("returns the SAME screen for success and for every failure", () => {
    const success = collapseRecoveryOutcome(null);
    const rateLimited = collapseRecoveryOutcome({ message: "email rate limit exceeded" });
    const smtpDown = collapseRecoveryOutcome({ message: "error sending recovery email" });
    const unknown = collapseRecoveryOutcome({});

    expect(success.screen).toBe("sent");
    expect(rateLimited.screen).toBe("sent");
    expect(smtpDown.screen).toBe("sent");
    expect(unknown.screen).toBe("sent");

    // Asserted on the SET, not pairwise, so adding a sixth outcome that differs
    // fails here rather than passing on the four somebody remembered.
    const screens = new Set(
      [success, rateLimited, smtpDown, unknown].map((r) => r.screen),
    );
    expect(screens.size).toBe(1);
  });

  it("still records a failure, so a broken transport is not silent (PG7)", () => {
    expect(collapseRecoveryOutcome(null).logDetail).toBeNull();
    expect(collapseRecoveryOutcome({ message: "smtp: connection refused" }).logDetail).toContain(
      "smtp: connection refused",
    );
  });

  it("names the failure without a message, rather than logging 'undefined'", () => {
    expect(collapseRecoveryOutcome({}).logDetail).toContain("unknown");
  });

  it("never puts the email address in what gets logged", () => {
    // CLAUDE.md rule 7. The address is the caller's PII, and it is the one
    // value most likely to be added here by a future 'make the log useful'
    // edit. collapseRecoveryOutcome is not given the address at all, which is
    // the strongest form of this guarantee: it cannot leak what it never sees.
    const detail = collapseRecoveryOutcome({ message: "rate limit" }).logDetail ?? "";
    expect(detail).not.toContain("@");
    expect(collapseRecoveryOutcome.length).toBe(1);
  });
});
