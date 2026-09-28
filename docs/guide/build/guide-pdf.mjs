// The committed guide PDFs and the manifest that binds them to the lesson
// source. One module for the two sides: build-guide.mjs, which prints the PDFs
// and writes the manifest, and apps/web/lib/guide/guide-pdf.test.ts, which
// checks them in the unit test job. They agree here on the file names, the
// manifest, the document title and what "the PDFs and the source diverged"
// means.
//
//   docs/guide/pdf/guia-plataforma-osteojp.pdf    the full guide
//   docs/guide/pdf/guia-rececao.pdf               one per profile (admin is not one)
//   docs/guide/pdf/guia-terapeuta.pdf
//   docs/guide/pdf/guia-proprietario.pdf
//   docs/guide/pdf/guide-pdf.manifest.json        the source hash, and per PDF its
//                                                 file name, pages and sha256
//
// THE BINDING. The source hash is guideSourceHash (guide-model.mjs): the
// published lessons, FAQ entries and sections, and every capture they show.
// The builder writes it into the manifest and its first 16 hex into each PDF's
// document title ("Guia da plataforma OsteoJP: Receção (fonte 1a2b3c4d5e6f7a8b)"),
// which Chromium writes to the PDF's Info /Title. checkGuidePdfs below then
// fails when:
//
//   source   the lesson source's hash is not the manifest's (a lesson changed
//            and the PDFs were not rebuilt);
//   sha256   a PDF is not the file the builder wrote (replaced by hand);
//   title    a PDF's Info /Title does not carry the manifest's source prefix;
//   files    the folder holds a file the manifest does not name, or lacks one
//            it names;
//   manifest the manifest itself is malformed or names other PDFs than the four.
//
// Node built-ins only, and no Chromium: reading a title is a byte scan of the
// PDF's Info dictionary, so the check runs where the unit tests run.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './guide-model.mjs';

/** Where the committed PDFs live. docs/guide/build/*.pdf is gitignored; this folder is not. */
export const PDF_DIR = path.join(REPO_ROOT, 'docs', 'guide', 'pdf');
/** The manifest's file name, inside the PDF folder. */
export const MANIFEST_NAME = 'guide-pdf.manifest.json';
export const MANIFEST_FILE = path.join(PDF_DIR, MANIFEST_NAME);

export const GUIDE_TITLE = 'Guia da plataforma OsteoJP';

/** The four PDFs, in build order: the full guide, then one per guide profile. */
export const PDF_JOBS = Object.freeze([
  Object.freeze({ profile: null, label: null, file: 'guia-plataforma-osteojp.pdf' }),
  Object.freeze({ profile: 'rececao', label: 'Receção', file: 'guia-rececao.pdf' }),
  Object.freeze({ profile: 'terapeuta', label: 'Terapeuta', file: 'guia-terapeuta.pdf' }),
  Object.freeze({ profile: 'proprietario', label: 'Proprietário', file: 'guia-proprietario.pdf' }),
]);

/** How many hex digits of the source hash a PDF's title carries. */
export const TITLE_PREFIX_LENGTH = 16;

/** Files a folder may hold that no one commits (the root .gitignore ignores them). */
const IGNORED_NAMES = new Set(['.DS_Store']);

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The part of the source hash a title carries. */
export function sourcePrefix(sourceHash) {
  return String(sourceHash).slice(0, TITLE_PREFIX_LENGTH);
}

/** The words a title ends with, which bind it to its source. */
export function titleMark(sourceHash) {
  return `(fonte ${sourcePrefix(sourceHash)})`;
}

/** A PDF's document title: "Guia da plataforma OsteoJP: Receção (fonte 1a2b3c4d5e6f7a8b)". */
export function pdfTitle(label, sourceHash) {
  return `${label ? `${GUIDE_TITLE}: ${label}` : GUIDE_TITLE} ${titleMark(sourceHash)}`;
}

/** The number of pages of a PDF Chromium printed (its /Type /Page objects). */
export function countPdfPages(pdf) {
  const matches = Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

// ------------------------------------------------------------ the /Title

/** Reads one PDF string object at `at` (a "(" literal or a "<" hex string); returns its bytes, or null. */
function readPdfString(text, at) {
  let i = at;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] === '<' && text[i + 1] !== '<') {
    const end = text.indexOf('>', i);
    if (end === -1) return null;
    const hex = text.slice(i + 1, end).replace(/\s+/g, '');
    if (!/^[0-9A-Fa-f]*$/.test(hex)) return null;
    return Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex');
  }
  if (text[i] !== '(') return null;
  const bytes = [];
  let depth = 0;
  const ESCAPES = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
  for (i += 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next in ESCAPES) {
        bytes.push(ESCAPES[next]);
        i += 1;
      } else if (/[0-7]/.test(next)) {
        const octal = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4))[0];
        bytes.push(Number.parseInt(octal, 8) & 0xff);
        i += octal.length;
      } else if (next === '\r' || next === '\n') {
        i += next === '\r' && text[i + 2] === '\n' ? 2 : 1; // a line continuation
      } else {
        i += 1; // an unknown escape: the backslash is dropped
        if (next !== undefined) bytes.push(next.charCodeAt(0));
      }
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      if (depth === 0) return Buffer.from(bytes);
      depth -= 1;
    }
    bytes.push(ch.charCodeAt(0) & 0xff);
  }
  return null;
}

