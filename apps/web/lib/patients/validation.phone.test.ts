/**
 * GATE BL-1a (PHONE-01), through the layer the staff form saves with.
 *
 * The same table as packages/notify/src/patient-phone.test.ts, driven through
 * parseCreatePatient (the /patients/new form and the consultation stub) and
 * parseUpdatePatient (the edit form). Every accepted shape asserts the value that
 * reaches the column BYTE FOR BYTE; every refusal asserts a ValidationError on the
 * phone field with the parser's sentence.
 */
import { describe, expect, it } from "vitest";
import { parsePatientPhone } from "@osteojp/notify";
import { ACCEPTED, REFUSED } from "../../../../packages/notify/src/patient-phone.cases";
import { nifWithCheckDigit } from "./nif";
import { parseCreatePatient, parseUpdatePatient, ValidationError } from "./validation";

const VALID_NIF = nifWithCheckDigit("21234567");

function refusalOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e;
    throw e;
  }
  throw new Error("expected a ValidationError, nothing was thrown");
}

describe("parseCreatePatient stores every accepted phone shape as E.164", () => {
  for (const [input, stored] of ACCEPTED) {
    it(`${JSON.stringify(input)} -> ${stored}`, () => {
      expect(parseCreatePatient({ fullName: "X", nif: VALID_NIF, phone: input }).phone).toBe(stored);
    });
  }

  it("the consultation stub path (requireNif false) stores the same value", () => {
    for (const [input, stored] of ACCEPTED) {
      expect(parseCreatePatient({ fullName: "Walk-in", phone: input }, { requireNif: false }).phone).toBe(stored);
    }
  });

  it("no phone stays null", () => {
    expect(parseCreatePatient({ fullName: "X", nif: VALID_NIF, phone: "" }).phone).toBeNull();
    expect(parseCreatePatient({ fullName: "X", nif: VALID_NIF, phone: null }).phone).toBeNull();
    expect(parseCreatePatient({ fullName: "X", nif: VALID_NIF }).phone).toBeNull();
  });
});

describe("parseCreatePatient refuses a phone that cannot be normalised, on the phone field", () => {
  for (const [input] of REFUSED) {
    it(`${JSON.stringify(input)} is refused with the parser's sentence`, () => {
      const err = refusalOf(() => parseCreatePatient({ fullName: "X", nif: VALID_NIF, phone: input }));
      expect(err.field).toBe("phone");
      const parsed = parsePatientPhone(input);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(err.message).toBe(parsed.message);
    });
  }

  it("an over-long value is refused as too long, before it is parsed", () => {
    const err = refusalOf(() => parseCreatePatient({ fullName: "X", nif: VALID_NIF, phone: "9".repeat(33) }));
    expect(err.field).toBe("phone");
    expect(err.message).toBe("phone is too long");
  });
});

describe("parseUpdatePatient stores every accepted phone shape as E.164", () => {
  for (const [input, stored] of ACCEPTED) {
    it(`${JSON.stringify(input)} -> ${stored}`, () => {
      expect(parseUpdatePatient({ phone: input }).phone).toBe(stored);
      // A stored value that differs is no reason to skip validation.
      expect(parseUpdatePatient({ phone: input }, { storedPhone: "+351999999999" }).phone).toBe(stored);
    });
  }

  for (const [input] of REFUSED) {
    it(`${JSON.stringify(input)} is refused on the phone field when it is a new value`, () => {
      expect(refusalOf(() => parseUpdatePatient({ phone: input })).field).toBe("phone");
      expect(refusalOf(() => parseUpdatePatient({ phone: input }, { storedPhone: null })).field).toBe("phone");
    });
  }

  it("clearing the phone stores null", () => {
    expect(parseUpdatePatient({ phone: "" }, { storedPhone: "+351912345678" })).toEqual({ phone: null });
  });
});

describe("parseUpdatePatient: an unchanged legacy phone never blocks an unrelated edit", () => {
  // ~8,400 imported patients hold free-text phones. The edit form submits every
  // field, so without this arm fixing a postcode would be refused over a phone
  // nobody touched.
  it("an unchanged unparseable stored phone is not validated and not written", () => {
    const out = parseUpdatePatient({ phone: "912 345 67a", city: "Lisboa" }, { storedPhone: "912 345 67a" });
    expect(out).toEqual({ city: "Lisboa" });
    expect("phone" in out).toBe(false);
  });

  it("the comparison is on trimmed values", () => {
    const out = parseUpdatePatient({ phone: "  sem telefone " }, { storedPhone: "sem telefone" });
    expect("phone" in out).toBe(false);
  });

  it("an unchanged parseable legacy value is left as it is, not rewritten", () => {
    expect("phone" in parseUpdatePatient({ phone: "912 345 678" }, { storedPhone: "912 345 678" })).toBe(false);
  });

  it("an empty box over a null stored phone is unchanged too", () => {
    expect("phone" in parseUpdatePatient({ phone: "" }, { storedPhone: null })).toBe(false);
  });

  it("NEGATIVE CONTROL: the same legacy value typed as a CHANGE is refused", () => {
    // Stored differs, so the value is new and is validated in full.
    expect(refusalOf(() => parseUpdatePatient({ phone: "912 345 67a" }, { storedPhone: "912345678" })).field).toBe(
      "phone",
    );
    // No stored value supplied: validated as before.
    expect(refusalOf(() => parseUpdatePatient({ phone: "912 345 67a" })).field).toBe("phone");
  });
});
