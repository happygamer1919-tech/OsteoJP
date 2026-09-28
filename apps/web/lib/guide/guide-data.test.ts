// G1-4 FOR /ajuda: ONE CONTENT SOURCE. guide-data.json is what /ajuda renders,
// and it must be exactly what docs/guide/build/gen-guide-data.mjs makes from
// the lesson files. This test regenerates it in memory through guide-model.mjs
// and fails when the committed file differs, so a lesson edited without
// regenerating the JSON fails its own PR. (The PDF half of G1-4 is
// guide-pdf.test.ts: the committed PDFs are held to the same source.)
//
// The seeded arms copy the source into a temporary tree, change ONE byte, and
// prove the regeneration no longer matches, naming the lesson that changed.
// Their null arm proves the copy itself regenerates to the committed bytes, so
// the red arms are red because of the byte, not because of the copy.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CONTENT_DIR,
  GUIDE_DATA_FILE,
  PUBLIC_DIR,
  loadGuide,
  renderGuideData,
} from "../../../../docs/guide/build/guide-model.mjs";

type Item = { id: string };
type Data = { lessons: Item[]; sections: Item[]; faq: Item[]; held: Item[] };

const committed = readFileSync(GUIDE_DATA_FILE, "utf8");

/** The ids whose JSON differs between two renderings: sections, lessons and FAQ entries. */
function changedIds(a: string, b: string): string[] {
  const left = JSON.parse(a) as Data;
  const right = JSON.parse(b) as Data;
  const byId = (data: Data) =>
    new Map([...data.sections, ...data.lessons, ...data.faq].map((item) => [item.id, JSON.stringify(item)]));
  const l = byId(left);
  const r = byId(right);
  const ids = new Set([...l.keys(), ...r.keys()]);
  return [...ids].filter((id) => l.get(id) !== r.get(id)).sort();
}

describe("guide-data.json is regenerated from the lesson source (G1-4 for /ajuda)", () => {
  it("the committed file is byte for byte a fresh regeneration of docs/guide/content", () => {
    const fresh = renderGuideData();
    const changed = fresh === committed ? [] : changedIds(committed, fresh);
    expect(
      fresh === committed,
      `apps/web/lib/guide/guide-data.json is stale (changed: ${changed.join(", ") || "top-level fields"}). ` +
        "Run: node docs/guide/build/gen-guide-data.mjs",
    ).toBe(true);
  });

  // An empty or unread source would regenerate to an empty file that could
  // match an empty committed one. The source is the 58 lessons of nine
  // sections and the seven FAQ entries of 00-perguntas.
  it("the regeneration reads the real source: nine sections, 58 lessons (one held), seven FAQ entries", () => {
    const guide = loadGuide();
    expect(guide.errors).toEqual([]);
    expect(guide.sections).toHaveLength(9);
    expect(guide.lessons).toHaveLength(58);
    expect(guide.faq).toHaveLength(7);
    const data = JSON.parse(committed) as Data;
    expect(data.lessons).toHaveLength(57);
    expect(data.faq).toHaveLength(7);
    expect(data.held.map((item) => item.id)).toEqual(["marcacao-online.pedido-de-cliente-novo"]);
  });
});

describe("the drift check catches a one byte change (seeded)", () => {
  let root = "";
  let contentDir = "";
  let publicDir = "";
  const render = () => renderGuideData({ contentDir, publicDir });

  beforeAll(() => {
    // Laid out like the repository, so a lesson's capture path
    // (../../../../apps/web/public/ajuda/...) resolves inside the copy.
    root = mkdtempSync(join(tmpdir(), "guide-drift-"));
    contentDir = join(root, "docs", "guide", "content");
    publicDir = join(root, "apps", "web", "public");
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    symlinkSync(PUBLIC_DIR, publicDir, "dir");
    cpSync(CONTENT_DIR, contentDir, { recursive: true });
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const edit = (rel: string, change: (text: string) => string) => {
    const file = join(contentDir, rel);
    const before = readFileSync(file, "utf8");
    const after = change(before);
    expect(Buffer.byteLength(after) - Buffer.byteLength(before)).toBe(0);
    expect(after).not.toBe(before);
    writeFileSync(file, after);
    return () => writeFileSync(file, before);
  };

  it("null arm: the unchanged copy regenerates to the committed bytes", () => {
    expect(render()).toBe(committed);
  });

  it("one byte of a lesson body changed: the regeneration differs, in that lesson only", () => {
    const restore = edit("02-agenda/02-marcar-consulta.md", (text) => text.replace("Clique em **Nova", "Clique em **nova"));
    try {
      const fresh = render();
      expect(fresh).not.toBe(committed);
      expect(changedIds(committed, fresh)).toEqual(["agenda.marcar-consulta"]);
    } finally {
      restore();
    }
  });

  it("one byte of a front matter value changed: the regeneration differs", () => {
    const restore = edit("06-faturacao/02-faturas-de-um-paciente.md", (text) =>
      text.replace("order: rececao 2, terapeuta 1, proprietario 4", "order: rececao 2, terapeuta 1, proprietario 5"),
    );
    try {
      const fresh = render();
      expect(fresh).not.toBe(committed);
      expect(changedIds(committed, fresh)).toEqual(["faturacao.faturas-de-um-paciente"]);
    } finally {
      restore();
    }
  });

  it("one byte of an FAQ answer changed: the regeneration differs, in that entry only", () => {
    const restore = edit("00-perguntas/01-marcar-consulta.md", (text) => text.replace("Na **Agenda**", "na **Agenda**"));
    try {
      const fresh = render();
      expect(fresh).not.toBe(committed);
      expect(changedIds(committed, fresh)).toEqual(["perguntas.marcar-consulta"]);
    } finally {
      restore();
    }
  });

  it("after the arms restore their byte, the copy matches again", () => {
    expect(render()).toBe(committed);
  });
});
