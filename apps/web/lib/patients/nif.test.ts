import { describe, expect, it } from "vitest";

import {
  CONSUMIDOR_FINAL_NIF,
  checkNif,
  isFichaIncomplete,
  isValidNif,
  nifWithCheckDigit,
  normalizeNif,
} from "./nif";

// Real-shaped NIFs, control digit computed rather than invented, so a change to
// the checksum cannot be "fixed" by editing the fixtures to match the bug.
const VALID_INDIVIDUAL = nifWithCheckDigit("21234567");
const VALID_COMPANY = nifWithCheckDigit("50000000");

describe("nifWithCheckDigit", () => {
  it("produces a 9-digit NIF its own validator accepts", () => {
    expect(VALID_INDIVIDUAL).toHaveLength(9);
    expect(isValidNif(VALID_INDIVIDUAL)).toBe(true);
    expect(isValidNif(VALID_COMPANY)).toBe(true);
  });

  it("rejects a stem that is not exactly 8 digits", () => {
    expect(() => nifWithCheckDigit("123")).toThrow();
    expect(() => nifWithCheckDigit("123456789")).toThrow();
  });
});

describe("normalizeNif", () => {
  it("strips the separators people actually type", () => {
    expect(normalizeNif("212 345 678")).toBe("212345678");
    expect(normalizeNif("212.345.678")).toBe("212345678");
    expect(normalizeNif("212-345-678")).toBe("212345678");
  });
});

describe("checkNif", () => {
  it("accepts a well-formed NIF, with or without separators", () => {
    expect(checkNif(VALID_INDIVIDUAL)).toBeNull();
    const spaced = `${VALID_INDIVIDUAL.slice(0, 3)} ${VALID_INDIVIDUAL.slice(3, 6)} ${VALID_INDIVIDUAL.slice(6)}`;
    expect(checkNif(spaced)).toBeNull();
  });

  it("reports empty for null, undefined and blank", () => {
    expect(checkNif(null)).toBe("empty");
    expect(checkNif(undefined)).toBe("empty");
    expect(checkNif("   ")).toBe("empty");
  });

  it("rejects anything that is not exactly nine digits", () => {
    expect(checkNif("12345678")).toBe("not_nine_digits");
    expect(checkNif("1234567890")).toBe("not_nine_digits");
    expect(checkNif("abcdefghi")).toBe("not_nine_digits");
    // The values a hurried user types to escape a required field.
    expect(checkNif("0")).toBe("not_nine_digits");
  });

  /**
   * "-" is made ENTIRELY of separators, so it normalizes to the empty string
   * and classifies as `empty`, not as malformed digits. That is the useful
   * answer: the user is told the NIF is required and pointed at the exemption,
   * rather than being told a dash has the wrong number of digits.
   */
  it("treats an all-separator input as empty, not as malformed", () => {
    expect(checkNif("-")).toBe("empty");
    expect(checkNif(" . - ")).toBe("empty");
  });

  /**
   * THE CASE THAT JUSTIFIES THE PREFIX RULE. "000000000" satisfies the mod-11
   * checksum (weighted sum 0 -> expected control 0, which it carries), so a
   * checksum-only validator accepts it. It is also the single likeliest thing
   * typed to get past a mandatory field.
   */
  it("rejects 000000000 even though it passes the checksum", () => {
    expect(checkNif("000000000")).toBe("bad_prefix");
  });

  it("rejects a valid-looking NIF whose control digit is wrong", () => {
    const good = VALID_INDIVIDUAL;
    const wrongDigit = String((Number(good[8]) + 1) % 10);
    expect(checkNif(`${good.slice(0, 8)}${wrongDigit}`)).toBe("bad_checksum");
  });

  /**
   * The consumidor-final number means "no NIF given" while looking like an
   * answer. Accepting it would make it the one-keystroke way to defeat the
   * requirement with nothing recording that it had been defeated.
   */
  it("rejects the consumidor final number by name, not as malformed", () => {
    expect(isValidNif(CONSUMIDOR_FINAL_NIF)).toBe(false);
    expect(checkNif(CONSUMIDOR_FINAL_NIF)).toBe("consumidor_final");
  });

  it("accepts every prefix in real circulation", () => {
    for (const stem of ["10000000", "20000000", "30000000", "45000000", "50000000", "60000000", "70000000", "71000000", "72000000", "74000000", "75000000", "77000000", "78000000", "79000000", "80000000", "90000000", "91000000", "98000000", "99000000"]) {
      expect(checkNif(nifWithCheckDigit(stem))).toBeNull();
    }
  });

  it("rejects prefixes that are not issued", () => {
    expect(checkNif(nifWithCheckDigit("40000000"))).toBe("bad_prefix");
  });
});

describe("isFichaIncomplete", () => {
  it("is true only when there is neither a NIF nor an exemption", () => {
    expect(isFichaIncomplete({ nif: null, nifExempt: false })).toBe(true);
    expect(isFichaIncomplete({ nif: "", nifExempt: false })).toBe(true);
  });

  it("is false for a patient who has a NIF", () => {
    expect(isFichaIncomplete({ nif: VALID_INDIVIDUAL, nifExempt: false })).toBe(false);
  });

  /**
   * An exempted patient has NO NIF and is nonetheless complete: the absence is
   * recorded and explained. Conflating the two is what would put a permanent
   * "incomplete" warning on a foreign patient whose ficha is finished.
   */
  it("is false for an exempted patient, who has no NIF but is not incomplete", () => {
    expect(isFichaIncomplete({ nif: null, nifExempt: true })).toBe(false);
  });
});
