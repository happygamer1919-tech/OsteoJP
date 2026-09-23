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
 *   ai_recording  no schema, not imported, the record came in through the AI
 *                 ingestion endpoint, AND it is still a draft: a draft from a
 *                 consultation recording, waiting for review.
 *   neutral       anything else without a schema: the stored content under a
 *                 heading that claims no origin.
 *
 * WHY ai_recording NEEDS status 'draft'. The panel is titled as a draft and
 * shows what the recording filled, so it is only true of a record nobody has
 * finalized. A template-less AI record that WAS finalized exists in history:
 * before the claim bound the Ficha Medica template, a claimed draft could be
 * edited and signed with no template at all, and a reviewer's text sits in its
 * stored data, outside the recording. Drawn as a recording draft it would read
 * "Rascunho" under "Ficha finalizada e imutavel", and the reviewer's text would
 * not be on the page. The neutral view prints every stored key, so it goes
 * there.
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
  /** clinical_records.status (record_status): draft, locked or signed. */
  status: string;
};

export function chooseRecordView({
  hasSchema,
  importerSourced,
  source,
  status,
}: RecordViewInput): RecordView {
  if (hasSchema) return "form";
  if (importerSourced) return "imported";
  if (source === "ai_ingested" && status === "draft") return "ai_recording";
  return "neutral";
}