/** A PDF text string's bytes as text: UTF-16BE or UTF-8 by their byte order mark, else PDFDocEncoding (read as Latin-1). */
function decodePdfText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1];
      swapped[i - 1] = bytes[i];
    }
    return swapped.toString('utf16le');
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString('utf8');
  return bytes.toString('latin1');
}

/**
 * The document title in a PDF's Info dictionary, or null when it cannot be read.
 * It follows the LAST "/Info n g R" (the trailer, or the cross-reference stream's
 * dictionary, both plain text), finds that object, and reads its /Title. An
 * outline item's /Title is never read: only the Info object's. An Info object
 * packed inside a compressed object stream reads as null, and the check fails
 * rather than guesses.
 */
export function readPdfTitle(pdf) {
  const text = Buffer.from(pdf).toString('latin1');
  const refs = [...text.matchAll(/\/Info\s+(\d+)\s+(\d+)\s+R/g)];
  if (refs.length === 0) return null;
  const [, num, gen] = refs[refs.length - 1];
  const heads = [...text.matchAll(new RegExp(`(?:^|[^0-9])${num}\\s+${gen}\\s+obj\\b`, 'g'))];
  if (heads.length === 0) return null;
  const start = heads[heads.length - 1].index;
  const end = text.indexOf('endobj', start);
  if (end === -1) return null;
  const body = text.slice(start, end);
  const title = /\/Title(?![A-Za-z])/.exec(body);
  if (!title) return null;
  const bytes = readPdfString(body, title.index + title[0].length);
  return bytes ? decodePdfText(bytes) : null;
}

// ------------------------------------------------------------ the check

/** Reads and parses a manifest file. */
export function readManifest(file = MANIFEST_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Checks a PDF folder against a manifest and the lesson source's hash.
 * Returns the problems by kind; every list is empty when the PDFs are the ones
 * the builder made from this source.
 *
 *   pdfDir      the folder holding the PDFs and the manifest
 *   manifest    the parsed manifest
 *   sourceHash  guideSourceHash(loadGuide()), the source as it is now
 */
export function checkGuidePdfs({ pdfDir = PDF_DIR, manifest, sourceHash }) {
  const problems = { manifest: [], source: [], files: [], sha256: [], title: [] };
  const rebuild = 'rebuild them with: node docs/guide/build/build-guide.mjs';

  const recorded = manifest && manifest.source ? manifest.source.sha256 : undefined;
  if (!HEX64.test(String(recorded))) problems.manifest.push(`the manifest has no source sha256 (found ${JSON.stringify(recorded)})`);
  else if (recorded !== sourceHash) {
    problems.source.push(
      `the lesson source changed after the PDFs were built: the manifest was built from ${recorded}, the source is now ${sourceHash}; ${rebuild}`,
    );
  }

  const entries = manifest && Array.isArray(manifest.pdfs) ? manifest.pdfs : [];
  const names = entries.map((entry) => entry && entry.file);
  const wanted = PDF_JOBS.map((job) => job.file);
  if (JSON.stringify(names) !== JSON.stringify(wanted)) {
    problems.manifest.push(`the manifest names ${JSON.stringify(names)}, not the four PDFs ${JSON.stringify(wanted)}`);
  }

  const present = existsSync(pdfDir) ? readdirSync(pdfDir) : [];
  for (const name of present.sort()) {
    if (name === MANIFEST_NAME || IGNORED_NAMES.has(name) || names.includes(name)) continue;
    problems.files.push(`${name} is in the PDF folder, and the manifest does not name it`);
  }

  const mark = HEX64.test(String(recorded)) ? titleMark(recorded) : null;
  for (const entry of entries) {
    if (!entry || typeof entry.file !== 'string' || entry.file.includes('/') || entry.file.includes('\\')) {
      problems.manifest.push(`a manifest entry has no plain file name: ${JSON.stringify(entry)}`);
      continue;
    }
    const file = path.join(pdfDir, entry.file);
    if (!existsSync(file) || !statSync(file).isFile()) {
      problems.files.push(`${entry.file} is named by the manifest, and the PDF folder does not hold it; ${rebuild}`);
      continue;
    }
    const pdf = readFileSync(file);
    const actual = sha256Hex(pdf);
    if (!HEX64.test(String(entry.sha256))) problems.manifest.push(`${entry.file} has no sha256 in the manifest`);
    else if (actual !== entry.sha256) {
      problems.sha256.push(`${entry.file} is not the PDF the builder wrote: its sha256 is ${actual}, the manifest's ${entry.sha256}; ${rebuild}`);
    }
    if (entry.pages !== countPdfPages(pdf)) {
      problems.manifest.push(`${entry.file} has ${countPdfPages(pdf)} pages, the manifest says ${entry.pages}`);
    }
    if (mark) {
      const title = readPdfTitle(pdf);
      if (title === null) problems.title.push(`${entry.file}: its document title (Info /Title) cannot be read`);
      else if (!title.endsWith(mark)) {
        problems.title.push(`${entry.file}: its title ${JSON.stringify(title)} does not end with ${JSON.stringify(mark)}, the manifest's source`);
      }
    }
  }
  return problems;
}
