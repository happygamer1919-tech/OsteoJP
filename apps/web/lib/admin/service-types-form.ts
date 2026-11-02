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
 *
 * WHAT THE PAGE SAW. Each row also posts `seen__<id>`, the row's `updated_at`
 * in milliseconds as the page rendered it. `staleRowIds` compares it with the
 * stored value, so a save over a row somebody else changed in between is
 * refused rather than silently reverting their change (see
 * `saveServiceTypesTable`).
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
  /** null = "sem cor" (no colour). */
  color: string | null;
  smsReminders: boolean;
  patientBookable: boolean;
  durationMin: number;
  /** The row's `updated_at`, in milliseconds, as the page rendered it. */
  seenUpdatedAtMs: number;
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
 * The colour cell: a colour picker and an explicit "sem cor" box. "Sem cor"
 * ticked stores no colour, whatever the picker shows (a picker always shows a
 * colour, white for a type with none). Unticked, the picker's colour is stored
 * in capitals, white included.
 */
export function parseColor(raw: string | undefined, noColor: boolean): string | null {
  if (noColor) return null;
  const t = (raw ?? "").trim().toUpperCase();
  if (!SERVICE_COLOR_PATTERN.test(t)) throw new ServiceTypesFormError("color");
  return t;
}

/** `seen__<id>`: a non-negative whole number of milliseconds. */
export function parseSeenUpdatedAt(raw: string | undefined): number {
  const t = (raw ?? "").trim();
  if (!/^\d{1,15}$/.test(t)) throw new ServiceTypesFormError("rows");
  return Number(t);
}

/**
 * The rows somebody else changed since the page was drawn: the stored
 * `updated_at` differs from the one the page posted back. Pure, so the rule is
 * unit-tested apart from the database.
 */
export function staleRowIds(
  rows: readonly Pick<ServiceTypeRow, "id" | "seenUpdatedAtMs">[],
  current: ReadonlyMap<string, { updatedAt: Date }>,
): string[] {
  return rows
    .filter((r) => {
      const c = current.get(r.id);
      return c !== undefined && c.updatedAt.getTime() !== r.seenUpdatedAtMs;
    })
    .map((r) => r.id);
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
      color: parseColor(first(m, `color__${id}`), m.has(`noColor__${id}`)),
      smsReminders: m.has(`sms__${id}`),
      patientBookable: m.has(`agenda__${id}`),
      durationMin: parseDuration(first(m, `duration__${id}`)),
      seenUpdatedAtMs: parseSeenUpdatedAt(first(m, `seen__${id}`)),
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
