// G1-7 AND THE HOUSE RULES, CHECKED ON EVERY LESSON FILE.
//
//   * every lesson is under 200 words, counting everything a viewer could read
//     (every role block included; front matter and image lines left out);
//   * every lesson has its capture pair, or "images: null" in the JSON (the
//     page then shows "sem imagem"): never a path to a file that is not there;
//   * no dash character in any lesson file, and no hyphen used as punctuation;
//   * every **bold** term quotes a UI label verbatim from
//     packages/i18n/src/strings.pt.json, except the composed labels listed
//     below, each of which is checked against the template that composes it.
//
// Each rule is proved both ways on seeded text: a red arm shows it refuses an
// offence, and a null arm shows it still accepts a clean case.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTENT_DIR, PUBLIC_DIR, WORD_LIMIT, loadGuide } from "../../../../docs/guide/build/guide-model.mjs";
import { POSTPONE_WEEKS } from "../followup/postpone-weeks";

import { GUIDE_DATA, type GuideBlock } from "./guide";
import { INICIO_SECTION, exampleLesson, loadFixture } from "./guide-test-fixture";

const STRINGS_PT = JSON.parse(
  readFileSync(join(__dirname, "../../../../packages/i18n/src/strings.pt.json"), "utf8"),
) as Record<string, string>;
const UI_LABELS = new Set(Object.values(STRINGS_PT));

// A UI label the platform composes from a template, which therefore is not a
// strings.pt.json value as written. Each entry names its template key and the
// values that fill it; a test below rebuilds the label from the template, so
// the allow list cannot drift from the UI either.
const COMPOSED_LABELS: Record<string, { key: string; fill: Record<string, string> }> = {
  "2 semanas": { key: "followup.postponeWeeks", fill: { n: "2" } },
  "4 semanas": { key: "followup.postponeWeeks", fill: { n: "4" } },
  "8 semanas": { key: "followup.postponeWeeks", fill: { n: "8" } },
  "12 semanas": { key: "followup.postponeWeeks", fill: { n: "12" } },
};

// Written independently of guide-model.mjs: every dash look-alike by code
// point (U+2010 to U+2015, the minus sign, the small and fullwidth forms).
const DASH = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/u;
const HYPHEN_AS_PUNCTUATION = /(^|\s)-|-(\s|$)|--/;

/** Every file of the lesson source: docs/guide/content/NN-<section>/*.md. */
function lessonFiles(): { rel: string; lines: string[] }[] {
  const out: { rel: string; lines: string[] }[] = [];
  for (const folder of readdirSync(CONTENT_DIR).sort()) {
    const dir = join(CONTENT_DIR, folder);
    if (!/^\d\d-/.test(folder) || !statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".md")) continue;
      out.push({ rel: `${folder}/${name}`, lines: readFileSync(join(dir, name), "utf8").split(/\r?\n/) });
    }
  }
  return out;
}

/** The line index of the front matter's closing fence, or 0 when there is none. */
function fenceEnd(lines: string[]): number {
  return lines[0] === "---" ? Math.max(0, lines.indexOf("---", 1)) : 0;
}

function dashProblems(rel: string, lines: string[]): string[] {
  const end = fenceEnd(lines);
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (DASH.test(line)) out.push(`${rel}:${i + 1}: a dash character`);
    const isFence = end > 0 && (i === 0 || i === end);
    if (!isFence && HYPHEN_AS_PUNCTUATION.test(line)) out.push(`${rel}:${i + 1}: a hyphen used as punctuation`);
  });
  return out;
}

function boldProblems(rel: string, lines: string[]): string[] {
  const out: string[] = [];
  lines.forEach((line, i) => {
    for (const match of line.matchAll(/\*\*(.+?)\*\*/g)) {
      const term = match[1];
      if (!UI_LABELS.has(term) && !(term in COMPOSED_LABELS)) out.push(`${rel}:${i + 1}: **${term}** is not a strings.pt.json value`);
    }
  });
  return out;
}

const files = lessonFiles();

describe("the lesson source is there to check", () => {
  // Zero files would pass every check below for the wrong reason.
  it("reads the 67 files of the nine sections (58 lessons, nine _seccao.md)", () => {
    expect(files).toHaveLength(67);
  });
});

