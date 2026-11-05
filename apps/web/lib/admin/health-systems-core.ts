/**
 * Sistemas / SubSistemas: the pure rules, shared by the admin panel, the patient
 * form's server checks and their tests. No database, no server-only import.
 *
 * The name rules MIRROR the database, which is the authority:
 *   - health_systems_name_not_blank / health_systems_name_length (120);
 *   - health_systems_tenant_name_key, a unique index on
 *       translate(lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))),
 *                 HEALTH_SYSTEM_ACCENTS_FROM, HEALTH_SYSTEM_ACCENTS_TO)
 *     so case, whitespace AND ACCENTS fold (ruling Q12, 2026-11-04: "Medis"
 *     with or without an accent, in any case, is one name).
 * The application normalizes before it writes, so a stored name never carries
 * leading, trailing or doubled whitespace, and it compares by `nameKey` so the
 * panel can say "already exists" (or reactivate a switched-off entry) instead of
 * surfacing a unique-index refusal. The accent map below is the migration's,
 * character for character: health-systems-core.test.ts reads the two literals
 * out of the migration file and compares them, and health-systems.db.test.ts
 * runs the index expression from the catalogue over a table of names and
 * compares every key with `healthSystemNameKey`.
 */

export const HEALTH_SYSTEM_NAME_MAX = 120;
export const HEALTH_SYSTEM_NUMBER_MAX = 64;

/**
 * The accent map of the unique index, position for position: a, e, i, o and u
 * with acute, grave, circumflex, tilde or diaeresis, c with cedilla and n with
 * tilde, lower case then upper case, each onto its bare lower-case letter.
 */
export const HEALTH_SYSTEM_ACCENTS_FROM = "áàâãäéèêëẽíìîïĩóòôõöúùûüũçñÁÀÂÃÄÉÈÊËẼÍÌÎÏĨÓÒÔÕÖÚÙÛÜŨÇÑ";
export const HEALTH_SYSTEM_ACCENTS_TO = "aaaaaeeeeeiiiiiooooouuuuucnaaaaaeeeeeiiiiiooooouuuuucn";

const ACCENT_FOLD: ReadonlyMap<string, string> = new Map(
  [...HEALTH_SYSTEM_ACCENTS_FROM].map((c, i) => [c, HEALTH_SYSTEM_ACCENTS_TO[i]!]),
);

/** Postgres translate() with the map above: every listed letter onto its bare one, the rest unchanged. */
export function foldHealthSystemAccents(text: string): string {
  let out = "";
  for (const c of text) out += ACCENT_FOLD.get(c) ?? c;
  return out;
}

/**
 * Compose to NFC, then trim and collapse every run of whitespace to one space.
 * "" when nothing is left.
 *
 * NFC FIRST: a pasted "Me" + combining acute + "dis" becomes the single letter
 * the accent map holds, so it folds. The index's translate() works on stored
 * characters and cannot compose a combining mark itself, so THE SQL SIDE RELIES
 * ON THE APPLICATION STORING NFC: every write goes through this function.
 */
export function normalizeHealthSystemName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** The comparison key the unique index uses: the normalized name, lower case, accents folded. */
export function healthSystemNameKey(raw: string): string {
  return foldHealthSystemAccents(normalizeHealthSystemName(raw).toLowerCase());
}

/** Why a name typed into the panel cannot be saved, or null when it can. */
export function healthSystemNameProblem(raw: string): "blank" | "too_long" | null {
  const name = normalizeHealthSystemName(raw);
  if (name === "") return "blank";
  if (name.length > HEALTH_SYSTEM_NAME_MAX) return "too_long";
  return null;
}

/**
 * The switch "Usa tabela de preços de Sistemas", read from tenants.settings.
 * Stored at settings.healthSystems.priceTableEnabled; anything but a literal
 * `true` reads OFF, so every clinic that never touched it is OFF.
 *
 * IT DOES NOTHING YET. No booking, price or invoice path reads it: crossing
 * appointment types with Sistemas for a price is a separate, later decision.
 */
export function readPriceTableEnabled(settings: unknown): boolean {
  if (typeof settings !== "object" || settings === null) return false;
  const hs = (settings as { healthSystems?: unknown }).healthSystems;
  if (typeof hs !== "object" || hs === null) return false;
  return (hs as { priceTableEnabled?: unknown }).priceTableEnabled === true;
}

/** settings with the switch set, every other key kept as it was. */
export function withPriceTableEnabled(
  settings: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const prev = settings.healthSystems;
  const base = typeof prev === "object" && prev !== null ? (prev as Record<string, unknown>) : {};
  return { ...settings, healthSystems: { ...base, priceTableEnabled: enabled } };
}

export type HealthSystemOption = { id: string; name: string; active: boolean };

/**
 * The dropdown's entries for one ficha: every active Sistema, plus the one the
 * patient already names when it has since been switched off (so an edit shows
 * the stored value instead of silently reading "Seleccione"). Sorted by name.
 */
export function healthSystemOptionsFor(
  all: readonly HealthSystemOption[],
  currentId: string | null | undefined,
): HealthSystemOption[] {
  return all
    .filter((o) => o.active || (currentId != null && o.id === currentId))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}
