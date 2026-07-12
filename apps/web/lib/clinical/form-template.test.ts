import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import {
  parseTemplateSchema,
  projectAiExtractableData,
  validateRecordData,
  widgetOf,
  type FieldSchema,
  type TemplateSchema,
} from "./form-template";

// Pins the invariant that data.private_notes — the therapist-private
// "NOTAS PESSOAIS" field — is NEVER included in the payload sent to the AI
// extraction partner.
//
// The mechanism: every form template marks private_notes with
// ai_extractable: false (regression-guarded in
// packages/db/tests/private-notes-template-guard.test.ts). The
// projectAiExtractableData projection only copies fields where
// ai_extractable === true (DEFAULT-DENY), so private_notes is dropped
// regardless of what the record's data blob contains.

const PRIVATE = "THERAPIST_PRIVATE_DO_NOT_EXTRACT";

const schema: TemplateSchema = {
  properties: {
    main_complaints: {
      type: "string",
      "x-widget": "textarea",
      ai_extractable: true,
    } satisfies FieldSchema,
    treatment_plan: {
      type: "string",
      "x-widget": "textarea",
      ai_extractable: true,
    } satisfies FieldSchema,
    private_notes: {
      type: ["string", "null"],
      "x-widget": "textarea",
      ai_extractable: false,
      "x-private": true,
    } satisfies FieldSchema,
    red_flags: {
      type: ["string", "null"],
      "x-widget": "textarea",
      ai_extractable: false,
    } satisfies FieldSchema,
    weight_kg: {
      type: "number",
      // no ai_extractable flag — excluded by default-deny
    } satisfies FieldSchema,
  },
};

const data: Record<string, unknown> = {
  main_complaints: "lombalgia há 2 semanas",
  treatment_plan: "mobilização articular L4-L5",
  private_notes: PRIVATE,
  red_flags: "suspected fracture — PRIVATE",
  weight_kg: 72,
  unknown_future_field: "should be dropped",
};

describe("projectAiExtractableData — private_notes never in AI extraction output", () => {
  const out = projectAiExtractableData(data, schema);
  const serialized = JSON.stringify(out);

  it("NEVER includes private_notes (the critical guard)", () => {
    expect(out).not.toHaveProperty("private_notes");
    expect(serialized).not.toContain("private_notes");
    expect(serialized).not.toContain(PRIVATE);
  });

  it("NEVER includes red_flags (also ai_extractable: false)", () => {
    expect(out).not.toHaveProperty("red_flags");
    expect(serialized).not.toContain("suspected fracture");
  });

  it("excludes fields with no ai_extractable flag (default-deny)", () => {
    expect(out).not.toHaveProperty("weight_kg");
    expect(out).not.toHaveProperty("unknown_future_field");
  });

  it("includes ONLY fields with ai_extractable: true", () => {
    expect(Object.keys(out).sort()).toEqual(["main_complaints", "treatment_plan"]);
    expect(out.main_complaints).toBe("lombalgia há 2 semanas");
    expect(out.treatment_plan).toBe("mobilização articular L4-L5");
  });

  it("returns an empty object when no fields are extractable (e.g. all private)", () => {
    const allPrivateSchema: TemplateSchema = {
      properties: {
        private_notes: { type: ["string", "null"], ai_extractable: false, "x-private": true },
        red_flags: { type: ["string", "null"], ai_extractable: false },
      },
    };
    const result = projectAiExtractableData(
      { private_notes: PRIVATE, red_flags: "something" },
      allPrivateSchema,
    );
    expect(result).toEqual({});
    expect(JSON.stringify(result)).not.toContain(PRIVATE);
  });

  it("handles a data blob with private_notes but no template field for it (key absent in schema)", () => {
    const noPrivateNoteSchema: TemplateSchema = {
      properties: {
        treatment_plan: { type: "string", ai_extractable: true },
      },
    };
    const result = projectAiExtractableData(
      { treatment_plan: "RPG", private_notes: PRIVATE },
      noPrivateNoteSchema,
    );
    expect(result).not.toHaveProperty("private_notes");
    expect(JSON.stringify(result)).not.toContain(PRIVATE);
    expect(result.treatment_plan).toBe("RPG");
  });
});

