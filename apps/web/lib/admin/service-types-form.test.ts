import { describe, expect, it } from "vitest";
import { VAT_EXEMPTION_CODES } from "@osteojp/db";
import {
  ServiceTypesFormError,
  UNSET_COLOR_SHOWN,
  parseSeenUpdatedAt,
  staleRowIds,
  centsToInput,
  parseColor,
  parseNewServiceType,
  parsePriceCents,
  parseServiceTypesTable,
  parseVatExemptionCode,
  parseVatRate,
  assertVatReason,
  formErrorCode,
  formErrorQuery,
  vatReasonBanner,
  vatReasonRowNames,
} from "./service-types-form";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function row(id: string, over: Record<string, string | null> = {}): [string, string][] {
  const base: Record<string, string | null> = {
    row: id,
    [`name__${id}`]: "Fisioterapia",
    [`price__${id}`]: "50.00",
    [`vat__${id}`]: "0",
    [`vatReason__${id}`]: "M07",
    [`active__${id}`]: "on",
    [`noColor__${id}`]: null,
    [`seen__${id}`]: "1793600000000",
    [`color__${id}`]: "#c27e3a",
    [`sms__${id}`]: "on",
    [`agenda__${id}`]: null,
    [`duration__${id}`]: "45",
    ...over,
  };
  return Object.entries(base).filter((e): e is [string, string] => e[1] !== null);
}

const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ServiceTypesFormError) return e.field;
    throw e;
  }
  return "admitted";
};

