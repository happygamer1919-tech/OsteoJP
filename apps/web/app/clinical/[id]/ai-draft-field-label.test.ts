/**
 * ai-draft-field-label.test.ts: THE AI DRAFT PANEL SPEAKS THE FICHA'S LANGUAGE.
 *
 * FICHA-IMPORTED-VIEW round 1. The recording-draft panel labelled each filled
 * field with its English contract key. `aiDraftFieldLabel` now resolves the
 * key to the Ficha Medica template's own label, as the form does.
 *
 * Checked against the CURRENT seed (the highest osteopathy version on disk),
 * for all twelve contract keys, so a template version that moved or dropped a
 * field would fall back to a raw key here and fail.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseTemplateSchema, type FieldSchema, type TemplateSchema } from "@/lib/clinical/form-template";
import { FICHA_MEDICA_AI_KEYS } from "@/lib/clinical/ficha-medica";

import { aiDraftFieldLabel } from "./ai-recording-draft";

type Seed = { key: string; version: number; schema: unknown };

function currentFichaSchema(): TemplateSchema {
  const dir = path.join(__dirname, "../../../../../packages/db/seed/form-templates");
  const seeds = readdirSync(dir)
    .filter((f) => /^osteopathy-v\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Seed)
    .filter((t) => t.key === "osteopathy");
  expect(seeds.length).toBeGreaterThan(0);
  const current = seeds.reduce((a, b) => (b.version > a.version ? b : a));
  const schema = parseTemplateSchema(current.schema);
  expect(schema).not.toBeNull();
  return schema!;
}

const schema = currentFichaSchema();

describe("aiDraftFieldLabel", () => {
  it.each(FICHA_MEDICA_AI_KEYS.map((k) => [k]))(
    "%s gets a Portuguese label from the current template, not its key",
    (key) => {
      // What the template itself says, segment by segment.
      const want: string[] = [];
      let field: FieldSchema | undefined = { properties: schema.properties };
      for (const segment of key.split(".")) {
        field = field?.properties?.[segment];
        const pt = field?.["x-label"]?.pt;
        expect(pt, `the current template has a pt label at ${key}`).toBeTruthy();
        want.push(pt!);
      }
      const label = aiDraftFieldLabel(schema, key, "pt");
      expect(label).toBe(want.join(" · "));
      expect(label).not.toContain(key);
      expect(label).not.toContain("_");
    },
  );

  it("a nested key reads as its section, then its field", () => {
    const section = schema.properties.systems_review!;
    const leaf = section.properties!.neurological!;
    expect(aiDraftFieldLabel(schema, "systems_review.neurological", "pt")).toBe(
      `${section["x-label"]!.pt} · ${leaf["x-label"]!.pt}`,
    );
  });

  it("follows the locale it is given", () => {
    const field = schema.properties.consultation_reason!;
    expect(aiDraftFieldLabel(schema, "consultation_reason", "en")).toBe(field["x-label"]!.en);
    expect(aiDraftFieldLabel(schema, "consultation_reason", "pt")).toBe(field["x-label"]!.pt);
  });

  it("falls back to the key path with no schema, or when the template has no such field", () => {
    expect(aiDraftFieldLabel(null, "systems_review.neurological", "pt")).toBe("systems_review.neurological");
    expect(aiDraftFieldLabel(schema, "not_a_field", "pt")).toBe("not_a_field");
    expect(aiDraftFieldLabel(schema, "systems_review.not_a_leaf", "pt")).toBe("systems_review.not_a_leaf");
  });

  it("a field with no x-label shows its own key segment, as the form does", () => {
    const bare: TemplateSchema = {
      properties: { consultation_reason: {}, systems_review: { properties: { neurological: {} } } },
    };
    expect(aiDraftFieldLabel(bare, "consultation_reason", "pt")).toBe("consultation_reason");
    expect(aiDraftFieldLabel(bare, "systems_review.neurological", "pt")).toBe("systems_review · neurological");
  });
});
