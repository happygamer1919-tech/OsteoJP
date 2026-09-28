// G1-4, THE PDF HALF: ONE CONTENT SOURCE FEEDS THE PDF AS WELL AS /ajuda.
//
// The four guide PDFs in docs/guide/pdf are printed by
// docs/guide/build/build-guide.mjs from the lesson source that /ajuda reads
// (docs/guide/content/NN-<section>/ and 00-perguntas/), and committed with
// docs/guide/pdf/guide-pdf.manifest.json: the SOURCE hash they were built
// from (guideSourceHash in guide-model.mjs: the published lessons, FAQ entries
// and sections, and every capture they show) and each PDF's sha256. Each PDF's
// document title (its Info /Title) ends with "(fonte <the first 16 hex>)".
//
// This check fails, in the required "Lint + typecheck + test" job, when:
//   * the source hash of the lessons as they are now is not the manifest's: a
//     lesson, an FAQ answer or a capture changed and the PDFs were not rebuilt
//     in the same PR (run node docs/guide/build/build-guide.mjs);
//   * a committed PDF's sha256 is not the manifest's: a PDF replaced by hand;
//   * a PDF's title does not carry the manifest's source prefix;
//   * docs/guide/pdf holds a file the manifest does not name, or lacks one.
//
// It needs no Chromium and no network: it hashes files and reads a title out
// of each PDF's Info dictionary (guide-pdf.mjs, shared with the builder).
//
// The seeded arms prove each failure both ways on copies in a temporary
// folder: a one byte change to a copied lesson or capture moves the hash, a
// change to the held lesson does not, a tampered copy of a PDF fails its
// sha256, a copy whose title lost the prefix fails the title, an extra or a
// missing file fails the folder, and an untouched copy passes everything.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONTENT_DIR, PUBLIC_DIR, guideSourceHash, loadGuide } from "../../../../docs/guide/build/guide-model.mjs";
import {
  MANIFEST_NAME,
  PDF_DIR,
  PDF_JOBS,
  checkGuidePdfs,
  countPdfPages,
  pdfTitle,
  readManifest,
  readPdfTitle,
  sha256Hex,
  sourcePrefix,
  type PdfManifest,
  type PdfProblems,
} from "../../../../docs/guide/build/guide-pdf.mjs";

const REBUILD = "node docs/guide/build/build-guide.mjs";

/** Text as UTF-16BE, in hex: how Chromium writes a title with an accent. */
function utf16Hex(text: string): string {
  const le = Buffer.from(text, "utf16le");
  const be = Buffer.alloc(le.length);
  for (let i = 0; i + 1 < le.length; i += 2) {
    be[i] = le[i + 1];
    be[i + 1] = le[i];
  }
  return be.toString("hex").toUpperCase();
}

/** The kinds of problem a check reported, so an arm can say "this kind and no other". */
function kinds(problems: PdfProblems): string[] {
  return (Object.keys(problems) as (keyof PdfProblems)[]).filter((kind) => problems[kind].length > 0);
}

const manifest: PdfManifest = readManifest();
let sourceHash = "";
let live: PdfProblems;

beforeAll(() => {
  sourceHash = guideSourceHash(loadGuide());
  live = checkGuidePdfs({ manifest, sourceHash });
});

