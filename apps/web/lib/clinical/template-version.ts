// Form-template version resolution.
//
// form_templates is versioned and immutable: a row is keyed on (tenant_id, key,
// version) and is never edited in place once a clinical_record references it
// (CLAUDE.md rule #5). New clinical content ships as a NEW version row — e.g.
// osteopathy v1 → v2, physiotherapy v3 → v4 (PR #91) — so a single `key` now
// maps to MORE THAN ONE row.
//
// That creates a resolution gap for any path that wants "the template for this
// key" rather than a pinned (key, version): which version is current? This
// module is the single answer.
//
// RULE — current version = the HIGHEST `version` among the ACTIVE rows for a key.
//   * No DB column, no migration, no seed-data change: the version number that
//     already exists is the ordering key. (The existing is_active flag is honored
//     by callers — they pass only active rows in — so archiving the latest row
//     cleanly falls back to the previous one.)
//
// BOUNDARY — this governs NEW-record creation and template-LIST display only
// (the "Modelo" picker). It MUST NOT be used to resolve an EXISTING record's
// template: those pin formTemplateId and are resolved by id (immutability), so a
// record authored against v1 keeps rendering v1 forever even after v2 ships.
// See records.ts: existing records join formTemplates on the stored id, never
// through this resolver.

/** Minimum shape the resolver needs. Generic so any row carrying key+version works. */
export type VersionedTemplate = { key: string; version: number };

/**
 * Collapse a list that may hold several versions per key down to ONE row per
 * key — the current (highest) version. Order of first appearance per key is
 * preserved, so a caller that pre-sorts by key gets a key-sorted result.
 *
 * Intended for the template picker / list display. Pass only the rows you
 * consider selectable (e.g. is_active = true).
 */
export function resolveCurrentTemplates<T extends VersionedTemplate>(rows: T[]): T[] {
  const currentByKey = new Map<string, T>();
  for (const row of rows) {
    const winner = currentByKey.get(row.key);
    if (!winner || row.version > winner.version) {
      currentByKey.set(row.key, row);
    }
  }
  return [...currentByKey.values()];
}

/**
 * The current (highest-version) row for a single key, or null if `key` is absent
 * from `rows`. The seam a future by-key consumer (e.g. an x-form-ref wrapper
 * resolver, or the scheduler associating a form when booking) should call instead
 * of querying a bare key. Nothing consumes this yet — see module note.
 */
export function currentTemplateForKey<T extends VersionedTemplate>(
  rows: T[],
  key: string,
): T | null {
  let winner: T | null = null;
  for (const row of rows) {
    if (row.key === key && (!winner || row.version > winner.version)) {
      winner = row;
    }
  }
  return winner;
}

/* ------------------------------------------------------------------ */
/* x-form-ref wrappers — therapy types that reuse another form        */
/* ------------------------------------------------------------------ */

// Therapy types that carry NO clinical form of their own and reuse another
// template's form by reference. Source of truth: the schema-less pointer-wrapper
// seed files in packages/db/seed/form-templates/ — each declares
// `x-form-ref: "physiotherapy"`. Those files are intentionally NOT seeded as
// templates (the seed loader skips them), so the wrapper keys never appear as
// form_templates rows; this map is how their therapy-type key resolves to the
// form they point at. Keep in lockstep with the wrappers' `x-form-ref`.
export const WRAPPER_FORM_REFS: Readonly<Record<string, string>> = {
  "massagem-terapeutica": "physiotherapy",
  "pilates-terapeutico": "physiotherapy",
  rpg: "physiotherapy",
};

/** True if `typeKey` is a reuse-only therapy type that points at another form. */
export function isWrapperType(typeKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(WRAPPER_FORM_REFS, typeKey);
}

/**
 * Resolve the current form template for a therapy-type key. If the key is an
 * x-form-ref wrapper (massagem-terapeutica / pilates-terapeutico / rpg) it
 * follows the reference to its target form (physiotherapy); otherwise the key is
 * resolved directly. Returns the current (highest-version) ACTIVE row for the
 * resolved key, or null if absent.
 *
 * Tenant-safety: this is pure and operates only on `rows`. Pass the rows you
 * already scoped to the tenant (e.g. listActiveTemplates' tenant-scoped, active
 * set) — exactly the contract of currentTemplateForKey. It never widens scope.
 *
 * This is the decision-INDEPENDENT core the scheduler will call to associate a
 * form when booking one of these therapy types. TODO(owner): whether these
 * wrapper types ALSO surface as their own entries in the "Modelo" dropdown is an
 * open decision — until then they reuse the physiotherapy entry and are not
 * seeded/listed separately. This resolver does not depend on that outcome.
 */
export function resolveTemplateForType<T extends VersionedTemplate>(
  rows: T[],
  typeKey: string,
): T | null {
  const targetKey = WRAPPER_FORM_REFS[typeKey] ?? typeKey;
  return currentTemplateForKey(rows, targetKey);
}
