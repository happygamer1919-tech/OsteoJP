/**
 * G1: the chrome copy of Suporte e Guia, and the code behind it, carry no dash.
 *
 * The guide's rule (docs/guide/build/README.md) is no dash character anywhere,
 * and a hyphen only inside a word (palavra-passe, e-mail). The lessons are held
 * to it by lib/guide/guide-lessons.test.ts; this holds the page's own strings
 * (the guide.* keys, in pt and in en) and the source files of /ajuda to it.
 *
 * In source files only the dash CHARACTERS are refused: a hyphen there is code
 * (a class name, a minus sign), not punctuation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { getStrings } from "@osteojp/i18n";
import { describe, expect, it } from "vitest";

// Every dash look-alike by code point: U+2010 to U+2015, the minus sign, and
// the small and full width hyphen minus.
const DASH = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/u;
// A hyphen that is not between two letters or digits.
const LOOSE_HYPHEN = /(?<![\p{L}\p{N}])-|-(?![\p{L}\p{N}])/u;

const pt = getStrings("pt") as Record<string, string>;
const en = getStrings("en") as Record<string, string>;
const guideKeys = (dict: Record<string, string>) => Object.keys(dict).filter((key) => key.startsWith("guide."));

function copyProblems(text: string): string[] {
  const out: string[] = [];
  if (DASH.test(text)) out.push("a dash character");
  if (LOOSE_HYPHEN.test(text)) out.push("a hyphen used as punctuation");
  return out;
}

const WEB = join(__dirname, "..", "..");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
const SOURCES = [
  ...files(join(WEB, "app", "ajuda")),
  join(WEB, "lib", "guide", "guide-routes.ts"),
  join(WEB, "lib", "guide", "ajuda-tab.ts"),
];

describe("the guide.* strings", () => {
  it("exist in pt and en alike", () => {
    expect(guideKeys(pt).length).toBeGreaterThanOrEqual(15);
    expect(guideKeys(en).sort()).toEqual(guideKeys(pt).sort());
  });

  it("carry no dash and no loose hyphen, in either language", () => {
    const offences = [...guideKeys(pt).map((k) => ["pt", k, pt[k]!]), ...guideKeys(en).map((k) => ["en", k, en[k]!])].flatMap(
      ([lang, key, value]) => copyProblems(value!).map((problem) => `${lang} ${key}: ${problem}`),
    );
    expect(offences).toEqual([]);
  });

  it("the page title is the owner's: Suporte e Guia", () => {
    expect(pt["guide.title"]).toBe("Suporte e Guia");
    expect(pt["guide.tabGuide"]).toBe("Guia da plataforma");
    expect(pt["guide.tabFaq"]).toBe("Perguntas frequentes");
    expect(pt["guide.noImage"]!.toLowerCase()).toBe("sem imagem");
  });

  it("the Sem imagem hint names neither a lesson nor a question: the card shows under both", () => {
    expect(pt["guide.noImageHint"]).not.toMatch(/lição|pergunta/iu);
    expect(en["guide.noImageHint"]).not.toMatch(/lesson|question/iu);
  });
});

describe("the /ajuda source files", () => {
  it("are found", () => {
    expect(SOURCES.map((path) => relative(WEB, path))).toEqual(
      expect.arrayContaining(["app/ajuda/page.tsx", "app/ajuda/guide-blocks.tsx", "lib/guide/guide-routes.ts"]),
    );
  });

  it("carry no dash character", () => {
    const offences = SOURCES.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, i) => (DASH.test(line) ? [`${relative(WEB, path)}:${i + 1}`] : [])),
    );
    expect(offences).toEqual([]);
  });
});

describe("the checks themselves, on seeded text", () => {
  it("refuse an em dash, an en dash, a minus sign and a loose hyphen, and pass palavra-passe and e-mail", () => {
    expect(copyProblems("Suporte \u2014 Guia")).toEqual(["a dash character"]);
    expect(copyProblems("Suporte \u2013 Guia")).toEqual(["a dash character"]);
    expect(copyProblems("Suporte \u2212 Guia")).toEqual(["a dash character"]);
    expect(copyProblems("Suporte - Guia")).toEqual(["a hyphen used as punctuation"]);
    expect(copyProblems("Guia -")).toEqual(["a hyphen used as punctuation"]);
    expect(copyProblems("A palavra-passe e o e-mail.")).toEqual([]);
  });
});
