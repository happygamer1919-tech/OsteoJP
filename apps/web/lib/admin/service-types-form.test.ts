import { describe, expect, it } from "vitest";
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
  parseFollowUpDays,
} from "./service-types-form";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function row(id: string, over: Record<string, string | null> = {}): [string, string][] {
  const base: Record<string, string | null> = {
    row: id,
    [`name__${id}`]: "Fisioterapia",
    [`followUp__${id}`]: "",
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
        followUpDays: null,
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
        followUpDays: 2,
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

  it("IVA, Motivo IVA and FollowUP admit exactly the listed values and empty", () => {
    expect([0, 6, 13, 23].map((r) => parseVatRate(String(r)))).toEqual([0, 6, 13, 23]);
    expect(parseVatRate("")).toBeNull();
    for (const bad of ["5", "22", "6.0", "x"]) expect(refused(() => parseVatRate(bad))).toBe("vat");
    expect(parseVatExemptionCode("M99")).toBe("M99");
    expect(parseVatExemptionCode("")).toBeNull();
    for (const bad of ["M03", "m07", "M07 - Isento artigo 9.º do CIVA"]) {
      expect(refused(() => parseVatExemptionCode(bad))).toBe("vatReason");
    }
    expect(parseFollowUpDays("2")).toBe(2);
    expect(parseFollowUpDays("")).toBeNull();
    for (const bad of ["1", "3", "dois"]) expect(refused(() => parseFollowUpDays(bad))).toBe("followUp");
  });

  it("the new-type row reads Fisiozero's five fields and OsteoJP's duration", () => {
    expect(
      parseNewServiceType([
        ["name", "Pilates"],
        ["followUp", ""],
        ["price", "50"],
        ["vat", "0"],
        ["vatReason", ""],
        ["durationMin", "60"],
      ]),
    ).toEqual({ name: "Pilates", followUpDays: null, priceCents: 5000, vatRate: 0, vatExemptionCode: null, durationMin: 60 });
    expect(refused(() => parseNewServiceType([["name", ""], ["durationMin", "60"]]))).toBe("name");
  });
});
