/**
 * Sistemas / SubSistemas: the pure rules, shared by the admin panel, the patient
 * form's server checks and their tests. No database, no server-only import.
 *
 * The name rules MIRROR the database, which is the authority:
 *   - health_systems_name_not_blank / health_systems_name_length (120);
 *   - health_systems_tenant_name_key, a unique index on
 *     lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))).
 * The application normalizes before it writes, so a stored name never carries
 * leading, trailing or doubled whitespace, and it compares by `nameKey` so the
 * panel can say "already exists" (or reactivate a switched-off entry) instead of
 * surfacing a unique-index refusal.
 */

export const HEALTH_SYSTEM_NAME_MAX = 120;
export const HEALTH_SYSTEM_NUMBER_MAX = 64;

/** Trim and collapse every run of whitespace to one space. "" when nothing is left. */
export function normalizeHealthSystemName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** The comparison key the unique index uses: the normalized name, lower case. */
export function healthSystemNameKey(raw: string): string {
  return normalizeHealthSystemName(raw).toLowerCase();
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
