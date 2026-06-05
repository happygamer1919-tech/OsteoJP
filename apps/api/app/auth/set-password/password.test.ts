import { describe, expect, it } from "vitest";
import { validatePassword, MIN_PASSWORD_LENGTH } from "./password";

describe("validatePassword (patient set-password)", () => {
  it("accepts a strong matching password", () => {
    expect(validatePassword("abcd1234", "abcd1234")).toBeNull();
  });

  it("rejects too short", () => {
    expect(validatePassword("a1", "a1")).toBe("auth.setPassword.errTooShort");
    expect("x".repeat(MIN_PASSWORD_LENGTH - 1).length).toBe(7);
  });

  it("rejects missing letter / number", () => {
    expect(validatePassword("12345678", "12345678")).toBe("auth.setPassword.errNoLetter");
    expect(validatePassword("abcdefgh", "abcdefgh")).toBe("auth.setPassword.errNoNumber");
  });

  it("rejects mismatch", () => {
    expect(validatePassword("abcd1234", "abcd9999")).toBe("auth.setPassword.errMismatch");
  });
});
