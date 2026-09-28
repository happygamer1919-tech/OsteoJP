// THE LESSON READER REFUSES WHAT THE FORMAT FORBIDS. docs/guide/build/
// guide-model.mjs reads the lesson source for /ajuda (and, in a later PR, for
// the PDF). Each rule of the format is proved here on a seeded file: the red
// arm names the exact message, and the clean fixture at the top is the null
// arm, which must load with no error at all.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  guideData,
  inlineSpans,
  lessonsFor,
  sectionsFor,
  type Guide,
} from "../../../../docs/guide/build/guide-model.mjs";

import { INICIO_SECTION, exampleLesson, guideFile, loadFixture } from "./guide-test-fixture";

const LESSON = "01-inicio/01-exemplo.md";
// A second, clean lesson for every role, so a seeded fault in the lesson under
// test is the only error: the section never loses its last lesson for a role.
const SUPPORT = guideFile(
  {
    id: "inicio.apoio",
    title: "Apoio",
    goal: "Servir a secção.",
    roles: "rececao, terapeuta, proprietario",
    order: "rececao 9, terapeuta 9, proprietario 9",
  },
  "## Apoio\n\nTexto.",
);
const load = (lesson: string, extra: Record<string, string> = {}) =>
  loadFixture({ "01-inicio/_seccao.md": INICIO_SECTION, "01-inicio/09-apoio.md": SUPPORT, [LESSON]: lesson, ...extra });
const errorsOf = (guide: Guide) => guide.errors;

describe("null arm: a clean lesson loads with no error", () => {
  it("front matter, title line, a list, bold and a role block", () => {
    const guide = load(
      exampleLesson(
        { capability: "appointments:write", review: "CARE-02a", faq: "marcar-consulta" },
        "1. Clique em **Nova marcação**.\n2. Escolha a **Data** e a palavra-passe.\n\n::: terapeuta proprietario\nSó para o terapeuta e o proprietário.\n:::\n\nFim.",
      ),
    );
    expect(errorsOf(guide)).toEqual([]);
    const lesson = guide.lessons[0];
    expect(lesson.id).toBe("inicio.exemplo");
    expect(lesson.order).toEqual({ rececao: 1, terapeuta: 1, proprietario: 1 });
    expect(lesson.blocks.map((b) => b.type)).toEqual(["list", "role", "para"]);
    const role = lesson.blocks[1];
    expect(role.type === "role" && role.roles).toEqual(["terapeuta", "proprietario"]);
  });
});

describe("the front matter", () => {
  it("refuses an unknown key", () => {
    expect(errorsOf(load(exampleLesson({ autor: "Marta Exemplo" })))).toEqual([
      `${LESSON}:7: unknown front matter key "autor"; the keys are: id title goal roles order capability screens shots faq question answers see review hold`,
    ]);
  });

  it("refuses a lesson with no roles", () => {
    const text = guideFile(
      { id: "inicio.exemplo", title: "Uma lição de exemplo", goal: "Provar o leitor." },
      "## Uma lição de exemplo\n\nTexto.",
    );
    expect(errorsOf(load(text))).toEqual([`${LESSON}:1: missing front matter key "roles"`]);
  });

  it("refuses a dash character and a loose hyphen in a value, and accepts palavra-passe", () => {
    expect(errorsOf(load(exampleLesson({ goal: "Mudar a palavra\u2014passe." })))).toEqual([
      `${LESSON}:4: the value of "goal" contains a dash character, em dash (U+2014)`,
    ]);
    expect(errorsOf(load(exampleLesson({ goal: "Mudar a conta - e a palavra-passe." })))).toEqual([
      `${LESSON}:4: the value of "goal" uses a hyphen as punctuation; a hyphen belongs only inside a word`,
    ]);
    expect(errorsOf(load(exampleLesson({ goal: "Mudar a palavra-passe e o e-mail." })))).toEqual([]);
  });

  it("refuses an id that is not <section>.<slug> of its folder and name", () => {
    expect(errorsOf(load(exampleLesson({ id: "agenda.exemplo" })))).toEqual([
      `${LESSON}:2: the id of this file is "inicio.exemplo", from its folder and name`,
    ]);
  });

  it("refuses an order that misses a role or names one the lesson does not have", () => {
    expect(errorsOf(load(exampleLesson({ order: "rececao 1, terapeuta 1" })))).toEqual([
      `${LESSON}:6: order gives no position to "proprietario"`,
    ]);
    expect(errorsOf(load(exampleLesson({ roles: "rececao", order: "rececao 1, terapeuta 2" })))).toEqual([
      `${LESSON}:6: order gives a position to "terapeuta", which is not in roles`,
    ]);
  });

  it("refuses an unknown role", () => {
    expect(errorsOf(load(exampleLesson({ roles: "rececao, administrador", order: "rececao 1" })))).toEqual([
      `${LESSON}:5: unknown role "administrador" in roles; the roles are rececao, terapeuta, proprietario`,
    ]);
  });

  it("refuses a file that does not open with its front matter", () => {
    expect(errorsOf(load("## Uma lição de exemplo\n\nTexto.\n"))).toEqual([
      `${LESSON}:1: a guide file starts with its front matter, opened by a line of three hyphens`,
    ]);
  });
});

