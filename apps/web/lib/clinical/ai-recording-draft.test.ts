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
    // might carry some. The name is listed here; the value is kept in
    // `payloadRest` (round 3, below).
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
    // The recording filled no field...
    expect(s.filled).toEqual([]);
    // ...but the reviewer's text is not dropped.
    expect(s.otherStored).toEqual({ observations: "Texto do revisor sintetico" });
    // ROUND 3: and the record is not called empty. "Nenhum campo da ficha foi
    // preenchido" is false of a record whose `observations` holds text.
    expect(s.empty).toBe(false);
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

/**
 * ROUND 3 (reviewer, behaviour lens). Two defects, one cause: the summary
 * decided what to show from the CONTRACT (the twelve keys and the names of the
 * rest), not from what is STORED.
 *
 * MAJOR: the raw payload was dropped from `otherStored`, and an unrecognised
 * key reached the page by NAME only, so its value was on no screen. On
 * origin/main the same draft printed the whole payload as JSON.
 *
 * MINOR: a known container key holding a non-object (`systems_review` as text
 * or a list) filled no field and was not "unknown", so a draft that carries
 * content was announced as empty.
 *
 * The invariant now pinned: every value of the stored payload is either shown
 * in a field (the same value) or kept in `payloadRest`, and "empty" is said only
 * when nothing stored carries a value (the template's name aside).
 */
describe("summariseAiRecordingDraft: payloadRest, the stored payload the fields do not show", () => {
  /** Every leaf of a stored value, with its dotted path. Arrays are leaves. */
  function leavesOf(v: unknown, prefix = ""): { path: string; value: unknown }[] {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return [{ path: prefix, value: v }];
      return entries.flatMap(([k, inner]) => leavesOf(inner, prefix ? `${prefix}.${k}` : k));
    }
    return [{ path: prefix, value: v }];
  }
  const readPath = (v: unknown, path: string): unknown =>
    path === ""
      ? v
      : path.split(".").reduce<unknown>(
          (cur, seg) =>
            cur && typeof cur === "object" && !Array.isArray(cur)
              ? (cur as Record<string, unknown>)[seg]
              : undefined,
          v,
        );
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  /** Adversarial stored shapes: each one hid a value or misreported emptiness somewhere. */
  const SHAPES: [string, Record<string, unknown>][] = [
    ["an unrecognised key with a value", stored({ ...allContractKeysNull(), alarm_symptoms: "sim" })],
    [
      "an unrecognised nested leaf",
      stored({ systems_review: { neurological: "Parestesias", neurological_v2: "Cefaleia sintetica" } }),
    ],
    ["a known container holding text", stored({ template: "osteopathy", systems_review: "Sem queixas sinteticas" })],
    ["a known container holding a list", stored({ systems_review: ["Tonturas sinteticas"] })],
    ["a list at a known leaf", stored({ consultation_reason: ["Dor A sintetica", "Dor B sintetica"] })],
    [
      "metadata with values next to a filled field",
      stored({ template: "osteopathy", treatment_plan: "Plano sintetico", _ai_meta: { confidence: 0.4 } }),
    ],
    [
      "a reviewer edit that differs from the recording",
      {
        _aiIngestionRaw: { consultation_reason: "Original da gravacao", clinical_history: "Historia sintetica" },
        consultation_reason: "Editado pelo revisor",
      },
    ],
    ["the complaint's empty extraction", stored({ template: "osteopathy", ...allContractKeysNull() })],
  ];

  it.each(SHAPES)("%s: every stored payload value is in a field or in payloadRest", (_label, data) => {
    const s = summariseAiRecordingDraft(data);
    const raw = data._aiIngestionRaw;
    const leaves = leavesOf(raw);
    expect(leaves.length).toBeGreaterThan(0);
    for (const { path, value } of leaves) {
      const shownInField = s.filled.some((f) => f.path === path && same(f.value, value));
      const keptInRest = same(readPath(s.payloadRest, path), value);
      expect(shownInField || keptInRest, `stored payload value at ${path} is on the page`).toBe(true);
    }
  });

  it("THE DEFECT: an unrecognised key's VALUE is kept, not only its name", () => {
    const s = summariseAiRecordingDraft(stored({ ...allContractKeysNull(), alarm_symptoms: "sim" }));
    expect(s.unknownKeys).toEqual(["alarm_symptoms"]);
    expect(readPath(s.payloadRest, "alarm_symptoms")).toBe("sim");
    expect(s.payloadRestHasContent).toBe(true);
  });

  it("a filled value is shown once: it is removed from the rest when the field shows that same value", () => {
    const s = summariseAiRecordingDraft(
      stored({ template: "osteopathy", consultation_reason: "Dor sintetica", systems_review: { neurological: "X" } }),
    );
    expect(s.payloadRest).toEqual({ template: "osteopathy" });
    expect(s.payloadRestHasContent).toBe(false);
  });

  it("a claim-projected draft keeps the recording's nulls in the rest, and each filled value once", () => {
    const raw = { template: "osteopathy", consultation_reason: "Dor sintetica", systems_review: { neurological: "X", endocrine: null } };
    const s = summariseAiRecordingDraft(projectAiPayloadOntoFichaFields(stored(raw)).data);
    expect(s.payloadRest).toEqual({ template: "osteopathy", systems_review: { endocrine: null } });
    expect(s.otherStored).toEqual({});
  });

  it("a reviewer edit is in the field, and the recording's own value stays in the rest", () => {
    const s = summariseAiRecordingDraft({
      consultation_reason: "Editado pelo revisor",
      _aiIngestionRaw: { consultation_reason: "Original da gravacao" },
    });
    expect(s.filled).toEqual([{ path: "consultation_reason", value: "Editado pelo revisor" }]);
    expect(s.payloadRest).toEqual({ consultation_reason: "Original da gravacao" });
  });

  it("a payload that is not an object is kept whole, and is content", () => {
    for (const raw of ["Transcricao sintetica", ["a sintetico"], 7]) {
      const s = summariseAiRecordingDraft({ _aiIngestionRaw: raw });
      expect(s.payloadRest).toEqual(raw);
      expect(s.payloadRestHasContent).toBe(true);
      expect(s.empty).toBe(false);
    }
  });

  it("no payload, or a payload with nothing left over, has no rest", () => {
    expect(summariseAiRecordingDraft({}).payloadRest).toBeUndefined();
    expect(summariseAiRecordingDraft({ _aiIngestionRaw: null }).payloadRest).toBeUndefined();
    expect(summariseAiRecordingDraft(stored({ consultation_reason: "Dor sintetica" })).payloadRest).toBeUndefined();
  });
});

