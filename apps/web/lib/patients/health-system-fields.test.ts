import { describe, expect, it } from "vitest";
import { ValidationError, parseCreatePatient, parseUpdatePatient } from "./validation";
import { nifWithCheckDigit } from "./nif";

// Sistemas / SubSistemas (owner request 2026-11-02): the ficha's
// "Sistema/SubSistema" (a health_systems id) and "Nº da Entidade / Subsistema".
// The tenant check of the id is the action's (healthSystemSelectable); this
// file covers the shape only.

const NIF = nifWithCheckDigit("21234567");
const SYS = "33333333-3333-3333-3333-333333333333";

function refusalField(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ValidationError) return e.field;
    throw e;
  }
}

describe("Sistema/SubSistema on create", () => {
  it("absent or 'Seleccione' (empty) stores nothing", () => {
    const a = parseCreatePatient({ fullName: "A", nif: NIF });
    expect(a.healthSystemId).toBeNull();
    expect(a.healthSystemNumber).toBeNull();
    const b = parseCreatePatient({ fullName: "A", nif: NIF, healthSystemId: "", healthSystemNumber: "  " });
    expect(b.healthSystemId).toBeNull();
    expect(b.healthSystemNumber).toBeNull();
  });

  it("keeps a uuid and a trimmed number", () => {
    const v = parseCreatePatient({ fullName: "A", nif: NIF, healthSystemId: SYS, healthSystemNumber: " 1234 " });
    expect(v.healthSystemId).toBe(SYS);
    expect(v.healthSystemNumber).toBe("1234");
  });

  it("the two are independent: a number with no Sistema is kept", () => {
    const v = parseCreatePatient({ fullName: "A", nif: NIF, healthSystemNumber: "99" });
    expect(v.healthSystemId).toBeNull();
    expect(v.healthSystemNumber).toBe("99");
  });

  it("refuses a non-uuid Sistema and a number over 64 characters, each on its own field", () => {
    expect(refusalField(() => parseCreatePatient({ fullName: "A", nif: NIF, healthSystemId: "ADSE" }))).toBe(
      "healthSystemId",
    );
    expect(
      refusalField(() => parseCreatePatient({ fullName: "A", nif: NIF, healthSystemNumber: "9".repeat(65) })),
    ).toBe("healthSystemNumber");
    expect(
      refusalField(() => parseCreatePatient({ fullName: "A", nif: NIF, healthSystemNumber: "9".repeat(64) })),
    ).toBeNull();
  });

  it("leaves health_insurance_numbers alone", () => {
    const v = parseCreatePatient({
      fullName: "A",
      nif: NIF,
      healthSystemId: SYS,
      healthInsuranceNumbers: [{ insurer: "Médis", number: "1" }],
    });
    expect(v.healthInsuranceNumbers).toEqual([{ insurer: "Médis", number: "1" }]);
  });
});

describe("Sistema/SubSistema on update", () => {
  it("an omitted key is untouched; an empty one clears", () => {
    expect(parseUpdatePatient({ fullName: "A" })).not.toHaveProperty("healthSystemId");
    expect(parseUpdatePatient({ fullName: "A" })).not.toHaveProperty("healthSystemNumber");
    const cleared = parseUpdatePatient({ healthSystemId: "", healthSystemNumber: "" });
    expect(cleared.healthSystemId).toBeNull();
    expect(cleared.healthSystemNumber).toBeNull();
  });

  it("refuses a non-uuid Sistema", () => {
    expect(refusalField(() => parseUpdatePatient({ healthSystemId: "not-a-uuid" }))).toBe("healthSystemId");
  });

  it("the refusal the desk reads is the pt-PT sentence, never the field name", () => {
    for (const bad of ["not-a-uuid", 42]) {
      try {
        parseUpdatePatient({ healthSystemId: bad as never });
        throw new Error("accepted");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as Error).message).toBe(
          "O Sistema/SubSistema escolhido já não está disponível. Escolha outro.",
        );
      }
    }
  });
});
