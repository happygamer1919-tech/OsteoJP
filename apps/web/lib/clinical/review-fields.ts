// Pure narrative-field policy. No `server-only` here so it stays unit-testable
// (see review-fields.test.ts) and is safely shared by the server + the page.
import { widgetOf, type FieldSchema, type TemplateSchema } from "./form-template";

// Narrative free-text field policy for the staff review / finalize write path.
//
// Task hard rule: during review a therapist may edit (and auto-fill from the
// AI draft / patient submission) NARRATIVE FREE-TEXT fields ONLY. Coded fields
// (diagnosis codes, checkbox groups, structured/object fields, bodychart
// markers, numbers, dates, enums) and SAFETY fields (red flags, allergies,
// contraindications, current medication) stay MANUAL — they are never written
// through this path, regardless of source. Enforced BEFORE any DB write so an
// over-broad edit payload is rejected loudly, not silently dropped.
//
// The classifier is layered so it holds even when no form template is bound
// (AI raw payloads and patient intake have formTemplateId = null until a
// reviewer maps them):
//   * value must be a STRING (any array/object/number/boolean is coded);
//   * the key must NOT be a SAFETY key;
//   * WITH a template, the field's resolved widget must be text/textarea and it
//     must not be an enum (a coded select stored as a string).

/**
 * Keys that are safety-critical and must always be entered MANUALLY by the
 * clinician — never auto-filled from an AI draft or patient submission, even
 * though some render as free text (e.g. red_flags is a textarea). Matched by
 * exact top-level key; deliberately conservative and explicit.
 */
export const SAFETY_FIELD_KEYS: ReadonlySet<string> = new Set([
  "red_flags",
  "allergies",
  "contraindications",
  "current_medication",
  "medications",
  "alerts",
  "safety_flags",
]);

/** Widgets that represent narrative free text (everything else is coded). */
const NARRATIVE_WIDGETS: ReadonlySet<string> = new Set(["text", "textarea"]);

/** Reason a field was refused by the narrative-only gate. */
export type RejectReason = "safety" | "coded";

export type NarrativePartition = {
  /** Keys accepted as narrative free-text edits (key → string value). */
  narrative: Record<string, string>;
  /** Keys refused, mapped to why (safety field, or coded/structured value). */
  rejected: Record<string, RejectReason>;
};

/**
 * True iff `key`/`value` may be written through the review edit/auto-fill path.
 * Pass the field's template schema (when one is bound) to tighten the check to
 * the field's declared widget; omit it for unmapped AI/patient payloads.
 */
export function isNarrativeField(
  key: string,
  value: unknown,
  field?: FieldSchema,
): boolean {
  if (SAFETY_FIELD_KEYS.has(key)) return false; // safety → manual only
  if (typeof value !== "string") return false; // coded / structured value
  if (field) {
    if (field.enum && field.enum.length > 0) return false; // coded select
    return NARRATIVE_WIDGETS.has(widgetOf(key, field));
  }
  return true; // no template: string + not-safety is narrative
}

/**
 * Split an edit payload into the narrative subset that may be applied and the
 * rejected remainder. The service rejects the WHOLE edit when `rejected` is
 * non-empty (fail loud, never partially apply a payload that reached for a
 * coded/safety field). Use the same function to project a source payload down
 * to its auto-fillable narrative fields when materialising a draft.
 */
export function partitionNarrativeEdit(
  edit: Record<string, unknown>,
  schema?: TemplateSchema | null,
): NarrativePartition {
  const narrative: Record<string, string> = {};
  const rejected: Record<string, RejectReason> = {};
  for (const [key, value] of Object.entries(edit)) {
    if (SAFETY_FIELD_KEYS.has(key)) {
      rejected[key] = "safety";
      continue;
    }
    const field = schema?.properties[key];
    if (!isNarrativeField(key, value, field)) {
      rejected[key] = "coded";
      continue;
    }
    narrative[key] = value as string;
  }
  return { narrative, rejected };
}