describe("summariseAiRecordingDraft: 'empty' only when nothing stored carries a value", () => {
  it.each([
    ["a known container holding text", { systems_review: "Sem queixas sinteticas" }],
    ["a known container holding a list", { systems_review: ["Tonturas sinteticas"] }],
    ["a known container holding a number", { systems_review: 3 }],
    ["a metadata block with a value", { template: "osteopathy", _ai_meta: { confidence: 0.4 } }],
    ["a false answer", { _flags: { red_flag: false } }],
  ])("THE DEFECT: %s is NOT an empty extraction", (_label, payload) => {
    const s = summariseAiRecordingDraft(stored(payload));
    expect(s.filled).toEqual([]);
    expect(s.empty).toBe(false);
    expect(s.payloadRestHasContent).toBe(true);
  });

  it("the complaint's shape (template name, every value null) is still empty, and its rest is kept", () => {
    const payload = { template: "osteopathy", ...allContractKeysNull() };
    const s = summariseAiRecordingDraft(stored(payload));
    expect(s.empty).toBe(true);
    expect(s.payloadRest).toEqual(payload);
    expect(s.payloadRestHasContent).toBe(false);
  });

  it("the template's NAME is the one stored value that does not make a recording non-empty", () => {
    expect(summariseAiRecordingDraft(stored({ template: "osteopathy" })).empty).toBe(true);
    // Only as a name: a template key holding anything else is content.
    expect(summariseAiRecordingDraft(stored({ template: { campo: "Texto sintetico" } })).empty).toBe(false);
    // Only at the top of the payload: a nested `template` is content.
    expect(summariseAiRecordingDraft(stored({ _ai_meta: { template: "x" } })).empty).toBe(false);
  });

  it("empty containers and blank strings carry no value", () => {
    const s = summariseAiRecordingDraft(stored({ systems_review: {}, _ai_meta: { a: [], b: " " } }));
    expect(s.empty).toBe(true);
  });
});
