import { projectAiPayloadOntoFichaFields, readFichaKeyPath } from "./ficha-medica";

/**
 * FICHA-IMPORTED-VIEW: WHAT AN AI INGESTION DRAFT CARRIES, FOR THE RECORD PAGE.
 *
 * An AI draft that has not been claimed has no template, so the record page
 * cannot draw it as a form. It shows what the recording produced instead, and
 * says so plainly when that is nothing.
 *
 * "FILLED" USES THE PROJECTION'S OWN RULE, not a second one written here.
 * `projectAiPayloadOntoFichaFields` already decides which of the twelve Ficha
 * Medica keys carry a usable value (not undefined, not null, not a blank
 * string); its `projected` list is exactly the filled keys. The values are read
 * from the projected data, so a value a reviewer already set at a field path is
 * the one shown.
 *
 * "EMPTY" IS CONSERVATIVE. It needs no filled key AND no key the partner sent
 * that the ficha has no field for (`unknown`), because an unrecognised key may
 * carry content and "the recording produced no content" must never be said of
 * a draft that has some. Envelope keys (`template`, anything starting with an
 * underscore, such as a per-field metadata block) are not content, in line with
 * the projection's existing contract, so a payload whose only values sit in the
 * envelope is empty.
 */
export type AiRecordingDraftSummary = {
  /** The Ficha Medica key paths that carry a value, in contract order. */
  filled: { path: string; value: unknown }[];
  /** Key names the partner sent that reach no ficha field. Names only. */
  unknownKeys: string[];
  /** Nothing filled and nothing unrecognised: the recording produced no content. */
  empty: boolean;
};

export function summariseAiRecordingDraft(
  data: Record<string, unknown>,
): AiRecordingDraftSummary {
  const { data: projected, projected: paths, unknown } = projectAiPayloadOntoFichaFields(data);
  const filled = paths.map((path) => ({ path, value: readFichaKeyPath(projected, path) }));
  return { filled, unknownKeys: unknown, empty: filled.length === 0 && unknown.length === 0 };
}
