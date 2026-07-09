import { describe, expect, it } from "vitest";
import {
  ValidationError,
  escapeLike,
  parseCreatePatient,
  parseMergeInput,
  parseSearch,
  parseUpdatePatient,
} from "./validation";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("parseCreatePatient", () => {
  it("trims fullName and normalizes empty optionals to null", () => {
    const v = parseCreatePatient({
      fullName: "  Maria Santos  ",
      email: "",
      phone: "   ",
      nif: "123456789",
    });
    expect(v.fullName).toBe("Maria Santos");
    expect(v.email).toBeNull();
    expect(v.phone).toBeNull();
    expect(v.nif).toBe("123456789");
    expect(v.city).toBeNull();
  });

  it("rejects a blank fullName", () => {
    expect(() => parseCreatePatient({ fullName: "   " })).toThrow(ValidationError);
  });

  it("parses and trims profession, normalizing empty to null (W2-02 item 5)", () => {
    expect(parseCreatePatient({ fullName: "X", profession: "  Fisioterapeuta  " }).profession).toBe(
      "Fisioterapeuta",
    );
    expect(parseCreatePatient({ fullName: "X", profession: "" }).profession).toBeNull();
    expect(parseCreatePatient({ fullName: "X" }).profession).toBeNull();
  });

  it("parses and trims referralSource, normalizing empty to null (W5-11)", () => {
    expect(
      parseCreatePatient({ fullName: "X", referralSource: "  Redes sociais  " }).referralSource,
    ).toBe("Redes sociais");
    expect(parseCreatePatient({ fullName: "X", referralSource: "" }).referralSource).toBeNull();
    expect(parseCreatePatient({ fullName: "X" }).referralSource).toBeNull();
  });

  it("rejects an invalid email", () => {
    expect(() =>
      parseCreatePatient({ fullName: "X", email: "not-an-email" }),
    ).toThrow(/email/i);
  });

  it("rejects a non-ISO date", () => {
    expect(() =>
      parseCreatePatient({ fullName: "X", dateOfBirth: "14/04/1990" }),
    ).toThrow(/date/i);
  });

  it("accepts a valid ISO date", () => {
    expect(parseCreatePatient({ fullName: "X", dateOfBirth: "1990-04-14" }).dateOfBirth).toBe(
      "1990-04-14",
    );
  });

  it("rejects an over-long field", () => {
    expect(() =>
      parseCreatePatient({ fullName: "X", nif: "1".repeat(21) }),
    ).toThrow(ValidationError);
  });
});

describe("parseUpdatePatient", () => {
  it("only includes keys that were provided", () => {
    const v = parseUpdatePatient({ phone: "912345678" });
    expect(v).toEqual({ phone: "912345678" });
    expect("fullName" in v).toBe(false);
  });

  it("clears a field when an explicit empty value is provided", () => {
    expect(parseUpdatePatient({ city: "" })).toEqual({ city: null });
  });

  it("still validates provided values", () => {
    expect(() => parseUpdatePatient({ email: "bad" })).toThrow(ValidationError);
  });

  it("includes profession only when provided, clearing on explicit empty (W2-02 item 5)", () => {
    expect(parseUpdatePatient({ profession: "Osteopata" })).toEqual({ profession: "Osteopata" });
    expect(parseUpdatePatient({ profession: "" })).toEqual({ profession: null });
    expect("profession" in parseUpdatePatient({ phone: "912345678" })).toBe(false);
  });

  it("includes referralSource only when provided, clearing on explicit empty (W5-11)", () => {
    expect(parseUpdatePatient({ referralSource: "Website" })).toEqual({ referralSource: "Website" });
    expect(parseUpdatePatient({ referralSource: "" })).toEqual({ referralSource: null });
    expect("referralSource" in parseUpdatePatient({ phone: "912345678" })).toBe(false);
  });

  it("coerces contraindication flags to booleans, only when provided (W2-08)", () => {
    expect(parseUpdatePatient({ contraindicationEpilepsy: true })).toEqual({
      contraindicationEpilepsy: true,
    });
    // Anything not strictly true → false.
    expect(parseUpdatePatient({ contraindicationPregnancy: false })).toEqual({
      contraindicationPregnancy: false,
    });
    const out = parseUpdatePatient({ phone: "912345678" });
    expect("contraindicationEpilepsy" in out).toBe(false);
    expect("contraindicationPregnancy" in out).toBe(false);
  });
});

describe("parseMergeInput", () => {
  it("accepts two distinct uuids", () => {
    expect(parseMergeInput({ survivorId: UUID_A, loserId: UUID_B })).toEqual({
      survivorId: UUID_A,
      loserId: UUID_B,
    });
  });

  it("rejects merging a patient into itself", () => {
    expect(() => parseMergeInput({ survivorId: UUID_A, loserId: UUID_A })).toThrow(
      /itself/i,
    );
  });

  it("rejects non-uuid ids", () => {
    expect(() => parseMergeInput({ survivorId: "x", loserId: UUID_B })).toThrow(
      ValidationError,
    );
  });
});

describe("parseSearch", () => {
  it("collapses whitespace and extracts digits", () => {
    expect(parseSearch("  Maria   Santos 912-345 ")).toEqual({
      text: "Maria Santos 912-345",
      digits: "912345",
    });
  });

  it("returns empty text for a blank query", () => {
    expect(parseSearch("   ").text).toBe("");
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});