describe("the committed guide PDFs are the lesson source, printed (G1-4, the PDF half)", () => {
  it("the manifest was built from the lesson source as it is now: its source hash is guideSourceHash of docs/guide/content", () => {
    expect(live.source, `the PDFs are stale; rebuild them in this PR with: ${REBUILD}`).toEqual([]);
    expect(manifest.source.sha256).toBe(sourceHash);
  });

  it("each committed PDF is byte for byte the file the builder wrote: its sha256 is the manifest's", () => {
    expect(live.sha256, `a PDF was changed by hand; rebuild with: ${REBUILD}`).toEqual([]);
  });

  it("each PDF's document title carries the manifest's source hash prefix", () => {
    expect(live.title).toEqual([]);
    for (const job of PDF_JOBS) {
      const title = readPdfTitle(readFileSync(join(PDF_DIR, job.file)));
      expect(title).toBe(pdfTitle(job.label, manifest.source.sha256));
    }
  });

  it("docs/guide/pdf holds the four PDFs and the manifest, and nothing else", () => {
    expect(live.files).toEqual([]);
    const names = readdirSync(PDF_DIR).filter((name) => name !== ".DS_Store").sort();
    expect(names).toEqual([...PDF_JOBS.map((job) => job.file), MANIFEST_NAME].sort());
  });

  it("the manifest names the four PDFs (full, Receção, Terapeuta, Proprietário) with their page counts, and admin is not a profile", () => {
    expect(live.manifest).toEqual([]);
    expect(manifest.pdfs.map((entry) => entry.profile)).toEqual([null, "rececao", "terapeuta", "proprietario"]);
    for (const entry of manifest.pdfs) expect(entry.pages).toBeGreaterThan(2);
    // The published source: 57 lessons (one of 58 held) and seven FAQ entries.
    expect(manifest.source).toMatchObject({ sections: 9, lessons: 57, faq: 7 });
  });
});

