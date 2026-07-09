// Form engine — pure, framework-free. Used by the server (validate before
// persisting) AND the client renderer (RecordForm). No DB, no React here.
//
// Templates are JSON-Schema-flavoured: each field carries `x-label {pt,en}`,
// an optional `x-widget`, and `x-required`. The seeded osteopathy-v1 template
// (packages/db/seed/form-templates/osteopathy-v1.json) is the reference shape.

import type { Locale } from "@osteojp/i18n";

export type Localized = { pt: string; en: string };

export type FieldSchema = {
  type?: string | string[];
  format?: string;
  enum?: (string | null)[];
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  minimum?: number;
  "x-label"?: Localized;
  "x-widget"?: string;
  "x-required"?: boolean;
  "x-hint"?: Localized;
  "x-enum-labels"?: Record<string, Localized>;
  /** If true, this field may be sent to the AI extraction partner.
   * DEFAULT-DENY: absent or false means the field is NEVER extracted. */
  ai_extractable?: boolean;
  /** If true, this field is private to the therapist (x-private: true in
   * templates). Redundant with ai_extractable: false but kept for clarity. */
  "x-private"?: boolean;
};

export type TemplateSchema = {
  type?: string;
  required?: string[];
  properties: Record<string, FieldSchema>;
};

/** The widgets the renderer understands; everything else falls back to text. */
export type Widget =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "string_list" // array of strings (e.g. CID codes)
  | "checkbox_group" // object of booleans (+ optional "other" text)
  | "subfields" // object of nested fields (e.g. systems review)
  | "bodychart" // array of markers placed on the body diagram
  | "mobilidade"; // three-circle Activa/Passiva marker widget (Cervical/Dorsal/Lombar)

/** Coerce the untyped jsonb `schema` column into a TemplateSchema, or null. */
export function parseTemplateSchema(raw: unknown): TemplateSchema | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.properties !== "object" || r.properties === null) return null;
  return {
    type: typeof r.type === "string" ? r.type : undefined,
    required: Array.isArray(r.required)
      ? r.required.filter((k): k is string => typeof k === "string")
      : [],
    properties: r.properties as Record<string, FieldSchema>,
  };
}

export function topLevelFields(schema: TemplateSchema): Array<[string, FieldSchema]> {
  return Object.entries(schema.properties);
}

export function labelOf(field: FieldSchema, locale: Locale, fallback: string): string {
  return field["x-label"]?.[locale] ?? fallback;
}

export function hintOf(field: FieldSchema, locale: Locale): string | null {
  return field["x-hint"]?.[locale] ?? null;
}

export function enumLabel(field: FieldSchema, value: string, locale: Locale): string {
  return field["x-enum-labels"]?.[value]?.[locale] ?? value;
}

function hasType(field: FieldSchema, t: string): boolean {
  return Array.isArray(field.type) ? field.type.includes(t) : field.type === t;
}

/** Decide which widget renders a field. */
export function widgetOf(key: string, field: FieldSchema): Widget {
  if (
    key === "bodychart" ||
    (hasType(field, "array") && field.items?.properties?.["marker_type"])
  ) {
    return "bodychart";
  }
  if (field["x-widget"] === "mobilidade") return "mobilidade";
  if (field["x-widget"] === "checkbox_group") return "checkbox_group";
  if (hasType(field, "object") && field.properties) {
    const allBoolean = Object.values(field.properties).every(
      (f) => hasType(f, "boolean") || f["x-widget"] === "text",
    );
    return allBoolean ? "checkbox_group" : "subfields";
  }
  if (hasType(field, "array")) return "string_list";
  if (field["x-widget"] === "textarea") return "textarea";
  if (field.format === "date") return "date";
  if (hasType(field, "number") || hasType(field, "integer")) return "number";
  return "text";
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Project clinical record data through the template's ai_extractable flags.
 * Only copies fields where ai_extractable === true; every other field
 * (including private_notes, which carries ai_extractable: false, and any field
 * with no flag at all) is silently dropped.
 *
 * DEFAULT-DENY: ai_extractable must be explicitly true to pass through.
 * Absent (undefined) and false are both treated as non-extractable.
 */
export function projectAiExtractableData(
  data: Record<string, unknown>,
  schema: TemplateSchema,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.properties)) {
    if (field.ai_extractable === true && Object.prototype.hasOwnProperty.call(data, key)) {
      out[key] = data[key];
    }
  }
  return out;
}

export type ValidationResult = { ok: boolean; errors: Record<string, string> };

/**
 * Validate a filled `data` object against the template. Enforces presence of
 * required fields (schema.required + per-field x-required). Returns a map of
 * field key → "required" so callers can map it to an i18n message.
 */
export function validateRecordData(
  schema: TemplateSchema,
  data: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};
  const required = new Set<string>(schema.required ?? []);
  for (const [key, field] of topLevelFields(schema)) {
    if (field["x-required"]) required.add(key);
  }
  for (const key of required) {
    if (isEmpty(data[key])) errors[key] = "required";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
