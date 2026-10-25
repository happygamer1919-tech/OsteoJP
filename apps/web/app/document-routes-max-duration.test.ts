/**
 * The time limit of the pages whose server actions build PDFs.
 *
 * A server action runs inside the request of the page that calls it, so the
 * limit that bounds "Exportar ficha" is the limit of /patients/[id], not of the
 * action's file. Each of these pages writes it down as `maxDuration`; without
 * it the limit is whatever the hosting dashboard holds, which nothing in the
 * repository can read. This file pins three things:
 *   1. every page below exports `maxDuration = 300` as a plain literal (Next.js
 *      reads the segment config statically, so a computed value is ignored);
 *   2. every file that calls a PDF action is a known caller, rendered by one of
 *      those pages. A new caller fails here, naming itself, until its page has
 *      a limit and is listed;
 *   3. the export time suite's ceiling stays inside the limit.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP = __dirname;
const LIMIT_S = 300;

/** The pages, by route, with a limit of their own. */
const PAGES = ["patients/[id]/page.tsx", "clinical/[id]/page.tsx", "clinical/review/[recordId]/page.tsx"];

/** The server actions that render a PDF and hand back its signed URL. */
const PDF_ACTIONS = [
  "downloadPatientFichaUrlAction",
  "downloadEpisodeReportUrlAction",
  "downloadImportedGroupReportUrlAction",
  "generateDeclaracaoUrlAction",
  "downloadReportUrlAction",
  "generateRgpdFormUrlAction",
];

/** Every file that calls one of them, and the page whose request it runs in. */
const CALLERS: Record<string, string> = {
  "patients/[id]/ficha-export-button.tsx": "patients/[id]/page.tsx",
  "patients/[id]/episode-pdf-button.tsx": "patients/[id]/page.tsx",
  "patients/[id]/imported-group-pdf-button.tsx": "patients/[id]/page.tsx",
  "patients/[id]/DeclaracaoDialog.tsx": "patients/[id]/page.tsx",
  "clinical/[id]/DownloadReportButton.tsx": "clinical/[id]/page.tsx",
  "clinical/[id]/page.tsx": "clinical/[id]/page.tsx",
  // The record form, and so the RGPD form, is drawn on both clinical pages.
  "clinical/[id]/SignatureConsent.tsx": "clinical/[id]/page.tsx",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("pages whose server actions build PDFs carry their own time limit", () => {
  it.each(PAGES)("%s exports maxDuration = 300 as a literal, once", (page) => {
    const found = read(page).match(/^export const maxDuration = (.+);$/gm) ?? [];
    expect(found).toEqual([`export const maxDuration = ${LIMIT_S};`]);
  });

  it("every caller of a PDF action is known, and its page is one of those pages", () => {
    const callers = sourceFiles(APP)
      .map((path) => relative(APP, path))
      .filter((rel) => !/actions\.ts$/.test(rel))
      .filter((rel) => {
        const text = read(rel);
        return PDF_ACTIONS.some((name) => new RegExp(`\\b${name}\\b`).test(text));
      })
      .sort();
    expect(callers).toEqual(Object.keys(CALLERS).sort());
    for (const page of Object.values(CALLERS)) expect(PAGES).toContain(page);
  });

  it("the export time suite's ceiling is inside the limit", () => {
    const suite = readFileSync(join(APP, "../lib/clinical/report/ficha-export-time.db.test.ts"), "utf8");
    const m = suite.match(/^const CEILING_MS = ([\d_]+);$/m);
    expect(m).not.toBeNull();
    const ceiling = Number(m![1]!.replace(/_/g, ""));
    expect(ceiling).toBeGreaterThan(0);
    expect(ceiling).toBeLessThan(LIMIT_S * 1000);
  });
});
