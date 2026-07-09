import { describe, expect, it } from "vitest";
import v3 from "../seed/form-templates/osteopathy-v3.json";

// W5-15 (SPEC-ficha-medica.md sec 5.10-5.13) — proves the Ficha Médica v3 seed
// carries the new 5.10-5.13 fields in the authoritative sequence AFTER
// bodychart, that the NEW fields are ai_extractable:false, and that the twelve
// AI keys are UNCHANGED and still ai_extractable:true (SPEC sec 2 compatibility).

type Field = {
  ai_extractable?: boolean;
  "x-widget"?: string;
  properties?: Record<string, Field>;
};

const props = v3.schema.properties as Record<string, Field>;
const order = Object.keys(props);

// The twelve AI keys (dotted for systems_review.*). Identity from osteopathy v2.
const AI_KEYS = [
  "consultation_reason",
  "relief_aggravation",
  "clinical_history",
  "systems_review.neurological",
  "systems_review.cardiovascular",
  "systems_review.respiratory",
  "systems_review.gastrointestinal",
  "systems_review.urological_gynecological",
  "systems_review.endocrine",
  "treatment_objectives",
  "treatment_plan",
  "observations",
];

function readFlag(path: string): boolean | undefined {
  const parts = path.split(".");
  let node: Field | undefined = props[parts[0]!];
  for (const seg of parts.slice(1)) node = node?.properties?.[seg];
  return node?.ai_extractable;
}

describe("osteopathy v3 stays key osteopathy / version 3 (identity ingestion)", () => {
  it("is key=osteopathy, version=3, title Ficha Clínica (W5-23 display rename)", () => {
    expect(v3.key).toBe("osteopathy");
    expect(v3.version).toBe(3);
    expect(v3.title.pt).toBe("Ficha Clínica");
  });
});

describe("SPEC 5.10-5.13 field sequence (authoritative, after bodychart)", () => {
  it("places 5.10-5.13 fields immediately after bodychart, in order", () => {
    const from = order.indexOf("bodychart");
    const tail = order.slice(from);
    expect(tail).toEqual([
      "bodychart",
      "mobilidade",
      "mobilidade_observacoes",
      "neurological_tests",
      "special_tests",
      "diagnostico",
      "tratamento",
      "treatment_plan",
      "treatment_objectives",
      "observations",
    ]);
  });

  it("keeps BOTH Plano de Tratamento and Objectivos do Tratamento after Tratamento (Q-W5-2 keep both)", () => {
    expect(order.indexOf("tratamento")).toBeLessThan(order.indexOf("treatment_plan"));
    expect(order.indexOf("tratamento")).toBeLessThan(order.indexOf("treatment_objectives"));
    expect(props.treatment_plan).toBeDefined();
    expect(props.treatment_objectives).toBeDefined();
  });

  it("routes the mobilidade field via the mobilidade x-widget with three regions", () => {
    expect(props.mobilidade?.["x-widget"]).toBe("mobilidade");
    expect(Object.keys(props.mobilidade?.properties ?? {})).toEqual([
      "cervical",
      "dorsal",
      "lombar",
    ]);
  });
});

describe("AI-extractable flags (SPEC sec 2 compatibility)", () => {
  it("the twelve AI keys stay ai_extractable:true and unchanged", () => {
    expect(AI_KEYS).toHaveLength(12);
    for (const key of AI_KEYS) {
      expect(readFlag(key), `${key} must stay ai_extractable:true`).toBe(true);
    }
  });

  it("every NEW field (5.10-5.13) is ai_extractable:false", () => {
    for (const key of [
      "mobilidade",
      "mobilidade_observacoes",
      "neurological_tests",
      "special_tests",
      "diagnostico",
      "tratamento",
    ]) {
      expect(props[key]?.ai_extractable, `${key} must be ai_extractable:false`).toBe(false);
    }
  });
});
