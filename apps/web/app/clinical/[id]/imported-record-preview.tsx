import { s } from "@/lib/i18n";

import { StoredRecordContent } from "./stored-record-content";

/**
 * READ-ONLY PREVIEW FOR AN IMPORTED RECORD, WHICH HAS NO FORM TEMPLATE.
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

/**
 * FICHA-IMPORTED-VIEW: the rendering rules above now live in
 * `stored-record-content.tsx`, shared with the neutral view, so the two cannot
 * drift. This component is the IMPORTED reading of them: the page draws it only
 * for a record `isImporterSourcedRecord` (lib/clinical/record-origin.ts) says
 * the importer wrote, which is the only case its heading is true for. Its test
 * ids and strings are unchanged.
 */
export function ImportedRecordPreview({ data }: { data: Record<string, unknown> }) {
  return (
    <StoredRecordContent
      data={data}
      title={s["clinical.importedPreviewTitle"]}
      help={s["clinical.importedPreviewHelp"]}
      emptyText={s["clinical.importedNoContent"]}
      testId="imported-record-preview"
      emptyTestId="imported-record-empty"
    />
  );
}
