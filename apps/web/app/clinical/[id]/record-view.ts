/**
 * FICHA-IMPORTED-VIEW: WHICH BODY THE RECORD PAGE DRAWS.
 *
 * Before this card the page asked one question, "does the record have a
 * template?", and drew the imported preview for every record that did not.
 * An AI ingestion draft has no template either (store.ts writes only the raw
 * payload), so an empty recording draft was shown under "Conteudo importado"
 * although the importer never wrote it.
 *
 * The page now asks, in this order:
 *
 *   form          the record has a usable template schema: the form, as before.
 *   imported      no schema, and the importer wrote this content
 *                 (`isImporterSourcedRecord`, lib/clinical/record-origin.ts,
 *                 which is where that rule is stated).
 *   ai_recording  no schema, not imported, and the record came in through the
 *                 AI ingestion endpoint: a draft from a consultation recording.
 *   neutral       anything else without a schema: the stored content under a
 *                 heading that claims no origin.
 *
 * Pure: the page passes in what it already read.
 */
export type RecordView = "form" | "imported" | "ai_recording" | "neutral";

export type RecordViewInput = {
  /** The record's template parsed to a usable schema. */
  hasSchema: boolean;
  /** The answer of `isImporterSourcedRecord`; false when it was not asked. */
  importerSourced: boolean;
  /** clinical_records.source (record_source). */
  source: string;
};

export function chooseRecordView({ hasSchema, importerSourced, source }: RecordViewInput): RecordView {
  if (hasSchema) return "form";
  if (importerSourced) return "imported";
  if (source === "ai_ingested") return "ai_recording";
  return "neutral";
}