describe("every lesson is under 200 words (G1-7)", () => {
  const guide = loadGuide();

  it("every lesson and section file of the source", () => {
    const over = [...guide.sections, ...guide.lessons, ...guide.faq]
      .filter((item) => item.words >= WORD_LIMIT)
      .map((item) => `${item.file}: ${item.words} words`);
    expect(guide.lessons.length).toBe(58);
    expect(over).toEqual([]);
    expect(WORD_LIMIT).toBe(200);
  });

  it("the JSON carries the same counts as the source", () => {
    const counts = new Map(guide.lessons.map((lesson) => [lesson.id, lesson.words]));
    for (const lesson of GUIDE_DATA.lessons) expect(lesson.words).toBe(counts.get(lesson.id));
  });

  it("seeded: 199 words pass, 200 are refused, and a role block's words count", () => {
    // The title line "## Uma lição de exemplo" is four words.
    const words = (n: number) => Array.from({ length: n }, () => "palavra").join(" ");
    const lesson = (body: string) =>
      loadFixture({ "01-inicio/_seccao.md": INICIO_SECTION, "01-inicio/01-exemplo.md": exampleLesson({}, body) });

    const at199 = lesson(words(195));
    expect(at199.errors).toEqual([]);
    expect(at199.lessons[0].words).toBe(199);

    const at200 = lesson(words(196));
    expect(at200.errors).toEqual(["01-inicio/01-exemplo.md:8: 200 words; a guide file stays under 200"]);

    const inRole = lesson(`${words(190)}\n\n::: terapeuta\n${words(6)}\n:::`);
    expect(inRole.lessons[0].words).toBe(200);
    expect(inRole.errors).toEqual(["01-inicio/01-exemplo.md:8: 200 words; a guide file stays under 200"]);
  });
});

describe("every lesson has its capture pair, or none and a sem imagem card (G1-7)", () => {
  const figures = (blocks: GuideBlock[]): number =>
    blocks.reduce((n, b) => n + (b.type === "figure" ? 1 : b.type === "role" ? figures(b.blocks) : 0), 0);

  it("an image in the JSON always points at a file under apps/web/public", () => {
    const missing: string[] = [];
    for (const lesson of [...GUIDE_DATA.lessons, ...GUIDE_DATA.faq]) {
      if (lesson.images === null) {
        if (figures(lesson.blocks) !== 0) missing.push(`${lesson.id}: a figure block but images is null`);
        continue;
      }
      for (const shot of [lesson.images.phone, lesson.images.desktop]) {
        if (!shot.src.startsWith("/ajuda/") || !existsSync(join(PUBLIC_DIR, shot.src))) missing.push(`${lesson.id}: ${shot.src}`);
      }
      if (figures(lesson.blocks) !== 1) missing.push(`${lesson.id}: images set but ${figures(lesson.blocks)} figure blocks`);
    }
    expect(missing).toEqual([]);
  });

  it("seeded: a capture pair that exists is read, a missing file or a lone image is refused", () => {
    const pair = [
      "![Exemplo no telemóvel](../../../../apps/web/public/ajuda/inicio/exemplo-390.png)",
      "![Exemplo no computador](../../../../apps/web/public/ajuda/inicio/exemplo-desktop.png)",
    ].join("\n");
    const pngs = ["ajuda/inicio/exemplo-390.png", "ajuda/inicio/exemplo-desktop.png"];
    const files = (front: Record<string, string>, body: string) => ({
      "01-inicio/_seccao.md": INICIO_SECTION,
      "01-inicio/01-exemplo.md": exampleLesson(front, body),
    });

    const good = loadFixture(files({ shots: "inicio.exemplo" }, `Clique em **Guardar**.\n\n${pair}`), pngs);
    expect(good.errors).toEqual([]);
    expect(good.lessons[0].images).toEqual({
      phone: { src: "/ajuda/inicio/exemplo-390.png", alt: "Exemplo no telemóvel" },
      desktop: { src: "/ajuda/inicio/exemplo-desktop.png", alt: "Exemplo no computador" },
    });

    const noFile = loadFixture(files({ shots: "inicio.exemplo" }, `Clique em **Guardar**.\n\n${pair}`), [pngs[0]]);
    expect(noFile.errors.some((e) => e.includes("image not found: ../../../../apps/web/public/ajuda/inicio/exemplo-desktop.png"))).toBe(
      true,
    );

    const lone = loadFixture(files({ shots: "inicio.exemplo" }, `Clique em **Guardar**.\n\n${pair.split("\n")[0]}`), pngs);
    expect(lone.errors.some((e) => e.includes("a lesson has one capture pair"))).toBe(true);

    const noImage = loadFixture(files({}, "Clique em **Guardar**."));
    expect(noImage.errors).toEqual([]);
    expect(noImage.lessons[0].images).toBeNull();
  });
});

