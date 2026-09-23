import { projectAiPayloadOntoFichaFields, readFichaKeyPath } from "./ficha-medica";

/**
 * FICHA-IMPORTED-VIEW: WHAT AN AI INGESTION DRAFT CARRIES, FOR THE RECORD PAGE.
 *
 * An AI draft that has not been claimed has no template, so the record page
 * cannot draw it as a form. It shows what the recording produced instead, and
 * says so plainly when that is nothing.
 *
 * THE PANEL NEVER SHOWS LESS OF WHAT IS STORED THAN origin/main DID. Main drew
 * this draft under "Conteudo importado" and printed every stored key, the raw
 * payload included, as JSON. The panel names the fields it recognises in the
 * ficha's own words, and keeps everything else visible:
 *
 *   - `filled`: the Ficha Medica key paths that carry a value, by the
 *     projection's OWN rule (`projectAiPayloadOntoFichaFields`, not a second
 *     rule written here). The value is read from the projected data, so a value
 *     a reviewer already set at the path is the one shown.
 *   - `payloadRest`: the recording's stored payload minus each value a field
 *     shows. A path leaves the payload only when the field shows THAT value; a
 *     reviewer edit shows the edit, so the recording's own value stays here.
 *     Unrecognised keys, their values, a container holding text where the
 *     contract expects fields, the template's name, metadata and nulls all stay.
 *   - `otherStored`: the stored data outside the payload, minus each value a
 *     field shows (a reviewer's note under a key the contract lacks, a reviewer
 *     value at a path the recording left null).
 *
 * "EMPTY" IS SAID ONLY WHEN NOTHING STORED CARRIES A VALUE. Its message reads
 * "the recording produced no content: no ficha field was filled in", so it
 * needs no filled field, no unrecognised key, and no value (a non-blank string,
 * a number, a boolean) anywhere in `payloadRest` or `otherStored`. Deciding it
 * from the contract instead (the twelve keys and the names of the rest) called
 * `systems_review: "texto"` empty, because a container holding text fills no
 * field and is not an unknown key.
 *
 * ONE EXEMPTION: the payload's top-level `template`, when it is a string. It is
 * the name of the form the partner filled, not something the recording
 * produced, and every payload carries it, so without the exemption an empty
 * extraction could never be called empty. It is still printed in the rest.
 */
export type AiRecordingDraftSummary = {
  /** The Ficha Medica key paths that carry a value, in contract order. */
  filled: { path: string; value: unknown }[];
  /** Key names the partner sent that reach no ficha field. Their values are in `payloadRest`. */
  unknownKeys: string[];
  /**
   * The recording's stored payload minus each value `filled` shows. Undefined
   * when there is no payload or nothing is left of it. Not filtered: nulls and
   * the template's name are kept, as main printed them.
   */
  payloadRest: unknown;
  /** `payloadRest` holds a value beyond the template's name. */
  payloadRestHasContent: boolean;
  /** Nothing filled, nothing unrecognised, and no stored value anywhere. */
  empty: boolean;
  /**
   * The stored data outside the payload that the fields do not show.
   * Unfiltered; the panel applies the stored-content rules (absent values
   * skipped, the rest printed).
   */
  otherStored: Record<string, unknown>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Whether a stored value holds anything: a non-blank string, a number or a
 * boolean, at any depth. Null, undefined, blank strings and empty containers
 * hold nothing (the stored-content rules' "absent", applied to every leaf).
 */
export function carriesStoredValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(carriesStoredValue);
  if (typeof v === "object") return Object.values(v).some(carriesStoredValue);
  return true;
}

/** The same stored value. Stored data is JSON, so its serialisation compares it. */
function sameStoredValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** A shallow copy of `target` without `key`. */
function withoutKey(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const out = { ...target };
  delete out[key];
  return out;
}

/**
 * `target` without the value at a dotted `path` WHEN that value is the one a
 * field shows (`shown`), or holds nothing (null, undefined), and without any
 * object that removal left empty. Never mutates.
 *
 * Anything else stays: a different value (a reviewer edit is shown, so the
 * recording's own value is not), or a non-object sitting where the path
 * expects one (the projection replaced it to show the recording's value, so it
 * was not what the screen showed).
 */
function omitShownValue(
  target: Record<string, unknown>,
  path: string,
  shown: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (!Object.prototype.hasOwnProperty.call(target, head!)) return target;
  const child = target[head!];
  if (rest.length === 0) {
    const holdsNothing = child === null || child === undefined;
    return holdsNothing || sameStoredValue(child, shown) ? withoutKey(target, head!) : target;
  }
  if (!isPlainObject(child)) return target;
  const next = omitShownValue(child, rest.join("."), shown);
  if (next === child) return target;
  if (Object.keys(next).length === 0) return withoutKey(target, head!);
  return { ...target, [head!]: next };
}

/** The rest holds a value other than the template's name at its top. */
function restHasContent(rest: unknown): boolean {
  if (!isPlainObject(rest)) return carriesStoredValue(rest);
  return Object.entries(rest).some(
    ([key, value]) => !(key === "template" && typeof value === "string") && carriesStoredValue(value),
  );
}

export function summariseAiRecordingDraft(
  data: Record<string, unknown>,
): AiRecordingDraftSummary {
  const { data: projected, projected: paths, unknown } = projectAiPayloadOntoFichaFields(data);
  const filled = paths.map((path) => ({ path, value: readFichaKeyPath(projected, path) }));
  // Destructured, not aliased to a constant: ai-raw-writer-pin.test.ts reads a
  // destructuring as a READ.
  const { _aiIngestionRaw: rawPayload, ...outsideRaw } = data;

  const omitShown = (target: Record<string, unknown>) =>
    filled.reduce((acc, { path, value }) => omitShownValue(acc, path, value), target);

  let payloadRest: unknown;
  if (isPlainObject(rawPayload)) {
    const rest = omitShown(rawPayload);
    payloadRest = Object.keys(rest).length === 0 ? undefined : rest;
  } else {
    // A payload that is not an object fills no field; it is kept whole unless
    // it holds nothing at all (main skipped an absent top-level value too).
    const absent =
      rawPayload === null ||
      rawPayload === undefined ||
      (typeof rawPayload === "string" && rawPayload.trim() === "");
    payloadRest = absent ? undefined : rawPayload;
  }
  const payloadRestHasContent = restHasContent(payloadRest);
  const otherStored = omitShown(outsideRaw);

  return {
    filled,
    unknownKeys: unknown,
    payloadRest,
    payloadRestHasContent,
    empty:
      filled.length === 0 &&
      unknown.length === 0 &&
      !payloadRestHasContent &&
      !carriesStoredValue(otherStored),
    otherStored,
  };
}