describe("the Tipos de Marcacao table form", () => {
  it("reads every column of every row, in screen order", () => {
    const rows = parseServiceTypesTable([
      ...row(A),
      ...row(B, {
        [`name__${B}`]: "  Reavaliação ",
        [`followUp__${B}`]: "2",
        [`price__${B}`]: "70,5",
        [`vat__${B}`]: "23",
        [`vatReason__${B}`]: "",
        [`active__${B}`]: null,
        [`seen__${B}`]: "1793600000123",
        [`color__${B}`]: "#ff6565",
        [`sms__${B}`]: null,
        [`agenda__${B}`]: "on",
      }),
    ]);
    expect(rows).toEqual([
      {
        id: A,
        name: "Fisioterapia",
        priceCents: 5000,
        vatRate: 0,
        vatExemptionCode: "M07",
        isActive: true,
        color: "#C27E3A",
        smsReminders: true,
        patientBookable: false,
        durationMin: 45,
        seenUpdatedAtMs: 1793600000000,
      },
      {
        id: B,
        name: "Reavaliação",
        priceCents: 7050,
        vatRate: 23,
        vatExemptionCode: null,
        isActive: false,
        color: "#FF6565",
        smsReminders: false,
        patientBookable: true,
        durationMin: 45,
        seenUpdatedAtMs: 1793600000123,
      },
    ]);
  });

  it("an unchecked switch or tag posts nothing and reads OFF, never 'not on the screen'", () => {
    const [r] = parseServiceTypesTable(row(A, { [`active__${A}`]: null, [`sms__${A}`]: null }));
    expect(r?.isActive).toBe(false);
    expect(r?.smsReminders).toBe(false);
  });

  it("refuses a table with no rows, a repeated row or a row id that is not a uuid", () => {
    expect(refused(() => parseServiceTypesTable([]))).toBe("rows");
    expect(refused(() => parseServiceTypesTable([...row(A), ["row", A]]))).toBe("rows");
    expect(refused(() => parseServiceTypesTable(row("x'; drop table services; --")))).toBe("rows");
  });

  it("one bad cell refuses the whole table", () => {
    expect(refused(() => parseServiceTypesTable([...row(A), ...row(B, { [`vat__${B}`]: "22" })]))).toBe("vat");
    expect(refused(() => parseServiceTypesTable(row(A, { [`name__${A}`]: "   " })))).toBe("name");
    expect(refused(() => parseServiceTypesTable(row(A, { [`duration__${A}`]: "0" })))).toBe("duration");
    expect(refused(() => parseServiceTypesTable(row(A, { [`duration__${A}`]: "" })))).toBe("duration");
  });

  it("the colour: 'Sem cor' ticked stores none, whatever the picker shows; unticked, any colour is stored in capitals, white included", () => {
    expect(parseColor(UNSET_COLOR_SHOWN.toLowerCase(), true)).toBeNull();
    expect(parseColor("#fee93d", true)).toBeNull();
    expect(parseColor("#ffffff", false)).toBe("#FFFFFF");
    expect(parseColor("#fee93d", false)).toBe("#FEE93D");
    expect(refused(() => parseColor("", false))).toBe("color");
    expect(refused(() => parseColor("red", false))).toBe("color");
    expect(refused(() => parseColor("#FFF", false))).toBe("color");
  });

  it("the table reads 'Sem cor' per row", () => {
    const [r] = parseServiceTypesTable(row(A, { [`noColor__${A}`]: "on" }));
    expect(r?.color).toBeNull();
  });

  it("what the page saw: seen__ is required and must be whole milliseconds", () => {
    expect(parseSeenUpdatedAt("1793600000000")).toBe(1793600000000);
    for (const bad of [undefined, "", "-1", "1.5", "abc", "2026-11-02T10:00:00Z"]) {
      expect(refused(() => parseSeenUpdatedAt(bad))).toBe("rows");
    }
    expect(refused(() => parseServiceTypesTable(row(A, { [`seen__${A}`]: null })))).toBe("rows");
  });

  it("stale rows: exactly those whose stored updated_at differs from what the page saw", () => {
    const current = new Map([
      [A, { updatedAt: new Date(1793600000000) }],
      [B, { updatedAt: new Date(1793600000124) }],
    ]);
    expect(
      staleRowIds(
        [
          { id: A, seenUpdatedAtMs: 1793600000000 },
          { id: B, seenUpdatedAtMs: 1793600000123 },
        ],
        current,
      ),
    ).toEqual([B]);
    expect(staleRowIds([{ id: A, seenUpdatedAtMs: 1793600000000 }], current)).toEqual([]);
    // A row the database no longer has is not "stale": it is not_found, decided by the caller.
    expect(staleRowIds([{ id: "gone", seenUpdatedAtMs: 1 }], current)).toEqual([]);
  });

  it("the price: euros with a point or a comma to cents; empty is no price; anything else refused", () => {
    expect(parsePriceCents("75.00")).toBe(7500);
    expect(parsePriceCents("24,37")).toBe(2437);
    expect(parsePriceCents("31.25")).toBe(3125);
    expect(parsePriceCents("0")).toBe(0);
    expect(parsePriceCents("")).toBeNull();
    for (const bad of ["-5", "1.234", "abc", "1e3", "5 €"]) expect(refused(() => parsePriceCents(bad))).toBe("price");
    expect(centsToInput(2437)).toBe("24.37");
    expect(centsToInput(null)).toBe("");
  });

  it("IVA and Motivo IVA admit exactly the listed values and empty", () => {
    expect([0, 6, 13, 23].map((r) => parseVatRate(String(r)))).toEqual([0, 6, 13, 23]);
    expect(parseVatRate("")).toBeNull();
    for (const bad of ["5", "22", "6.0", "x"]) expect(refused(() => parseVatRate(bad))).toBe("vat");
    expect(parseVatExemptionCode("M99")).toBe("M99");
    expect(parseVatExemptionCode("")).toBeNull();
    for (const bad of ["M03", "m07", "M07 - Isento artigo 9.º do CIVA"]) {
      expect(refused(() => parseVatExemptionCode(bad))).toBe("vatReason");
    }
  });

  it("the new-type row reads Fisiozero's five fields and OsteoJP's duration", () => {
    expect(
      parseNewServiceType([
        ["name", "Pilates"],
        ["price", "50"],
        ["vat", "0"],
        ["vatReason", "M07"],
        ["durationMin", "60"],
      ]),
    ).toEqual({ name: "Pilates", priceCents: 5000, vatRate: 0, vatExemptionCode: "M07", durationMin: 60 });
    expect(refused(() => parseNewServiceType([["name", ""], ["durationMin", "60"]]))).toBe("name");
  });

  describe("Q5: IVA 0% needs a Motivo (strategy, 2026-11-04)", () => {
    it("the rule itself: 0% with no Motivo is refused; 0% with one and no rate with none are admitted", () => {
      expect(refused(() => assertVatReason(0, null))).toBe("vatReasonRequired");
      expect(refused(() => assertVatReason(0, "M07"))).toBe("admitted");
      expect(refused(() => assertVatReason(null, null))).toBe("admitted");
      for (const r of [6, 13, 23] as const) {
        expect(refused(() => assertVatReason(r, null))).toBe("admitted");
      }
    });

    it("the table refuses a 0% row with no Motivo, whole table, any row", () => {
      expect(refused(() => parseServiceTypesTable(row(A, { [`vatReason__${A}`]: "" })))).toBe("vatReasonRequired");
      expect(refused(() => parseServiceTypesTable(row(A, { [`vatReason__${A}`]: null })))).toBe("vatReasonRequired");
      expect(
        refused(() => parseServiceTypesTable([...row(A), ...row(B, { [`vatReason__${B}`]: "" })])),
      ).toBe("vatReasonRequired");
    });

    it("the table admits 0% with a Motivo, no rate with none, and 6/13/23% with none", () => {
      expect(parseServiceTypesTable(row(A))[0]?.vatExemptionCode).toBe("M07");
      const unset = parseServiceTypesTable(row(A, { [`vat__${A}`]: "", [`vatReason__${A}`]: "" }))[0];
      expect([unset?.vatRate, unset?.vatExemptionCode]).toEqual([null, null]);
      for (const r of ["6", "13", "23"]) {
        expect(parseServiceTypesTable(row(A, { [`vat__${A}`]: r, [`vatReason__${A}`]: "" }))[0]?.vatRate).toBe(Number(r));
      }
    });

    it("the new-type row refuses 0% with no Motivo and admits it with one", () => {
      const base: [string, string][] = [["name", "Pilates"], ["price", "50"], ["durationMin", "60"]];
      expect(refused(() => parseNewServiceType([...base, ["vat", "0"], ["vatReason", ""]]))).toBe("vatReasonRequired");
      expect(refused(() => parseNewServiceType([...base, ["vat", "0"]]))).toBe("vatReasonRequired");
      expect(parseNewServiceType([...base, ["vat", ""], ["vatReason", ""]]).vatRate).toBeNull();
      expect(parseNewServiceType([...base, ["vat", "0"], ["vatReason", "M99"]]).vatExemptionCode).toBe("M99");
    });

    it("a bad rate or code is still 'vat' / 'vatReason', not the Q5 refusal", () => {
      expect(refused(() => parseServiceTypesTable(row(A, { [`vat__${A}`]: "22", [`vatReason__${A}`]: "" })))).toBe("vat");
      expect(refused(() => parseServiceTypesTable(row(A, { [`vatReason__${A}`]: "M03" })))).toBe("vatReason");
    });

    it("the table's refusal carries EVERY row at fault, so the banner can name them all", () => {
      const caught = (fn: () => unknown): ServiceTypesFormError => {
        try {
          fn();
        } catch (e) {
          if (e instanceof ServiceTypesFormError) return e;
        }
        throw new Error("not refused");
      };
      const both = caught(() =>
        parseServiceTypesTable([
          ...row(A, { [`vatReason__${A}`]: "" }),
          ...row(B, { [`vatReason__${B}`]: "" }),
        ]),
      );
      expect([both.field, both.rowIds]).toEqual(["vatReasonRequired", [A, B]]);
      // A rename on A does not hide that B is the row at fault.
      const onlyB = caught(() =>
        parseServiceTypesTable([...row(A, { [`name__${A}`]: "Novo nome" }), ...row(B, { [`vatReason__${B}`]: "" })]),
      );
      expect(onlyB.rowIds).toEqual([B]);
      // Another bad cell still wins: it is reported as it always was.
      expect(
        refused(() =>
          parseServiceTypesTable([...row(A, { [`vatReason__${A}`]: "" }), ...row(B, { [`price__${B}`]: "abc" })]),
        ),
      ).toBe("price");
    });

    it("the redirect names the rows by id (vr), only for Q5 and only real uuids", () => {
      expect(formErrorQuery("mt", new ServiceTypesFormError("vatReasonRequired", [A, B]))).toBe(
        `mt=err:vat_reason&vr=${A},${B}`,
      );
      expect(formErrorQuery("mn", new ServiceTypesFormError("vatReasonRequired"))).toBe("mn=err:vat_reason");
      expect(formErrorQuery("mt", new ServiceTypesFormError("vatReasonRequired", ["x&y=1"]))).toBe("mt=err:vat_reason");
      expect(formErrorQuery("mt", new ServiceTypesFormError("price", [A]))).toBe("mt=err:invalid");
    });

    it("the banner names the types at fault, skipping ids the page does not know", () => {
      const names = new Map([
        [A, "Fisioterapia"],
        [B, "Reavaliação"],
      ]);
      expect(vatReasonRowNames(`${A},${B}`, names)).toEqual(["Fisioterapia", "Reavaliação"]);
      expect(vatReasonRowNames(`${B},${A},${B}`, names)).toEqual(["Reavaliação", "Fisioterapia"]);
      expect(vatReasonRowNames(`33333333-3333-4333-8333-333333333333,${A},junk`, names)).toEqual(["Fisioterapia"]);
      expect(vatReasonRowNames(undefined, names)).toEqual([]);
      expect(vatReasonBanner("Msg.", "Tipos de Marcação a corrigir:", ["Fisioterapia", "Reavaliação"])).toBe(
        "Msg. Tipos de Marcação a corrigir: Fisioterapia, Reavaliação.",
      );
      expect(vatReasonBanner("Msg.", "Tipos de Marcação a corrigir:", [])).toBe("Msg.");
    });

    it("the refusal has its own banner code; every other bad cell stays err:invalid", () => {
      expect(formErrorCode(new ServiceTypesFormError("vatReasonRequired"))).toBe("err:vat_reason");
      for (const f of ["vat", "vatReason", "price", "name", "rows", "color", "duration"]) {
        expect(formErrorCode(new ServiceTypesFormError(f))).toBe("err:invalid");
      }
    });
  });

  describe("B10: a Motivo only on IVA 0% (strategy, 2026-11-05)", () => {
    const caught = (fn: () => unknown): ServiceTypesFormError => {
      try {
        fn();
      } catch (e) {
        if (e instanceof ServiceTypesFormError) return e;
      }
      throw new Error("not refused");
    };
    const base: [string, string][] = [["name", "Pilates"], ["price", "50"], ["durationMin", "60"]];

    it("the rule itself: 6, 13 or 23% with a Motivo is refused, every one of the 33 codes", () => {
      expect(VAT_EXEMPTION_CODES).toHaveLength(33);
      for (const r of [6, 13, 23] as const) {
        for (const code of VAT_EXEMPTION_CODES) {
          expect(refused(() => assertVatReason(r, code))).toBe("vatReasonNotExempt");
        }
        expect(refused(() => assertVatReason(r, null))).toBe("admitted");
      }
      expect(refused(() => assertVatReason(0, "M07"))).toBe("admitted");
      expect(refused(() => assertVatReason(0, null))).toBe("vatReasonRequired");
      expect(refused(() => assertVatReason(null, null))).toBe("admitted");
    });

    it("the table refuses 23% with a Motivo, and 6% and 13% with one", () => {
      for (const r of ["23", "6", "13"]) {
        expect(refused(() => parseServiceTypesTable(row(A, { [`vat__${A}`]: r })))).toBe("vatReasonNotExempt");
      }
    });

    it("the table admits 23% with no Motivo and 0% with one, and still refuses 0% with none (Q5)", () => {
      const taxed = parseServiceTypesTable(row(A, { [`vat__${A}`]: "23", [`vatReason__${A}`]: "" }))[0];
      expect([taxed?.vatRate, taxed?.vatExemptionCode]).toEqual([23, null]);
      const exempt = parseServiceTypesTable(row(A))[0];
      expect([exempt?.vatRate, exempt?.vatExemptionCode]).toEqual([0, "M07"]);
      expect(refused(() => parseServiceTypesTable(row(A, { [`vatReason__${A}`]: "" })))).toBe("vatReasonRequired");
    });

    it("no rate ('--') is unchanged: admitted with no Motivo; with a Motivo it is admitted as before", () => {
      const unset = parseServiceTypesTable(row(A, { [`vat__${A}`]: "", [`vatReason__${A}`]: "" }))[0];
      expect([unset?.vatRate, unset?.vatExemptionCode]).toEqual([null, null]);
      expect(refused(() => assertVatReason(null, "M07"))).toBe("admitted");
      expect(parseServiceTypesTable(row(A, { [`vat__${A}`]: "" }))[0]?.vatExemptionCode).toBe("M07");
      expect(parseNewServiceType([...base, ["vat", ""], ["vatReason", ""]]).vatRate).toBeNull();
    });

    it("the table's refusal names EVERY row at fault, and a clean row is not named", () => {
      const both = caught(() =>
        parseServiceTypesTable([
          ...row(A, { [`vat__${A}`]: "23" }),
          ...row(B, { [`vat__${B}`]: "6" }),
        ]),
      );
      expect([both.field, both.rowIds]).toEqual(["vatReasonNotExempt", [A, B]]);
      const onlyB = caught(() =>
        parseServiceTypesTable([...row(A), ...row(B, { [`vat__${B}`]: "13" })]),
      );
      expect(onlyB.rowIds).toEqual([B]);
      // Q5 is reported first when both happen in one save.
      const q5First = caught(() =>
        parseServiceTypesTable([...row(A, { [`vat__${A}`]: "23" }), ...row(B, { [`vatReason__${B}`]: "" })]),
      );
      expect([q5First.field, q5First.rowIds]).toEqual(["vatReasonRequired", [B]]);
      // Another bad cell still wins.
      expect(
        refused(() => parseServiceTypesTable([...row(A, { [`vat__${A}`]: "23" }), ...row(B, { [`price__${B}`]: "abc" })])),
      ).toBe("price");
    });

    it("the new-type row refuses 6, 13 or 23% with a Motivo and admits them with none", () => {
      for (const r of ["6", "13", "23"]) {
        expect(refused(() => parseNewServiceType([...base, ["vat", r], ["vatReason", "M07"]]))).toBe("vatReasonNotExempt");
        expect(parseNewServiceType([...base, ["vat", r], ["vatReason", ""]]).vatExemptionCode).toBeNull();
      }
    });

    it("its own banner code, and the redirect names the rows by id (vr)", () => {
      expect(formErrorCode(new ServiceTypesFormError("vatReasonNotExempt"))).toBe("err:vat_reason_not_exempt");
      expect(formErrorQuery("mt", new ServiceTypesFormError("vatReasonNotExempt", [A, B]))).toBe(
        `mt=err:vat_reason_not_exempt&vr=${A},${B}`,
      );
      expect(formErrorQuery("mn", new ServiceTypesFormError("vatReasonNotExempt"))).toBe("mn=err:vat_reason_not_exempt");
      expect(formErrorQuery("mt", new ServiceTypesFormError("vatReasonNotExempt", ["x&y=1"]))).toBe(
        "mt=err:vat_reason_not_exempt",
      );
    });
  });

  describe("Q9: FollowUP is not read from the form (strategy, 2026-11-04)", () => {
    it("a posted followUp value is ignored, valid or not, so the save cannot write it", () => {
      for (const v of ["2", "", "3", "dois"]) {
        const [r] = parseServiceTypesTable(row(A, { [`followUp__${A}`]: v }));
        expect(r).not.toHaveProperty("followUpDays");
      }
      const created = parseNewServiceType([
        ["name", "Pilates"],
        ["followUp", "2"],
        ["vat", ""],
        ["durationMin", "60"],
      ]);
      expect(created).not.toHaveProperty("followUpDays");
    });
  });
});