describe("seeded: the source hash moves with what the PDFs print, and only with that", () => {
  let root = "";
  let contentDir = "";
  let publicDir = "";
  const hashOfCopy = () => guideSourceHash(loadGuide({ contentDir, publicDir }));

  beforeAll(() => {
    // Laid out like the repository, so a lesson's capture path
    // (../../../../apps/web/public/ajuda/...) resolves inside the copy. The
    // captures of one section are copied, so a byte of one can change; the
    // others are links to the real folders.
    root = mkdtempSync(join(tmpdir(), "guide-pdf-source-"));
    contentDir = join(root, "docs", "guide", "content");
    publicDir = join(root, "apps", "web", "public");
    cpSync(CONTENT_DIR, contentDir, { recursive: true });
    mkdirSync(join(publicDir, "ajuda"), { recursive: true });
    for (const section of readdirSync(join(PUBLIC_DIR, "ajuda"))) {
      const from = join(PUBLIC_DIR, "ajuda", section);
      if (section === "inicio") cpSync(from, join(publicDir, "ajuda", section), { recursive: true });
      else symlinkSync(from, join(publicDir, "ajuda", section), "dir");
    }
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  /** Changes one file of the copy by the same number of bytes; returns the undo. */
  const edit = (file: string, change: (bytes: Buffer) => Buffer) => {
    const before = readFileSync(file);
    const after = change(Buffer.from(before));
    expect(after.length).toBe(before.length);
    expect(after.equals(before)).toBe(false);
    writeFileSync(file, after);
    return () => writeFileSync(file, before);
  };
  const replaceText = (from: string, to: string) => (bytes: Buffer) => {
    const text = bytes.toString("utf8");
    expect(text).toContain(from);
    return Buffer.from(text.replace(from, to), "utf8");
  };

  it("null arm: the untouched copy hashes to the source hash of the repository", () => {
    expect(hashOfCopy()).toBe(sourceHash);
  });

  it("one byte of a copied lesson changed: the hash differs, and the check fails on the source and nothing else", () => {
    const undo = edit(join(contentDir, "02-agenda", "02-marcar-consulta.md"), replaceText("Clique em **Nova", "Clique em **nova"));
    try {
      const changed = hashOfCopy();
      expect(changed).not.toBe(sourceHash);
      // Against the manifest's own hash the check raises no source problem; the
      // byte is the whole difference, whatever state the PDF folder is in.
      const baseline = checkGuidePdfs({ manifest, sourceHash: manifest.source.sha256 });
      const problems = checkGuidePdfs({ manifest, sourceHash: changed });
      expect(baseline.source).toEqual([]);
      expect(problems.source).toHaveLength(1);
      expect(problems.source[0]).toContain(REBUILD);
      expect({ ...problems, source: [] }).toEqual(baseline);
    } finally {
      undo();
    }
    expect(hashOfCopy()).toBe(sourceHash);
  });

  it("one byte of an FAQ answer changed: the hash differs", () => {
    const undo = edit(join(contentDir, "00-perguntas", "01-marcar-consulta.md"), replaceText("Na **Agenda**", "na **Agenda**"));
    try {
      expect(hashOfCopy()).not.toBe(sourceHash);
    } finally {
      undo();
    }
  });

  it("one byte of a copied capture changed: the hash differs", () => {
    const undo = edit(join(publicDir, "ajuda", "inicio", "resumo-do-dia-390.png"), (bytes) => {
      bytes[bytes.length - 1] ^= 0xff;
      return bytes;
    });
    try {
      expect(hashOfCopy()).not.toBe(sourceHash);
    } finally {
      undo();
    }
    expect(hashOfCopy()).toBe(sourceHash);
  });

  it("null arm: a byte of the held lesson (GUEST-05) changed, and the hash does not move, since no PDF prints it", () => {
    const undo = edit(
      join(contentDir, "09-marcacao-online", "01-pedido-de-cliente-novo.md"),
      replaceText("1. Clínica: escolhe", "1. Clínica: Escolhe"),
    );
    try {
      expect(hashOfCopy()).toBe(sourceHash);
    } finally {
      undo();
    }
  });
});

describe("seeded: a copy of docs/guide/pdf fails each check it should, and passes untouched", () => {
  let dir = "";
  const target = PDF_JOBS[1].file;
  // The committed manifest, with each PDF's sha256 and pages taken from the
  // copy itself, so these arms prove the checks whatever state the live
  // folder is in (the tests above hold the live folder).
  let copyManifest: PdfManifest = manifest;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "guide-pdf-folder-"));
    cpSync(PDF_DIR, dir, { recursive: true });
    copyManifest = {
      ...manifest,
      pdfs: manifest.pdfs.map((entry) => {
        const pdf = readFileSync(join(dir, entry.file));
        return { ...entry, sha256: sha256Hex(pdf), pages: countPdfPages(pdf) };
      }),
    };
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const check = (m: unknown = copyManifest) => checkGuidePdfs({ pdfDir: dir, manifest: m, sourceHash: manifest.source.sha256 });

  it("null arm: the untouched copy passes every check", () => {
    const problems = check();
    expect(kinds(problems)).toEqual([]);
  });

  it("one byte of a copied PDF changed: its sha256 check fails, naming that PDF, and nothing else", () => {
    const file = join(dir, target);
    const before = readFileSync(file);
    const after = Buffer.from(before);
    after[Math.floor(after.length / 2)] ^= 0x01;
    writeFileSync(file, after);
    try {
      const problems = check();
      expect(kinds(problems)).toEqual(["sha256"]);
      expect(problems.sha256).toHaveLength(1);
      expect(problems.sha256[0]).toContain(target);
    } finally {
      writeFileSync(file, before);
    }
    expect(kinds(check())).toEqual([]);
  });

  // Chromium writes an ASCII title as a literal string (its parentheses
  // escaped) and a title with an accent as UTF-16 in a hex string: the full
  // guide's title is the first kind, Receção's the second. Each is forged in
  // place, to the same length, and its sha256 re-recorded, so the title is the
  // only thing wrong with it.
  for (const [job, form] of [
    [PDF_JOBS[0], "a literal string"],
    [PDF_JOBS[1], "UTF-16 in a hex string"],
  ] as const) {
    it(`a PDF whose title lost the source prefix fails the title check (${job.file}, ${form})`, () => {
      const file = join(dir, job.file);
      const before = readFileSync(file);
      const words = `fonte ${sourcePrefix(manifest.source.sha256)}`;
      const forgedWords = `fonte ${"0".repeat(16)}`;
      const [from, to] = job.label === null ? [words, forgedWords] : [utf16Hex(words), utf16Hex(forgedWords)];
      const text = before.toString("latin1");
      expect(text.split(from)).toHaveLength(2); // the title, once, in plain text
      const forged = Buffer.from(text.replace(from, to), "latin1");
      expect(forged.length).toBe(before.length);
      writeFileSync(file, forged);
      const reRecorded = {
        ...copyManifest,
        pdfs: copyManifest.pdfs.map((entry) => (entry.file === job.file ? { ...entry, sha256: sha256Hex(forged) } : entry)),
      };
      try {
        expect(readPdfTitle(forged)).toBe(pdfTitle(job.label, "0".repeat(64)));
        const problems = check(reRecorded);
        expect(kinds(problems)).toEqual(["title"]);
        expect(problems.title).toHaveLength(1);
        expect(problems.title[0]).toContain(job.file);
      } finally {
        writeFileSync(file, before);
      }
      expect(kinds(check())).toEqual([]);
    });
  }

  it("a file the manifest does not name fails the folder check", () => {
    const stray = join(dir, "guia-antigo.pdf");
    writeFileSync(stray, "%PDF-1.4\n");
    try {
      const problems = check();
      expect(kinds(problems)).toEqual(["files"]);
      expect(problems.files).toEqual(["guia-antigo.pdf is in the PDF folder, and the manifest does not name it"]);
    } finally {
      rmSync(stray);
    }
    expect(kinds(check())).toEqual([]);
  });

  it("a PDF the manifest names and the folder lacks fails the folder check", () => {
    const file = join(dir, target);
    const moved = join(dir, "..", `${target}.away-${process.pid}`);
    renameSync(file, moved);
    try {
      const problems = check();
      expect(kinds(problems)).toEqual(["files"]);
      expect(problems.files[0]).toContain(target);
    } finally {
      renameSync(moved, file);
    }
  });

  it("a manifest that drops a PDF, or loses its source hash, fails the manifest check", () => {
    const dropped = { ...copyManifest, pdfs: copyManifest.pdfs.slice(0, 3) };
    const problems = check(dropped);
    expect(problems.manifest.length).toBeGreaterThan(0);
    expect(problems.files).toEqual([`${PDF_JOBS[3].file} is in the PDF folder, and the manifest does not name it`]);
    expect(check({ ...copyManifest, source: {} }).manifest[0]).toContain("no source sha256");
  });
});

