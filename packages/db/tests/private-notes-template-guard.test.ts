import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: private_notes must NEVER have ai_extractable: true in any
// form template. This test fails the moment someone accidentally adds or changes
// the flag, before any code ships.
//
// Covers both template locations:
//   packages/db/seed/form-templates/   — canonical clinical record templates
//   apps/portal/lib/forms/templates/   — portal intake form templates
//
// Companion tests:
//   apps/web/lib/clinical/form-template.test.ts  — AI-extractable projection
//   apps/api/lib/fichas/read.test.ts              — patient-facing API envelope

const REPO_ROOT = path.resolve(__dirname, "../../..");

const TEMPLATE_DIRS = [
  path.join(REPO_ROOT, "packages/db/seed/form-templates"),
  path.join(REPO_ROOT, "apps/portal/lib/forms/templates"),
];

interface FieldDef {
  ai_extractable?: unknown;
  [key: string]: unknown;
}

interface TemplateSummary {
  file: string;
  dir: string;
  privateNotes: FieldDef | null;
  hasPrivateNotes: boolean;
}

function loadTemplates(): TemplateSummary[] {
  const results: TemplateSummary[] = [];
  for (const dir of TEMPLATE_DIRS) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
      const schema = (raw.schema as Record<string, unknown> | undefined) ?? raw;
      const props = (schema.properties as Record<string, FieldDef> | undefined) ?? {};
      const privateNotes = props["private_notes"] ?? null;
      results.push({
        file,
        dir,
        privateNotes,
        hasPrivateNotes: privateNotes !== null,
      });
    }
  }
  return results;
}

describe("private_notes template guard — ai_extractable must never be true", () => {
  const templates = loadTemplates();
  const withPrivateNotes = templates.filter((t) => t.hasPrivateNotes);

  it("finds at least one template with a private_notes field (sanity check)", () => {
    expect(withPrivateNotes.length).toBeGreaterThan(0);
  });

  it("every template that has private_notes declares ai_extractable: false", () => {
    const violations = withPrivateNotes.filter(
      (t) => t.privateNotes?.ai_extractable !== false,
    );
    if (violations.length > 0) {
      const names = violations.map((v) => `${v.dir}/${v.file} (ai_extractable=${String(v.privateNotes?.ai_extractable)})`);
      throw new Error(
        `private_notes must have ai_extractable: false in ALL templates.\nViolations:\n${names.join("\n")}`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("no template has private_notes with ai_extractable: true", () => {
    const leaked = templates.filter(
      (t) => t.hasPrivateNotes && t.privateNotes?.ai_extractable === true,
    );
    expect(leaked).toHaveLength(0);
  });

  it("no template has private_notes with no ai_extractable flag at all (flag must be explicit)", () => {
    // Requiring the flag to be explicit (not just absent) means the template
    // author had to make a deliberate choice. A missing flag is treated the same
    // as false by projectAiExtractableData (default-deny), but we want explicit
    // intent in every template that carries the field.
    const noFlag = withPrivateNotes.filter(
      (t) => t.privateNotes?.ai_extractable === undefined,
    );
    if (noFlag.length > 0) {
      const names = noFlag.map((v) => `${v.dir}/${v.file}`);
      throw new Error(
        `private_notes must have an explicit ai_extractable flag in all templates.\nMissing flag in:\n${names.join("\n")}`,
      );
    }
    expect(noFlag).toHaveLength(0);
  });

  it("every template with x-private: true also has ai_extractable: false (consistency)", () => {
    for (const dir of TEMPLATE_DIRS) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
        const schema = (raw.schema as Record<string, unknown> | undefined) ?? raw;
        const props = (schema.properties as Record<string, FieldDef> | undefined) ?? {};
        for (const [key, field] of Object.entries(props)) {
          if (field["x-private"] === true) {
            expect(
              field.ai_extractable,
              `${file}: field "${key}" has x-private: true but ai_extractable is not false`,
            ).toBe(false);
          }
        }
      }
    }
  });
});
