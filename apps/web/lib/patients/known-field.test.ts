import { describe, expect, it } from "vitest";
import { knownField, shouldPersistCapturedValue } from "./known-field";

describe("knownField", () => {
  it("treats a stored value as known", () => {
    expect(knownField("123456789")).toEqual({ kind: "known", value: "123456789" });
  });

  it("trims, so surrounding spaces do not make a blank look known", () => {
    expect(knownField("  123456789  ")).toEqual({ kind: "known", value: "123456789" });
  });

  it("treats null, undefined, empty and whitespace as not on file", () => {
    expect(knownField(null).kind).toBe("unknown");
    expect(knownField(undefined).kind).toBe("unknown");
    expect(knownField("").kind).toBe("unknown");
    expect(knownField("   ").kind).toBe("unknown");
  });
});

describe("shouldPersistCapturedValue", () => {
  it("fills an empty field from what the user typed", () => {
    // The whole point: asked once, then never again.
    expect(shouldPersistCapturedValue(null, "123456789")).toBe(true);
    expect(shouldPersistCapturedValue("", "123456789")).toBe(true);
    expect(shouldPersistCapturedValue("   ", "123456789")).toBe(true);
  });

  it("NEVER overwrites a value the record already holds", () => {
    // A one-off NIF typed onto a single declaration (a patient billing to a
    // company, a correction for one document) must not rewrite the patient's
    // own fiscal number, and a typo must not become the record.
    expect(shouldPersistCapturedValue("111111111", "222222222")).toBe(false);
    expect(shouldPersistCapturedValue("111111111", "111111111")).toBe(false);
  });

  it("does not clear a stored value when the user leaves the field empty", () => {
    expect(shouldPersistCapturedValue("111111111", "")).toBe(false);
    expect(shouldPersistCapturedValue("111111111", null)).toBe(false);
  });

  it("writes nothing when neither side has anything", () => {
    expect(shouldPersistCapturedValue(null, null)).toBe(false);
    expect(shouldPersistCapturedValue("", "   ")).toBe(false);
  });
});
