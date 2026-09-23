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
 *
 * "OTHER STORED" IS WHAT KEEPS THE PANEL FROM DROPPING ANYTHING. The panel
 * draws the filled contract keys, and nothing else would reach the screen: a
 * value stored OUTSIDE the raw payload (a reviewer's note under a key the
 * contract does not have, or a reviewer value at a contract path the recording
 * left null) would be on no screen at all. `otherStored` is the stored data
 * minus the raw payload and minus each value the panel already shows, and the
 * panel prints it under the stored-content rules. Removing a filled path loses
 * nothing: the value shown at that path IS the stored one whenever one is
 * stored (the projection never overwrites a set field). A draft as store.ts
 * writes it, or as a claim projects it, leaves nothing here.
 */
export type AiRecordingDraftSummary = {
  /** The Ficha Medica key paths that carry a value, in contract order. */
  filled: { path: string; value: unknown }[];
  /** Key names the partner sent that reach no ficha field. Names only. */
  unknownKeys: string[];
  /** Nothing filled and nothing unrecognised: the recording produced no content. */
  empty: boolean;
  /**
   * The stored data the fields above do not show: everything but the raw
   * payload and the filled paths. Unfiltered; the panel applies the
   * stored-content rules (absent values skipped, the rest printed).
   */
  otherStored: Record<string, unknown>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A shallow copy of `target` without `key`. */
function withoutKey(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const out = { ...target };
  delete out[key];
  return out;
}

/**
 * `target` without the value at a dotted `path`, and without any object that
 * removal left empty. Never mutates. When the path does not reach a plain
 * object (a string, an array, a missing key sits in the way), nothing is
 * removed: the value there was not the one shown, so it must stay.
 */
function omitKeyPath(target: Record<string, unknown>, path: string): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (!Object.prototype.hasOwnProperty.call(target, head!)) return target;
  if (rest.length === 0) return withoutKey(target, head!);
  const child = target[head!];
  if (!isPlainObject(child)) return target;
  const next = omitKeyPath(child, rest.join("."));
  if (next === child) return target;
  if (Object.keys(next).length === 0) return withoutKey(target, head!);
  return { ...target, [head!]: next };
}

export function summariseAiRecordingDraft(
  data: Record<string, unknown>,
): AiRecordingDraftSummary {
  const { data: projected, projected: paths, unknown } = projectAiPayloadOntoFichaFields(data);
  const filled = paths.map((path) => ({ path, value: readFichaKeyPath(projected, path) }));
  // The raw payload is what the fields and the unknown-key names above already
  // stand for, so it is left out by name. Destructured, not aliased to a
  // constant: ai-raw-writer-pin.test.ts reads a destructuring as a READ.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only the rest is used
  const { _aiIngestionRaw: rawPayload, ...outsideRaw } = data;
  const otherStored = paths.reduce(omitKeyPath, outsideRaw);
  return {
    filled,
    unknownKeys: unknown,
    empty: filled.length === 0 && unknown.length === 0,
    otherStored,
  };
}
