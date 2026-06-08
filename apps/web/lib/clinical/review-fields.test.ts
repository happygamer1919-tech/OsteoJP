import { describe, it, expect } from "vitest";
import {
  SAFETY_FIELD_KEYS,
  isNarrativeField,
  partitionNarrativeEdit,
} from "./review-fields";
import type { FieldSchema, TemplateSchema } from "./form-template";

// The review write path may auto-fill / edit NARRATIVE FREE-TEXT only. These
// lock that boundary so a future change can't silently widen what a reviewer
// (or an auto-fill from an AI draft / patient submission) may write into a
// clinical record. See review-fields.ts.

describe("isNarrativeField — no template (unmapped AI/patient payload)", () => {
  it("accepts a plain string value", () => {
    expect(isNarrativeField("consultation_reason", "lombalgia há 2 semanas")).toBe(true);
  });

  it("rejects safety keys even when they are free text", () => {
    for (const key of SAFETY_FIELD_KEYS) {
      expect(isNarrativeField(key, "anything")).toBe(false);
    }
  });

  it("rejects coded / structured values (arrays, objects, numbers, booleans)", () => {
    expect(isNarrativeField("cid_codes", ["M54.5"])).toBe(false);
    expect(isNarrativeField("health_problems", { diabetes: true })).toBe(false);
    expect(isNarrativeField("weight_kg", 72)).toBe(false);
    expect(isNarrativeField("flag", true)).toBe(false);
    expect(isNarrativeField("missing", null)).toBe(false);
  });
});

describe("isNarrativeField — with template (widget-tightened)", () => {
  const textareaField: FieldSchema = { type: "string", "x-widget": "textarea" };
  const enumField: FieldSchema = { type: "string", enum: ["a", "b"] };
  const numberField: FieldSchema = { type: "number" };
  const arrayField: FieldSchema = { type: "array", items: { type: "string" } };

  it("accepts a textarea/text string field", () => {
    expect(isNarrativeField("treatment_plan", "mobilização", textareaField)).toBe(true);
  });

  it("rejects a coded enum (select stored as string)", () => {
    expect(isNarrativeField("severity", "a", enumField)).toBe(false);
  });

  it("rejects number/array fields regardless of value type", () => {
    expect(isNarrativeField("weight_kg", "72", numberField)).toBe(false);
    expect(isNarrativeField("cid_codes", "M54.5", arrayField)).toBe(false);
  });
});

describe("partitionNarrativeEdit", () => {
  it("keeps narrative, rejects safety + coded with reasons", () => {
    const { narrative, rejected } = partitionNarrativeEdit({
      consultation_reason: "dor lombar",
      treatment_plan: "RPG 1x/semana",
      red_flags: "perda de peso", // safety → manual
      cid_codes: ["M54.5"], // coded value
      weight_kg: 72, // coded value
    });
    expect(narrative).toEqual({
      consultation_reason: "dor lombar",
      treatment_plan: "RPG 1x/semana",
    });
    expect(rejected).toEqual({
      red_flags: "safety",
      cid_codes: "coded",
      weight_kg: "coded",
    });
  });

  it("tightens against the template (enum string → coded)", () => {
    const schema: TemplateSchema = {
      properties: {
        notes: { type: "string", "x-widget": "textarea" },
        severity: { type: "string", enum: ["low", "high"] },
      },
    };
    const { narrative, rejected } = partitionNarrativeEdit(
      { notes: "evolução positiva", severity: "high" },
      schema,
    );
    expect(narrative).toEqual({ notes: "evolução positiva" });
    expect(rejected).toEqual({ severity: "coded" });
  });

  it("an all-narrative edit produces no rejections", () => {
    const { rejected } = partitionNarrativeEdit({ observations: "ok" });
    expect(Object.keys(rejected)).toHaveLength(0);
  });
});
