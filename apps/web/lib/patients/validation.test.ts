import { describe, expect, it } from "vitest";
import {
  MAX_HEALTH_INSURANCE_ENTRIES,
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

  it("W12-25: parses the decoupled 'Outra' contraindication + free-text note", () => {
    const v = parseCreatePatient({
      fullName: "X",
      contraindicationOther: true,
      contraindicationOtherNote: "  Alergia a látex  ",
    });
    expect(v.contraindicationOther).toBe(true);
    expect(v.contraindicationOtherNote).toBe("Alergia a látex");
    // defaults: off + null when absent
    const d = parseCreatePatient({ fullName: "X" });
    expect(d.contraindicationOther).toBe(false);
    expect(d.contraindicationOtherNote).toBeNull();
    // empty note normalizes to null even when the flag is on
    expect(
      parseCreatePatient({ fullName: "X", contraindicationOther: true, contraindicationOtherNote: "" })
        .contraindicationOtherNote,
    ).toBeNull();
    // partial update only touches the keys present
    const u = parseUpdatePatient({ contraindicationOther: true });
    expect(u.contraindicationOther).toBe(true);
    expect("contraindicationOtherNote" in u).toBe(false);
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

  // PL-15b — the clinic became editable. Create already accepted it; update did
  // not, so a patient filed at the wrong clinic (or at none, which is every
  // patient registered before PL-15b) could never be corrected from the UI.
  it("accepts the clinic on update, clearing it on explicit empty", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(parseUpdatePatient({ primaryLocationId: id })).toEqual({ primaryLocationId: id });
    expect(parseUpdatePatient({ primaryLocationId: "" })).toEqual({ primaryLocationId: null });
    expect("primaryLocationId" in parseUpdatePatient({ phone: "912345678" })).toBe(false);
  });

  it("rejects a clinic id that is not a uuid", () => {
    expect(() => parseUpdatePatient({ primaryLocationId: "loc-lv" })).toThrow(ValidationError);
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
    // W5-21 — pacemaker flag coerces the same way, only when provided.
    expect(parseUpdatePatient({ contraindicationPacemaker: true })).toEqual({
      contraindicationPacemaker: true,
    });
    const out = parseUpdatePatient({ phone: "912345678" });
    expect("contraindicationEpilepsy" in out).toBe(false);
    expect("contraindicationPregnancy" in out).toBe(false);
    expect("contraindicationPacemaker" in out).toBe(false);
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

describe("sex is male or female or not recorded (PL-24)", () => {
  it("accepts male and female", () => {
    expect(parseCreatePatient({ fullName: "A", sex: "male" }).sex).toBe("male");
    expect(parseCreatePatient({ fullName: "A", sex: "female" }).sex).toBe("female");
  });

  it("treats a blank as not recorded, not as a third value", () => {
    expect(parseCreatePatient({ fullName: "A", sex: "" }).sex).toBeNull();
    expect(parseCreatePatient({ fullName: "A" }).sex).toBeNull();
  });

  // The removed <option> is a UI fact; this is the server-side half of it.
  // Without this, a hand-posted body could put "other" straight back into the
  // column the option was removed from.
  it("rejects 'other' on create and on update", () => {
    expect(() => parseCreatePatient({ fullName: "A", sex: "other" })).toThrow(ValidationError);
    expect(() => parseUpdatePatient({ sex: "other" })).toThrow(ValidationError);
  });

  it("rejects any other invented value", () => {
    expect(() => parseCreatePatient({ fullName: "A", sex: "masculino" })).toThrow(ValidationError);
  });

  it("leaves sex untouched when the update omits it", () => {
    expect("sex" in parseUpdatePatient({ fullName: "A" })).toBe(false);
  });
});

describe("health insurance numbers (PL-23)", () => {
  it("keeps a list of plans, each with its insurer", () => {
    const v = parseCreatePatient({
      fullName: "A",
      healthInsuranceNumbers: [
        { insurer: "ADSE", number: "123456" },
        { insurer: "Medis", number: "999" },
      ],
    });
    expect(v.healthInsuranceNumbers).toEqual([
      { insurer: "ADSE", number: "123456" },
      { insurer: "Medis", number: "999" },
    ]);
  });

  it("defaults to an empty list when the field is absent", () => {
    expect(parseCreatePatient({ fullName: "A" }).healthInsuranceNumbers).toEqual([]);
  });

  it("drops a row with no NUMBER - an abandoned half-filled row is not a plan", () => {
    const v = parseCreatePatient({
      fullName: "A",
      healthInsuranceNumbers: [
        { insurer: "ADSE", number: "" },
        { insurer: "", number: "" },
        { insurer: "Medis", number: "42" },
      ],
    });
    expect(v.healthInsuranceNumbers).toEqual([{ insurer: "Medis", number: "42" }]);
  });

  it("keeps a number with no insurer, since the number is the useful half", () => {
    const v = parseCreatePatient({
      fullName: "A",
      healthInsuranceNumbers: [{ insurer: "", number: "42" }],
    });
    expect(v.healthInsuranceNumbers).toEqual([{ insurer: null, number: "42" }]);
  });

  it("trims whitespace on both fields", () => {
    const v = parseCreatePatient({
      fullName: "A",
      healthInsuranceNumbers: [{ insurer: "  ADSE ", number: "  42  " }],
    });
    expect(v.healthInsuranceNumbers).toEqual([{ insurer: "ADSE", number: "42" }]);
  });

  it("rejects a non-list and a non-object entry rather than coercing", () => {
    expect(() =>
      parseCreatePatient({ fullName: "A", healthInsuranceNumbers: "ADSE 123" as never }),
    ).toThrow(ValidationError);
    expect(() =>
      parseCreatePatient({ fullName: "A", healthInsuranceNumbers: ["ADSE 123"] as never }),
    ).toThrow(ValidationError);
  });

  it("caps the number of plans so a scripted caller cannot bloat the column", () => {
    const many = Array.from({ length: MAX_HEALTH_INSURANCE_ENTRIES + 1 }, (_, i) => ({
      insurer: "X",
      number: String(i),
    }));
    expect(() => parseCreatePatient({ fullName: "A", healthInsuranceNumbers: many })).toThrow(
      ValidationError,
    );
  });

  it("leaves the column untouched when an update omits the key", () => {
    expect("healthInsuranceNumbers" in parseUpdatePatient({ fullName: "A" })).toBe(false);
  });

  it("clears the plans when an update sends an explicitly empty list", () => {
    expect(parseUpdatePatient({ healthInsuranceNumbers: [] }).healthInsuranceNumbers).toEqual([]);
  });
});
