import { describe, expect, it } from "vitest";

import { FICHA_MEDICA_AI_KEYS } from "./ficha-medica";
import { summariseAiRecordingDraft } from "./ai-recording-draft";

/** A payload in the shape the ingestion store keeps: `data._aiIngestionRaw`. */
const stored = (payload: Record<string, unknown>) => ({ _aiIngestionRaw: payload });

/** The twelve contract keys, every one of them null (a strict-schema empty extraction). */
function allContractKeysNull(): Record<string, unknown> {
  const out: Record<string, unknown> = { systems_review: {} };
  for (const path of FICHA_MEDICA_AI_KEYS) {
    const [head, leaf] = path.split(".");
    if (leaf) (out.systems_review as Record<string, unknown>)[leaf] = null;
    else out[head!] = null;
  }
  return out;
}

describe("summariseAiRecordingDraft: what the recording produced", () => {
  it("twelve null contract values is an EMPTY extraction", () => {
    const s = summariseAiRecordingDraft(stored({ template: "osteopathy", ...allContractKeysNull() }));
    expect(FICHA_MEDICA_AI_KEYS).toHaveLength(12);
    expect(s.empty).toBe(true);
    expect(s.filled).toEqual([]);
    expect(s.unknownKeys).toEqual([]);
  });

  it("twelve null values in an underscore metadata block is EMPTY: the envelope is not content", () => {
    const meta = Object.fromEntries(FICHA_MEDICA_AI_KEYS.map((k) => [k, null]));
    const s = summariseAiRecordingDraft(stored({ template: "osteopathy", _ai_meta: meta }));
    expect(Object.keys(meta)).toHaveLength(12);
    expect(s.empty).toBe(true);
  });

  it("blank and whitespace-only strings do not count as content", () => {
    const s = summariseAiRecordingDraft(
      stored({ consultation_reason: "", treatment_plan: "   ", systems_review: { neurological: "\n" } }),
    );
    expect(s.empty).toBe(true);
  });

  it("a record with no raw payload at all is empty, not an error", () => {
    expect(summariseAiRecordingDraft({}).empty).toBe(true);
  });

  it("ONE filled key makes it non-empty, and that key and value are listed", () => {
    const s = summariseAiRecordingDraft(
      stored({ ...allContractKeysNull(), consultation_reason: "Dor lombar ha duas semanas" }),
    );
    expect(s.empty).toBe(false);
    expect(s.filled).toEqual([{ path: "consultation_reason", value: "Dor lombar ha duas semanas" }]);
  });

  it("a nested systems_review value is listed under its dotted path", () => {
    const s = summariseAiRecordingDraft(stored({ systems_review: { cardiovascular: "Sem alteracoes" } }));
    expect(s.filled).toEqual([{ path: "systems_review.cardiovascular", value: "Sem alteracoes" }]);
  });

  it("an unrecognised key keeps it NON-empty even with every contract key null", () => {
    // "The recording produced no content" must never be said of a draft that
    // might carry some. The value is not surfaced here, only the name.
    const s = summariseAiRecordingDraft(stored({ ...allContractKeysNull(), alarm_symptoms: "sim" }));
    expect(s.empty).toBe(false);
    expect(s.filled).toEqual([]);
    expect(s.unknownKeys).toEqual(["alarm_symptoms"]);
  });

  it("a value already at the field path (a reviewer edit) is the one listed", () => {
    const s = summariseAiRecordingDraft({
      consultation_reason: "Editado pelo revisor",
      _aiIngestionRaw: { consultation_reason: "Original da gravacao" },
    });
    expect(s.filled).toEqual([{ path: "consultation_reason", value: "Editado pelo revisor" }]);
  });
});
