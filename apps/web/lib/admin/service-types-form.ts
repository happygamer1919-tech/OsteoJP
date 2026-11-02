/**
 * TIPOS DE MARCACAO - reading the "Tipo de Marcacoes / Tabelas de Precos" table
 * out of a posted form, and the one rule each column follows.
 *
 * PURE MODULE: no DB, no `server-only`, so every rule here is unit-tested
 * (service-types-form.test.ts). The server action calls it and hands the result
 * to `saveServiceTypesTable` (./services.ts), which writes it in one transaction.
 *
 * THE FORM. The whole table is ONE form (Fisiozero's single "Guardar alteracoes"
 * button). Each control carries the row's id in its name, `<field>__<id>`, and a
 * hidden `row` input per row says which rows were on the screen. A checkbox
 * that is off posts nothing, which is why the row list is needed: a row present
 * with no `active__<id>` is a row switched OFF, not a row that was not there.
 *
 * WHAT A BAD VALUE DOES. One invalid cell refuses the whole save (FormError),
 * the same all-or-nothing the one button promises: a table half saved is a
 * table nobody can trust.
 */
import {
  SERVICE_COLOR_PATTERN,
  isServiceFollowUpDays,
  isServiceVatRate,
  isVatExemptionCode,
  type ServiceFollowUpDays,
  type ServiceVatRate,
  type VatExemptionCode,
} from "@osteojp/db";

export class ServiceTypesFormError extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
    this.name = "ServiceTypesFormError";
  }
}

/** The colour a colour input shows for a type with none chosen (Fisiozero's white). */
export const UNSET_COLOR_SHOWN = "#FFFFFF";

export type ServiceTypeFields = {
  name: string;
  followUpDays: ServiceFollowUpDays | null;
  priceCents: number | null;
  vatRate: ServiceVatRate | null;
  vatExemptionCode: VatExemptionCode | null;
};

export type ServiceTypeRow = ServiceTypeFields & {
  id: string;
  isActive: boolean;
  /** undefined = leave the stored colour as it is. */
  color: string | null | undefined;
  smsReminders: boolean;
  patientBookable: boolean;
  durationMin: number;
};

export type NewServiceType = ServiceTypeFields & { durationMin: number };

type Entries = Iterable<[string, FormDataEntryValue]>;

function toMap(entries: Entries): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [k, v] of entries) {
    if (typeof v !== "string") continue;
    const list = m.get(k) ?? [];
    list.push(v);
    m.set(k, list);
  }
  return m;
}

export function parseName(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) throw new ServiceTypesFormError("name");
  return t;
}

/** "75.00", "75,5", "75" to cents; empty is "no price". */
export function parsePriceCents(raw: string | undefined): number | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) throw new ServiceTypesFormError("price");
  return Math.round(Number(t.replace(",", ".")) * 100);
}

export function parseDuration(raw: string | undefined): number {
  const t = (raw ?? "").trim();
  if (!/^\d+$/.test(t)) throw new ServiceTypesFormError("duration");
  const n = Number(t);
  if (n <= 0) throw new ServiceTypesFormError("duration");
  return n;
}

export function parseVatRate(raw: string | undefined): ServiceVatRate | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!/^\d+$/.test(t) || !isServiceVatRate(n)) throw new ServiceTypesFormError("vat");
  return n;
}

export function parseVatExemptionCode(raw: string | undefined): VatExemptionCode | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (!isVatExemptionCode(t)) throw new ServiceTypesFormError("vatReason");
  return t;
}

export function parseFollowUpDays(raw: string | undefined): ServiceFollowUpDays | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!/^\d+$/.test(t) || !isServiceFollowUpDays(n)) throw new ServiceTypesFormError("followUp");
  return n;
}

/**
 * The colour cell. A colour input always holds a colour, so a type with none
 * chosen is SHOWN as white and posts white back. `was` is the stored value the
 * page rendered ("" for none): white posted over "none" means untouched and
 * keeps NULL; anything else is stored in capitals.
 */
export function parseColor(raw: string | undefined, was: string | undefined): string | null | undefined {
  const t = (raw ?? "").trim().toUpperCase();
  if (!t) return undefined;
  if (!SERVICE_COLOR_PATTERN.test(t)) throw new ServiceTypesFormError("color");
  if ((was ?? "") === "" && t === UNSET_COLOR_SHOWN) return undefined;
  return t;
}

const first = (m: Map<string, string[]>, k: string): string | undefined => m.get(k)?.[0];

/** The whole table, one row per hidden `row` input, in screen order. */
export function parseServiceTypesTable(entries: Entries): ServiceTypeRow[] {
  const m = toMap(entries);
  const ids = m.get("row") ?? [];
  if (ids.length === 0) throw new ServiceTypesFormError("rows");
  if (new Set(ids).size !== ids.length) throw new ServiceTypesFormError("rows");
  return ids.map((id) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceTypesFormError("rows");
    return {
      id,
      name: parseName(first(m, `name__${id}`)),
      followUpDays: parseFollowUpDays(first(m, `followUp__${id}`)),
      priceCents: parsePriceCents(first(m, `price__${id}`)),
      vatRate: parseVatRate(first(m, `vat__${id}`)),
      vatExemptionCode: parseVatExemptionCode(first(m, `vatReason__${id}`)),
      isActive: m.has(`active__${id}`),
      color: parseColor(first(m, `color__${id}`), first(m, `colorWas__${id}`)),
      smsReminders: m.has(`sms__${id}`),
      patientBookable: m.has(`agenda__${id}`),
      durationMin: parseDuration(first(m, `duration__${id}`)),
    };
  });
}

/** The new-type row under the table ("Inserir Novo Tipo de Marcacao"). */
export function parseNewServiceType(entries: Entries): NewServiceType {
  const m = toMap(entries);
  return {
    name: parseName(first(m, "name")),
    followUpDays: parseFollowUpDays(first(m, "followUp")),
    priceCents: parsePriceCents(first(m, "price")),
    vatRate: parseVatRate(first(m, "vat")),
    vatExemptionCode: parseVatExemptionCode(first(m, "vatReason")),
    durationMin: parseDuration(first(m, "durationMin")),
  };
}

/** "75.00" for 7500, "" for no price. The table's price cell. */
export function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}
