// A throwaway lesson source for the guide tests' seeded arms: a temporary tree
// laid out like the repository (docs/guide/content and apps/web/public), so a
// capture path written the way a real lesson writes it resolves the same way.
// Every name in it is invented.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { loadGuide, type Guide } from "../../../../docs/guide/build/guide-model.mjs";

export type GuideFixture = {
  root: string;
  contentDir: string;
  publicDir: string;
  load: () => Guide;
  cleanup: () => void;
};

/** A guide file: front matter from `front`, one "key: value" per entry, then `body`. */
export function guideFile(front: Record<string, string>, body: string): string {
  const lines = Object.entries(front).map(([key, value]) => `${key}: ${value}`);
  return ["---", ...lines, "---", body, ""].join("\n");
}

/** A section file for folder 01-inicio, open to every profile. */
export const INICIO_SECTION = guideFile(
  {
    id: "inicio",
    title: "Início",
    goal: "Orientar-se no primeiro dia.",
    roles: "rececao, terapeuta, proprietario",
    order: "rececao 1, terapeuta 1, proprietario 1",
  },
  "## Início\n\nA primeira página depois de entrar.",
);

/** A lesson file for 01-inicio/01-exemplo.md; `front` overrides or adds keys, `body` follows the title line. */
export function exampleLesson(front: Record<string, string> = {}, body = "Clique em **Guardar**."): string {
  const merged: Record<string, string> = {
    id: "inicio.exemplo",
    title: "Uma lição de exemplo",
    goal: "Provar o leitor das lições.",
    roles: "rececao, terapeuta, proprietario",
    order: "rececao 1, terapeuta 1, proprietario 1",
    ...front,
  };
  const title = merged.title;
  return guideFile(merged, `## ${title}\n\n${body}`);
}

/**
 * Writes `files` (paths relative to docs/guide/content) and `pngs` (paths
 * relative to apps/web/public; each gets a few placeholder bytes) into a
 * fresh temporary tree.
 */
export function guideFixture(files: Record<string, string>, pngs: string[] = []): GuideFixture {
  const root = mkdtempSync(join(tmpdir(), "guide-fixture-"));
  const contentDir = join(root, "docs", "guide", "content");
  const publicDir = join(root, "apps", "web", "public");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    const file = join(contentDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  for (const rel of pngs) {
    const file = join(publicDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "placeholder");
  }
  return {
    root,
    contentDir,
    publicDir,
    load: () => loadGuide({ contentDir, publicDir, outlineFile: null }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Loads a fixture and removes it, returning the guide it read. */
export function loadFixture(files: Record<string, string>, pngs: string[] = []): Guide {
  const fixture = guideFixture(files, pngs);
  try {
    return fixture.load();
  } finally {
    fixture.cleanup();
  }
}
