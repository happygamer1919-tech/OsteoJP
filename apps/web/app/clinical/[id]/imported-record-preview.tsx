import type { ReactNode } from "react";

import { s } from "@/lib/i18n";

/**
 * READ-ONLY PREVIEW FOR A RECORD THAT HAS NO FORM TEMPLATE.
 *
 * ==========================================================================
 * WHY THIS EXISTS, AND WHY IT IS NOT "RESOLVE A TEMPLATE BY KEY"
 * ==========================================================================
 * The record viewer is schema-driven: `RecordDetailPage` parses the record's
 * `form_templates.schema` and `RecordForm` draws a field per schema entry. A
 * record with `form_template_id` NULL therefore has no schema and no fields,
 * and the page drew a single em-dash where the clinical content should be.
 *
 * EVERY IMPORTED FISIOZERO RECORD IS IN THAT STATE. `clinicalRecordValues`
 * (packages/db/src/migration/upsert.ts) sets patient, episode, practitioner,
 * `data`, `status` and `source` — and never `form_template_id`.
 *
 * THE REVIEW ROUTE'S TRICK IS NOT AVAILABLE HERE, and that is the important
 * part. `/clinical/review/[recordId]` handles an AI draft's null template by
 * resolving the Ficha Médica template BY KEY, because an AI payload's keys ARE
 * Ficha Médica field paths (identity mapping, W5-13). An imported record's keys
 * are NOT: the Fisiozero adapter folds each vendor cell in UNDER ITS OWN NAME,
 * deliberately, because renaming `queixas` to a house field would be a clinical
 * judgement the adapter is not entitled to make. Rendering that data through the
 * Ficha Médica schema would draw an EMPTY Ficha Médica and hide every stored
 * value behind a form that looks correctly filled in — the unknown case rendered
 * as the known one, which is the failure PORTAL-REHYDRATE §1.3 exists to stop.
 *
 * So this component shows what is actually stored, under the names it is stored
 * with, and asserts nothing about what those names mean.
 *
 * ==========================================================================
 * NOTHING IS DROPPED, AND THAT IS THE ONE INVARIANT WORTH GUARDING
 * ==========================================================================
 * A key whose value is a shape this component has no nice rendering for is
 * printed as JSON rather than skipped. An absent preview line and a value that
 * was never imported look identical on a screen, and only one of them is a data
 * question. Empty strings and nulls ARE skipped — the adapter already omits
 * empty cells, so a null here means "not in the delivery", and printing a blank
 * row would invent a field the clinic never had.
 *
 * READ-ONLY BY CONSTRUCTION: no form, no input, no action, no server action
 * imported. There is no edit path to add or remove, and a `locked` record stays
 * immutable exactly as the trigger enforces.
 */

/** A leaf we can print as text without interpreting it. */
function isPrintable(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Nothing to show: the adapter omits empty cells, so this is genuine absence. */
function isAbsent(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function renderValue(value: unknown): ReactNode {
  if (isPrintable(value)) return String(value);
  // Arrays and objects have no agreed presentation here and inventing one would
  // be the same judgement the adapter refused. JSON keeps every byte visible.
  return (
    <span className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(value, null, 2)}</span>
  );
}

export function ImportedRecordPreview({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => !isAbsent(v));

  if (entries.length === 0) {
    // The row exists and carries no content. Said plainly, because "the viewer
    // cannot draw it" and "there is nothing to draw" are different answers and
    // the clinic needs to be able to tell them apart.
    return (
      <p className="text-sm text-text-secondary" data-testid="imported-record-empty">
        {s["clinical.importedNoContent"]}
      </p>
    );
  }

  return (
    <section aria-label={s["clinical.importedPreviewTitle"]} data-testid="imported-record-preview">
      <h2 className="mb-2 text-base font-semibold text-text-primary">
        {s["clinical.importedPreviewTitle"]}
      </h2>
      <p className="mb-4 text-sm text-text-secondary">{s["clinical.importedPreviewHelp"]}</p>
      <dl className="flex flex-col gap-4">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-text-secondary">{key}</dt>
            <dd className="whitespace-pre-wrap text-sm text-text-primary">{renderValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
