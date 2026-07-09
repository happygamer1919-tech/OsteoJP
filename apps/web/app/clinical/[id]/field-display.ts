import type { Locale } from "@osteojp/i18n";

import { labelOf, type FieldSchema } from "@/lib/clinical/form-template";

/**
 * Ficha Clínica field-display rules shared by the record form body and the
 * section rail (W5-19, AMENDMENTS rulings B/C). Kept framework-agnostic (no
 * "use client") so the server-rendered detail page and the client form agree.
 */

/**
 * Ruling B: `episode_date` has no manual input — the record's creation instant
 * is auto-stamped (shown read-only in the header strip) and populated
 * server-side from `created_at` on save. It stays a template property
 * (immutable, rule #5) but is filtered out of the rendered body and the rail.
 */
export const HIDDEN_FIELD_KEYS = new Set(["episode_date"]);

/**
 * Ruling C: the `health_problems` section is presented as "Outros" via a
 * renderer-level label override — migration-free; the template `x-label` and
 * the data key / AI binding are untouched.
 */
const SECTION_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  health_problems: { pt: "Outros", en: "Other" },
};

/** Field label with the W5-19 section-title overrides applied. */
export function sectionLabel(field: FieldSchema, locale: Locale, key: string): string {
  return SECTION_LABEL_OVERRIDES[key]?.[locale] ?? labelOf(field, locale, key);
}