describe("seeded: the title reader reads the Info dictionary and nothing else", () => {
  const pdf = (body: string) => Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`, "latin1");
  const utf16 = (text: string) => `<FEFF${utf16Hex(text)}>`;

  it("a literal title with octal and parenthesis escapes, next to an outline item that also has a /Title", () => {
    const file = pdf(
      [
        "1 0 obj\n<</Creator (Chromium) /Title (Guia da plataforma OsteoJP: Rece\\347\\343o \\(fonte 0123456789abcdef\\))>>\nendobj",
        "7 0 obj\n<</Title (Um cap\\355tulo) /Parent 6 0 R>>\nendobj",
        "trailer\n<</Size 8 /Root 5 0 R /Info 1 0 R>>",
      ].join("\n"),
    );
    expect(readPdfTitle(file)).toBe("Guia da plataforma OsteoJP: Receção (fonte 0123456789abcdef)");
  });

  it("a UTF-16 title in a hex string, and the last trailer's /Info wins over an earlier one", () => {
    const file = pdf(
      [
        "1 0 obj\n<</Title (Antigo)>>\nendobj",
        "trailer\n<</Info 1 0 R>>",
        `2 0 obj\n<</Title ${utf16("Guia: Proprietário (fonte fedcba9876543210)")}>>\nendobj`,
        "trailer\n<</Info 2 0 R /Prev 9>>",
      ].join("\n"),
    );
    expect(readPdfTitle(file)).toBe("Guia: Proprietário (fonte fedcba9876543210)");
  });

  it("null arms: no Info dictionary, or an Info object with no /Title, reads as null and never as an outline title", () => {
    expect(readPdfTitle(pdf("7 0 obj\n<</Title (Um capítulo)>>\nendobj\ntrailer\n<</Root 5 0 R>>"))).toBeNull();
    expect(readPdfTitle(pdf("1 0 obj\n<</Creator (Chromium)>>\nendobj\n7 0 obj\n<</Title (X)>>\nendobj\ntrailer\n<</Info 1 0 R>>"))).toBeNull();
  });

  it("the page count reads every /Type /Page and no /Pages node", () => {
    expect(countPdfPages(pdf("1 0 obj\n<</Type /Pages /Count 2>>\nendobj\n2 0 obj\n<</Type /Page>>\nendobj\n3 0 obj\n<</Type/Page>>\nendobj"))).toBe(2);
  });
});
