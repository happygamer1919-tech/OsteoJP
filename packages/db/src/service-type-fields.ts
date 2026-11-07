/**
 * TIPOS DE MARCACAO - the enumerated values of the five services columns the
 * pending migration adds (packages/db/migrations-pending/
 * NEXT-AFTER-0109_services_booking_type_fields.sql).
 *
 * ONE LIST, THREE READERS. The migration's CHECKs, the Drizzle schema's CHECKs
 * and the admin screen's dropdowns must name the same values, and a copy in each
 * is how they would come to disagree. tests/service-type-fields.test.ts reads the
 * migration file and fails if its CHECK lists anything other than these.
 *
 * WHERE THE VALUES COME FROM. Fisiozero's "Tipo de Marcacoes / Tabelas de Precos"
 * screen, read in a browser session on 2026-11-02 (the clinic asked for that
 * screen copied exactly). The VAT rates are the four Fisiozero offers. The
 * exemption reasons are the 33 its dropdown lists, with Fisiozero's own wording;
 * M31 to M34 were abbreviated in that session and are written here in full.
 *
 * CONFIRMED AGAINST THE AT TABLE. The R4 reviewer of 2026-11-02 checked the set
 * against the Autoridade Tributaria's official "Tabela dos Codigos de Motivo de
 * Isencao", version 4.0 of 18-06-2026: it lists 33 codes, exactly the 33 below,
 * and M31 to M34 are the autoliquidacao codes of Artigo 2.º n.º 1 alineas j),
 * l), m) and n) do CIVA as written here.
 */

/** The VAT percentages an appointment type may carry ("IVA"). */
export const SERVICE_VAT_RATES = [0, 6, 13, 23] as const;
export type ServiceVatRate = (typeof SERVICE_VAT_RATES)[number];

/** The follow-up rules ("FollowUP"): null is "nenhum", 2 is "2 dias". */
export const SERVICE_FOLLOW_UP_DAYS = [2] as const;
export type ServiceFollowUpDays = (typeof SERVICE_FOLLOW_UP_DAYS)[number];

/** A stored colour: '#RRGGBB' in capitals. */
export const SERVICE_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

/**
 * The AT VAT exemption reasons ("Motivo IVA"), in Fisiozero's order and with its
 * wording. The label is shown as written in both locales: it is the legal name
 * of the code, not product copy.
 */
export const VAT_EXEMPTION_REASONS = [
  { code: "M01", label: "M01 - Artigo 16.º n.º 6 do CIVA" },
  { code: "M02", label: "M02 - Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de junho" },
  { code: "M04", label: "M04 - Isento artigo 13.º do CIVA" },
  { code: "M05", label: "M05 - Isento artigo 14.º do CIVA" },
  { code: "M06", label: "M06 - Isento artigo 15.º do CIVA" },
  { code: "M07", label: "M07 - Isento artigo 9.º do CIVA" },
  { code: "M09", label: "M09 - IVA - não confere direito a dedução" },
  { code: "M10", label: "M10 - IVA - regime de isenção" },
  { code: "M11", label: "M11 - Regime particular do tabaco" },
  { code: "M12", label: "M12 - Regime da margem de lucro - Agências de viagens" },
  { code: "M13", label: "M13 - Regime da margem de lucro - Bens em segunda mão" },
  { code: "M14", label: "M14 - Regime da margem de lucro - Objetos de arte" },
  { code: "M15", label: "M15 - Regime da margem de lucro - Objetos de coleção e antiguidades" },
  { code: "M16", label: "M16 - Isento artigo 14.º do RITI" },
  { code: "M19", label: "M19 - Outras isenções" },
  { code: "M20", label: "M20 - IVA - regime forfetário" },
  { code: "M21", label: "M21 - IVA - não confere direito à dedução" },
  { code: "M25", label: "M25 - Mercadorias à consignação" },
  { code: "M26", label: "M26 - Isenção de IVA com direito à dedução no cabaz alimentar" },
  { code: "M30", label: "M30 - IVA - autoliquidação - Artigo 2.º n.º 1 alínea i) do CIVA" },
  // M31 to M34: written in full; confirmed against the AT table V4.0, see the header.
  { code: "M31", label: "M31 - IVA - autoliquidação - Artigo 2.º n.º 1 alínea j) do CIVA" },
  { code: "M32", label: "M32 - IVA - autoliquidação - Artigo 2.º n.º 1 alínea l) do CIVA" },
  { code: "M33", label: "M33 - IVA - autoliquidação - Artigo 2.º n.º 1 alínea m) do CIVA" },
  { code: "M34", label: "M34 - IVA - autoliquidação - Artigo 2.º n.º 1 alínea n) do CIVA" },
  { code: "M35", label: "M35 - IVA - autoliquidação - Artigo 2.º n.º 1 alínea j) do CIVA - Verba 2.42 da Lista I" },
  { code: "M40", label: "M40 - IVA - autoliquidação - Artigo 6.º n.º 6 alínea a) do CIVA" },
  { code: "M41", label: "M41 - IVA - autoliquidação - Artigo 8.º n.º 3 do RITI" },
  { code: "M42", label: "M42 - IVA - autoliquidação - Decreto-Lei n.º 21/2007" },
  { code: "M43", label: "M43 - IVA - autoliquidação - Decreto-Lei n.º 362/99" },
  { code: "M44", label: "M44 - IVA - Regras específicas - artigo 6.º do CIVA" },
  { code: "M45", label: "M45 - IVA - regime transfronteiriço de isenção" },
  { code: "M46", label: "M46 - IVA - e-TaxFree" },
  { code: "M99", label: "M99 - Não sujeito ou não tributado" },
] as const;

export type VatExemptionCode = (typeof VAT_EXEMPTION_REASONS)[number]["code"];
export const VAT_EXEMPTION_CODES: readonly VatExemptionCode[] = VAT_EXEMPTION_REASONS.map(
  (r) => r.code,
);

export function isServiceVatRate(n: number): n is ServiceVatRate {
  return (SERVICE_VAT_RATES as readonly number[]).includes(n);
}

export function isVatExemptionCode(s: string): s is VatExemptionCode {
  return (VAT_EXEMPTION_CODES as readonly string[]).includes(s);
}

export function isServiceFollowUpDays(n: number): n is ServiceFollowUpDays {
  return (SERVICE_FOLLOW_UP_DAYS as readonly number[]).includes(n);
}
