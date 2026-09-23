import { describe, expect, it } from "vitest";

import { FICHA_MEDICA_AI_KEYS, projectAiPayloadOntoFichaFields } from "./ficha-medica";
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

/**
 * ROUND 2 (reviewer, behaviour lens): the panel drew only the filled contract
 * keys, so a value stored OUTSIDE the raw payload reached no screen. The
 * summary now hands the panel `otherStored`: the stored data minus the raw
 * payload and minus each value the fields already show.
 */
describe("summariseAiRecordingDraft: otherStored, what the fields do not show", () => {
  it("a draft exactly as store.ts writes it leaves nothing over", () => {
    const s = summariseAiRecordingDraft(
      stored({ template: "osteopathy", consultation_reason: "Dor sintetica", _ai_meta: { x: null } }),
    );
    expect(s.otherStored).toEqual({});
  });

  it("a draft as the claim projects it leaves nothing over: every projected value is shown", () => {
    const raw = {
      template: "osteopathy",
      consultation_reason: "Dor sintetica",
      systems_review: { neurological: "Parestesias sinteticas", cardiovascular: null },
    };
    const claimed = projectAiPayloadOntoFichaFields(stored(raw)).data;
    const s = summariseAiRecordingDraft(claimed);
    expect(s.filled.map((f) => f.path)).toEqual(["consultation_reason", "systems_review.neurological"]);
    expect(s.otherStored).toEqual({});
  });

  it("THE DEFECT'S RECORD: a reviewer value at a contract path the recording left null is kept", () => {
    const meta = Object.fromEntries(FICHA_MEDICA_AI_KEYS.map((k) => [k, null]));
    const s = summariseAiRecordingDraft({
      _aiIngestionRaw: { template: "osteopathy", _ai_meta: meta },
      observations: "Texto do revisor sintetico",
    });
    // The recording itself produced nothing, and says so...
    expect(s.empty).toBe(true);
    expect(s.filled).toEqual([]);
    // ...but the reviewer's text is not dropped.
    expect(s.otherStored).toEqual({ observations: "Texto do revisor sintetico" });
  });

  it("a key the contract does not have is kept, under its stored name", () => {
    const s = summariseAiRecordingDraft({
      _aiIngestionRaw: { consultation_reason: "Dor sintetica" },
      consultation_reason: "Dor sintetica",
      nota_revisor: "Nota sintetica",
    });
    expect(s.otherStored).toEqual({ nota_revisor: "Nota sintetica" });
  });

  it("inside a section, only the SHOWN leaf is removed and its siblings stay", () => {
    const s = summariseAiRecordingDraft({
      _aiIngestionRaw: { systems_review: { cardiovascular: "Sem alteracoes" } },
      systems_review: { cardiovascular: "Sem alteracoes", respiratory: "Revisor sintetico" },
    });
    expect(s.filled).toEqual([{ path: "systems_review.cardiovascular", value: "Sem alteracoes" }]);
    expect(s.otherStored).toEqual({ systems_review: { respiratory: "Revisor sintetico" } });
  });

  it("a section that is not an object where the path expects one is NOT removed: it was not what was shown", () => {
    // The projection replaces the string with an object to show the raw value,
    // so the stored string is on no screen unless otherStored keeps it.
    const s = summariseAiRecordingDraft({
      _aiIngestionRaw: { systems_review: { neurological: "Parestesias sinteticas" } },
      systems_review: "Texto antigo sintetico",
    });
    expect(s.filled).toEqual([{ path: "systems_review.neurological", value: "Parestesias sinteticas" }]);
    expect(s.otherStored).toEqual({ systems_review: "Texto antigo sintetico" });
  });

  it("a reviewer value at a FILLED path is shown in the fields, so it is not repeated", () => {
    const s = summariseAiRecordingDraft({
      consultation_reason: "Editado pelo revisor",
      _aiIngestionRaw: { consultation_reason: "Original da gravacao" },
    });
    expect(s.filled).toEqual([{ path: "consultation_reason", value: "Editado pelo revisor" }]);
    expect(s.otherStored).toEqual({});
  });

  it("the stored data is not mutated", () => {
    const data = {
      _aiIngestionRaw: { systems_review: { cardiovascular: "Sem alteracoes" } },
      systems_review: { cardiovascular: "Sem alteracoes", respiratory: "Revisor sintetico" },
    };
    const before = JSON.stringify(data);
    summariseAiRecordingDraft(data);
    expect(JSON.stringify(data)).toBe(before);
  });
});