describe("the body", () => {
  it("starts with the title line, and has only one title", () => {
    const wrongTitle = guideFile(
      {
        id: "inicio.exemplo",
        title: "Uma lição de exemplo",
        goal: "Provar o leitor.",
        roles: "rececao, terapeuta, proprietario",
        order: "rececao 1, terapeuta 1, proprietario 1",
      },
      "## Outro título\n\nTexto.\n\n## Segundo título",
    );
    expect(errorsOf(load(wrongTitle))).toEqual([
      `${LESSON}:8: the body starts with the "## " title line, "## Uma lição de exemplo"`,
      `${LESSON}:12: a guide file has one "## " title line; use "### " for a heading inside it`,
    ]);
  });

  it("uses the chapters' Markdown lint", () => {
    expect(errorsOf(load(exampleLesson({}, "Uma [ligação](https://exemplo.pt) aqui.")))).toEqual([
      `${LESSON}:10: links are not supported; only image lines ![alt](path)`,
    ]);
  });

  it("refuses role blocks that are unclosed, nested, stray, empty, or name a role the lesson lacks", () => {
    expect(errorsOf(load(exampleLesson({}, "::: terapeuta\nTexto.")))).toEqual([
      `${LESSON}:10: this role block is never closed with ":::"`,
    ]);
    expect(errorsOf(load(exampleLesson({}, "::: terapeuta\n::: rececao\nTexto.\n:::")))).toEqual([
      `${LESSON}:11: role blocks do not nest; close the block opened on line 10 with ":::" first`,
    ]);
    expect(errorsOf(load(exampleLesson({}, "Texto.\n:::")))).toEqual([
      `${LESSON}:11: this ":::" closes a role block that was never opened`,
    ]);
    expect(errorsOf(load(exampleLesson({}, "::: terapeuta\n:::")))).toEqual([`${LESSON}:10: an empty role block`]);
    expect(
      errorsOf(load(exampleLesson({ roles: "rececao, proprietario", order: "rececao 1, proprietario 1" }, "::: terapeuta\nTexto.\n:::"))),
    ).toEqual([`${LESSON}:10: the role block names "terapeuta", which is not in this file's roles, so no viewer would see it`]);
    expect(errorsOf(load(exampleLesson({}, ":::terapeuta\nTexto.\n:::")))).toEqual([
      `${LESSON}:10: a role block line is ":::" alone, or "::: " and role names separated by one space`,
      `${LESSON}:12: this ":::" closes a role block that was never opened`,
    ]);
  });
});

