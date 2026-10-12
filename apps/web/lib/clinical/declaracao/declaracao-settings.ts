import "server-only";

// W5-31 — Declaração de Presença tenant configuration, read from the
// tenants.settings JSONB `declaracao` namespace (no schema change). Both fields
// are OVERRIDES with sane defaults so the declaration renders out of the box for
// the single OsteoJP tenant; a tenant may override the responsável name or turn
// the signature/stamp off. The PDF RENDERER (declaracao-pdf.ts) never contains
// the responsável literal — it draws whatever this layer resolves, so the name is
// configuration, not a hardcoded string in the PDF code path.

/** The clinic's default responsável (owner-confirmed, Fisiozero template). A
 *  tenant may override it via settings.declaracao.responsavel. Lives here (the
 *  config layer), never in the PDF renderer. */
export const DEFAULT_RESPONSAVEL = "Dr. João Paulo Santos Silva";

export type DeclaracaoSettings = {
  /** Name printed on the "(responsável)" line under the signature/stamp. */
  responsavel: string;
  /** Whether the owner-supplied signature + carimbo image is embedded. When
   *  false, the PDF leaves blank vertical space for a physical stamp. */
  signatureStamp: boolean;
};

/** Resolve the Declaração settings from a tenant's `settings` JSONB, applying the
 *  sane defaults. Tolerant of missing/malformed input (fail-safe to defaults). */
export function readDeclaracaoSettings(settings: unknown): DeclaracaoSettings {
  const root = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const d =
    root.declaracao && typeof root.declaracao === "object"
      ? (root.declaracao as Record<string, unknown>)
      : {};
  const responsavel =
    typeof d.responsavel === "string" && d.responsavel.trim().length > 0
      ? d.responsavel.trim()
      : DEFAULT_RESPONSAVEL;
  // Default ON (the clinic's own carimbo); an explicit `false` disables it.
  const signatureStamp = d.signatureStamp === false ? false : true;
  return { responsavel, signatureStamp };
}

// S-1012-A1 ruling 4 (2026-10-12): the per-location "physical stamp" setting.
//
// A location with no carimbo image may be MARKED as one that stamps by hand. It
// lives in the same `declaracao` namespace, keyed by the location's id:
//
//   declaracao.physicalStamp = { "<location id>": { place: "Montemor-o-Novo" } }
//
// `place` is the "{localidade}, {dia}" line of that location's declaration. It
// is stored with the mark because nothing else names it: the location's name is
// the brand and a label, and its address is free text.
//
// It is NOT the tenant switch above. `signatureStamp: false` blanks the area of
// a clinic that HAS a carimbo and never makes a location without one issuable;
// this entry is what makes one issuable, and only that one.

/** The longest place line the setting stores. */
export const PHYSICAL_STAMP_PLACE_MAX = 60;

/**
 * The place line of a location marked "physical stamp", or null when the
 * location is not marked. Fail-safe: a missing or malformed entry, and an entry
 * with no usable place, all read as "not marked", so the declaration is refused
 * rather than issued with a guessed place.
 */
export function readPhysicalStampPlace(settings: unknown, locationId: string): string | null {
  const root = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const d =
    root.declaracao && typeof root.declaracao === "object"
      ? (root.declaracao as Record<string, unknown>)
      : {};
  const marked =
    d.physicalStamp && typeof d.physicalStamp === "object" && !Array.isArray(d.physicalStamp)
      ? (d.physicalStamp as Record<string, unknown>)
      : {};
  if (!locationId || !Object.hasOwn(marked, locationId)) return null;
  const entry = marked[locationId];
  if (!entry || typeof entry !== "object") return null;
  const place = (entry as Record<string, unknown>).place;
  if (typeof place !== "string") return null;
  const trimmed = place.trim();
  return trimmed.length > 0 && trimmed.length <= PHYSICAL_STAMP_PLACE_MAX ? trimmed : null;
}

/**
 * The tenant `settings` blob with one location's mark set or cleared. Every
 * other key of the blob, of the `declaracao` namespace and of the other
 * locations' marks is carried over untouched. `place: null` clears the mark.
 * Pure: the caller validates `place` and writes the result.
 */
export function withPhysicalStamp(
  settings: unknown,
  locationId: string,
  place: string | null,
): Record<string, unknown> {
  const root = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const d =
    root.declaracao && typeof root.declaracao === "object"
      ? (root.declaracao as Record<string, unknown>)
      : {};
  const marked: Record<string, unknown> =
    d.physicalStamp && typeof d.physicalStamp === "object" && !Array.isArray(d.physicalStamp)
      ? { ...(d.physicalStamp as Record<string, unknown>) }
      : {};
  if (place === null) delete marked[locationId];
  else marked[locationId] = { place };
  return { ...root, declaracao: { ...d, physicalStamp: marked } };
}

/**
 * The place a location's free-text address ends in, when it carries a
 * Portuguese postal code: "Rua X 4, 7050-356 Montemor-o-Novo" gives
 * "Montemor-o-Novo". Only a SUGGESTION for the field in Administração > Locais;
 * a declaration never reads it.
 */
export function placeFromAddress(address: string | null | undefined): string {
  const m = /\d{4}-\d{3}\s+(\S.*)$/.exec(address ?? "");
  return (m?.[1] ?? "").trim().slice(0, PHYSICAL_STAMP_PLACE_MAX);
}