// W5-15 (SPEC-ficha-medica.md sec 5.10) — the Mobilidade Activa/Passiva widget
// is routed by the `mobilidade` x-widget seam (mirrors how bodychart routes to
// its component). These pin that the renderer resolves it correctly and does
// NOT misclassify the mobilidade object as a checkbox_group/subfields.
describe("widgetOf — mobilidade x-widget routing (SPEC 5.10)", () => {
  const mobilidadeField: FieldSchema = {
    type: "object",
    "x-widget": "mobilidade",
    properties: {
      cervical: { type: "array", items: { type: "object" } },
      dorsal: { type: "array", items: { type: "object" } },
      lombar: { type: "array", items: { type: "object" } },
    },
  };

  it("routes an x-widget: mobilidade object field to the mobilidade widget", () => {
    expect(widgetOf("mobilidade", mobilidadeField)).toBe("mobilidade");
  });

  it("does NOT fall through to subfields/checkbox_group for the mobilidade object", () => {
    const w = widgetOf("mobilidade", mobilidadeField);
    expect(w).not.toBe("subfields");
    expect(w).not.toBe("checkbox_group");
  });

  it("still routes the existing bodychart marker array to bodychart (unchanged)", () => {
    const bodychart: FieldSchema = {
      type: "array",
      items: { type: "object", properties: { marker_type: { type: "string" } } },
    };
    expect(widgetOf("bodychart", bodychart)).toBe("bodychart");
  });

  it("routes the new NEW textarea fields (mobilidade_observacoes, diagnostico, tratamento) to textarea", () => {
    const ta: FieldSchema = { type: ["string", "null"], "x-widget": "textarea" };
    expect(widgetOf("mobilidade_observacoes", ta)).toBe("textarea");
    expect(widgetOf("diagnostico", ta)).toBe("textarea");
    expect(widgetOf("tratamento", ta)).toBe("textarea");
  });
});

// W5-26 (ruling H): the EVA `intensity` on a pain_location marker is an additive
// jsonb key with NO template declaration and NO DB migration. This pins Path A —
// the save gate (validateRecordData) must ACCEPT record data whose bodychart
// markers carry an undeclared `intensity`: the validator checks required-field
// presence only, it does NOT enforce additionalProperties or recurse into array
// items, so the extra key passes through and persists verbatim.
describe("validateRecordData — additive marker `intensity` passes the save gate (W5-26 Path A)", () => {
  const v3 = JSON.parse(
    readFileSync(
      path.join(__dirname, "../../../../packages/db/seed/form-templates/osteopathy-v3.json"),
      "utf8",
    ),
  ) as { schema: unknown };
  const schema = parseTemplateSchema(v3.schema)!;

  // Minimal valid record: v3's required set is { episode_date, consultation_reason }.
  // In the live save path episode_date is auto-stamped server-side (W5-19) before
  // validation; here we set both so the check isolates the intensity passthrough.
  const baseData: Record<string, unknown> = {
    episode_date: "2026-07-11",
    consultation_reason: "Dor lombar.",
  };

  it("accepts a pain_location marker carrying `intensity` (no additionalProperties rejection)", () => {
    const withEva = {
      ...baseData,
      bodychart: [
        { marker_type: "pain_location", x: 0.4, y: 0.5, view: "anterior", intensity: 7 },
      ],
    };
    expect(validateRecordData(schema, withEva).ok).toBe(true);
  });

  it("accepts a scale-less pain_location marker (intensity optional)", () => {
    const noEva = {
      ...baseData,
      bodychart: [{ marker_type: "pain_location", x: 0.4, y: 0.5, view: "anterior" }],
    };
    expect(validateRecordData(schema, noEva).ok).toBe(true);
  });

  it("does not require or inject `intensity` on other marker types", () => {
    const other = {
      ...baseData,
      bodychart: [{ marker_type: "hypertonicity", x: 0.2, y: 0.3, view: "anterior" }],
    };
    const result = validateRecordData(schema, other);
    expect(result.ok).toBe(true);
    // The validator never mutates the input — no intensity is added.
    expect(other.bodychart[0]).not.toHaveProperty("intensity");
  });
});