describe("the source as a whole", () => {
  it("refuses a lesson role its section does not have, and a section role no lesson serves", () => {
    const section = guideFile(
      { id: "inicio", title: "Início", goal: "Orientar-se.", roles: "rececao, proprietario", order: "rececao 1, proprietario 1" },
      "## Início\n\nTexto.",
    );
    const guide = loadFixture({
      "01-inicio/_seccao.md": section,
      [LESSON]: exampleLesson({ roles: "terapeuta, proprietario", order: "terapeuta 1, proprietario 1" }),
    });
    expect(guide.errors).toEqual([
      `${LESSON}: role "terapeuta" is not in the roles of its section (01-inicio/_seccao.md), so no viewer would reach it`,
      `01-inicio/_seccao.md: the section lists "rececao", but no published lesson in it does`,
    ]);
  });

  it("refuses a section folder without its _seccao.md", () => {
    expect(loadFixture({ [LESSON]: exampleLesson() }).errors).toContain("01-inicio: no _seccao.md describing the section");
  });

  it("leaves a held lesson out of every profile's lessons and out of the JSON, and lists it as held", () => {
    const guide = load(exampleLesson(), {
      "01-inicio/02-retido.md": guideFile(
        {
          id: "inicio.retido",
          title: "Uma lição retida",
          goal: "Esperar pela publicação.",
          roles: "rececao, proprietario",
          order: "rececao 2, proprietario 2",
          hold: "GUEST-05",
        },
        "## Uma lição retida\n\nTexto.",
      ),
    });
    expect(guide.errors).toEqual([]);
    expect(guide.lessons.map((l) => l.id)).toEqual(["inicio.exemplo", "inicio.retido", "inicio.apoio"]);
    for (const profile of ["rececao", "terapeuta", "proprietario"] as const) {
      expect(lessonsFor(guide, profile).map((l) => l.id)).toEqual(["inicio.exemplo", "inicio.apoio"]);
    }
    const data = guideData(guide) as { lessons: { id: string }[]; held: { id: string; hold: string }[] };
    expect(data.lessons.map((l) => l.id)).toEqual(["inicio.exemplo", "inicio.apoio"]);
    expect(data.held).toEqual([{ id: "inicio.retido", hold: "GUEST-05" }]);
  });

  it("orders sections by the profile's section order and lessons by the profile's lesson order", () => {
    const agenda = guideFile(
      { id: "agenda", title: "Agenda", goal: "Marcar.", roles: "rececao, terapeuta, proprietario", order: "rececao 2, terapeuta 1, proprietario 2" },
      "## Agenda\n\nTexto.",
    );
    const inicio = guideFile(
      { id: "inicio", title: "Início", goal: "Entrar.", roles: "rececao, terapeuta, proprietario", order: "rececao 1, terapeuta 2, proprietario 1" },
      "## Início\n\nTexto.",
    );
    const lesson = (section: string, slug: string, order: string) =>
      guideFile(
        { id: `${section}.${slug}`, title: "Lição", goal: "Aprender.", roles: "rececao, terapeuta, proprietario", order },
        "## Lição\n\nTexto.",
      );
    const guide = loadFixture({
      "01-inicio/_seccao.md": inicio,
      "01-inicio/01-a.md": lesson("inicio", "a", "rececao 2, terapeuta 1, proprietario 1"),
      "01-inicio/02-b.md": lesson("inicio", "b", "rececao 1, terapeuta 2, proprietario 2"),
      "02-agenda/_seccao.md": agenda,
      "02-agenda/01-c.md": lesson("agenda", "c", "rececao 1, terapeuta 1, proprietario 1"),
    });
    expect(guide.errors).toEqual([]);
    expect(lessonsFor(guide, "rececao").map((l) => l.id)).toEqual(["inicio.b", "inicio.a", "agenda.c"]);
    expect(lessonsFor(guide, "terapeuta").map((l) => l.id)).toEqual(["agenda.c", "inicio.a", "inicio.b"]);
    expect(sectionsFor(guide, "terapeuta").map((e) => e.section.id)).toEqual(["agenda", "inicio"]);
  });
});

describe("the JSON carries text as spans, never HTML", () => {
  it("splits bold into its own span and keeps the rest as plain text", () => {
    expect(inlineSpans("Clique em **Guardar** e em **Nova marcação**.")).toEqual([
      { text: "Clique em " },
      { strong: "Guardar" },
      { text: " e em " },
      { strong: "Nova marcação" },
      { text: "." },
    ]);
    expect(inlineSpans("<b>sem HTML</b>")).toEqual([{ text: "<b>sem HTML</b>" }]);
  });
});

describe("one parser, not two", () => {
  // The builder of the chapter PDFs takes its lint and Markdown parser from
  // guide-model.mjs, so the lessons and the chapters are read by one parser.
  it("build-guide.mjs imports lintLine and parseBlocks and defines neither", () => {
    const source = readFileSync(join(__dirname, "../../../../docs/guide/build/build-guide.mjs"), "utf8");
    expect(source).toMatch(/import \{[^}]*\blintLine\b[^}]*\bparseBlocks\b[^}]*\} from '\.\/guide-model\.mjs';/);
    expect(source).not.toMatch(/function (parseBlocks|lintLine)\b/);
    expect(source).not.toMatch(/const (DASH_CHARS|HYPHEN_PUNCTUATION|IMG_LINE)\b/);
  });
});
