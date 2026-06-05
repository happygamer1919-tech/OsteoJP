import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validatePassword } from "./password";

describe("validatePassword", () => {
  const ok = "abcd1234"; // 8 chars, letter + number, matches itself

  it("accepts a password meeting all rules with matching confirm", () => {
    expect(validatePassword(ok, ok)).toBeNull();
  });

  it("rejects a password shorter than the minimum", () => {
    expect(validatePassword("ab12", "ab12")).toBe("auth.setPassword.errTooShort");
    // Exactly MIN_PASSWORD_LENGTH passes the length gate.
    const atMin = "a".repeat(MIN_PASSWORD_LENGTH - 1) + "1";
    expect(validatePassword(atMin, atMin)).toBeNull();
  });

  it("requires at least one letter", () => {
    expect(validatePassword("12345678", "12345678")).toBe("auth.setPassword.errNoLetter");
  });

  it("requires at least one number", () => {
    expect(validatePassword("abcdefgh", "abcdefgh")).toBe("auth.setPassword.errNoNumber");
  });

  it("requires confirm to match", () => {
    expect(validatePassword(ok, "abcd1235")).toBe("auth.setPassword.errMismatch");
  });

  it("checks length before composition (priority order)", () => {
    // Too short AND no number — length wins.
    expect(validatePassword("ab", "ab")).toBe("auth.setPassword.errTooShort");
  });

  it("checks composition before mismatch", () => {
    // No number AND confirm differs — composition wins over mismatch.
    expect(validatePassword("abcdefgh", "xxxxxxxx")).toBe("auth.setPassword.errNoNumber");
  });
});