describe("no dash in any lesson file", () => {
  it("no dash character, and no hyphen used as punctuation outside the front matter fences", () => {
    const offences = files.flatMap(({ rel, lines }) => dashProblems(rel, lines));
    expect(offences).toEqual([]);
  });

  it("seeded: the check refuses an em dash, an en dash and a loose hyphen, and passes palavra-passe", () => {
    const lines = (body: string) => ["---", "id: inicio.exemplo", "---", body];
    expect(dashProblems("x.md", lines("Um travessão \u2014 aqui."))).toEqual(["x.md:4: a dash character"]);
    expect(dashProblems("x.md", lines("Um traço \u2013 aqui."))).toEqual(["x.md:4: a dash character"]);
    expect(dashProblems("x.md", lines("Um outro- solto."))).toEqual(["x.md:4: a hyphen used as punctuation"]);
    expect(dashProblems("x.md", ["---", "title: Um \u2014 título", "---"])).toEqual(["x.md:2: a dash character"]);
    expect(dashProblems("x.md", lines("A palavra-passe e o e-mail ficam na ficha."))).toEqual([]);
  });
});

describe("every bold term quotes a UI label from strings.pt.json", () => {
  it("every **bold** term in the lesson source is a strings.pt.json value or an allowed composed label", () => {
    const offences = files.flatMap(({ rel, lines }) => boldProblems(rel, lines));
    expect(offences).toEqual([]);
  });

  it("each allowed composed label is its template, filled, and is in use", () => {
    const used = new Set(files.flatMap(({ lines }) => lines.flatMap((line) => [...line.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]))));
    for (const [label, { key, fill }] of Object.entries(COMPOSED_LABELS)) {
      const template = STRINGS_PT[key];
      expect(template, `${key} is not in strings.pt.json`).toBeDefined();
      const composed = template.replace(/\{(\w+)\}/g, (_, name: string) => fill[name] ?? `{${name}}`);
      expect(composed).toBe(label);
      expect(used.has(label), `${label} is on the allow list but no lesson uses it`).toBe(true);
    }
    // The four postponement labels are the four choices the screen offers.
    expect([...POSTPONE_WEEKS].map((n) => `${n} semanas`)).toEqual(Object.keys(COMPOSED_LABELS));
  });

  it("seeded: an invented label is refused, a real one passes", () => {
    expect(boldProblems("x.md", ["Clique em **Botão Inventado**."])).toEqual([
      "x.md:1: **Botão Inventado** is not a strings.pt.json value",
    ]);
    expect(boldProblems("x.md", ["Clique em **Guardar** e depois em **Nova marcação**."])).toEqual([]);
  });
});

// G1-2's "Perguntas frequentes, the 7 base tasks first": the seven FAQ entries
// of the ruled proposal (its table "The seven FAQ entries"), each named by the
// slug PR 4 gives its file in docs/guide/content/00-perguntas, and each linked
// from its primary lesson by that lesson's "faq:" key. Once 00-perguntas has
// files, guide-model.mjs refuses a slug that names none of them.
const FAQ_BASE_TASKS: Record<string, string> = {
  "marcar-consulta": "agenda.marcar-consulta",
  "marcar-em-lote": "agenda.marcar-varias-sessoes",
  "adicionar-paciente": "pacientes.registar-paciente",
  "atribuir-pacote": "pacotes.atribuir-pacote",
  "bloquear-horario": "agenda.bloquear-horario",
  "concluir-consulta": "agenda.registar-o-estado",
  "assinar-registo": "registos.assinar-registo",
};

describe("each of the seven FAQ base tasks is linked from its primary lesson (G1-2)", () => {
  it("every faq slug in the source is one of the seven, named by exactly its primary lesson", () => {
    const guide = loadGuide();
    const namedBy: Record<string, string> = {};
    for (const lesson of guide.lessons) {
      for (const slug of lesson.faq) namedBy[slug] = namedBy[slug] ? `${namedBy[slug]}, ${lesson.id}` : lesson.id;
    }
    expect(namedBy).toEqual(FAQ_BASE_TASKS);
  });
});
