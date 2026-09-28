#!/usr/bin/env node
// Builds the platform guide PDFs.
//
//   node docs/guide/build/build-guide.mjs [--out <dir>]                   the lesson source (default)
//   node docs/guide/build/build-guide.mjs --content <dir> [--out <dir>]   chapter mode
//
// LESSON MODE, the default. Reads the lesson source that /ajuda reads,
// docs/guide/content/NN-<section>/ and 00-perguntas/, through guide-model.mjs,
// and prints four A4 PDFs into docs/guide/pdf with Playwright's Chromium:
//
//   guia-plataforma-osteojp.pdf   every published lesson and FAQ entry, in the
//                                 Proprietário order, and every role block
//                                 under a small "Só para <Role>" label
//   guia-rececao.pdf              the lessons and FAQ entries of one profile
//   guia-terapeuta.pdf            (lessonsFor, faqFor), in its order, with only
//   guia-proprietario.pdf         the role blocks written for it
//
// Each has a cover, an index, "Perguntas frequentes" first, then the sections.
// Each lesson prints its capture pair side by side (phone and desktop,
// captioned by their alt text) or a small "Sem imagem" note, never a broken
// image. A held lesson (hold: GUEST-05) is never printed, and admin is not a
// PDF profile. The colours are packages/ui/theme.css tokens.
//
// Next to them it writes guide-pdf.manifest.json: the SOURCE hash
// (guideSourceHash in guide-model.mjs: the published lessons, FAQ entries and
// sections, and every capture they show) and, per PDF, its file name, pages,
// size and sha256. Each PDF's document title ends with "(fonte <the first 16
// hex of the source hash>)", which Chromium writes to the PDF's Info /Title, so
// a PDF names the source it was built from. apps/web/lib/guide/guide-pdf.test.ts
// fails when the source, the manifest and the PDFs disagree (guide-pdf.mjs), so
// a PR that changes a lesson must rebuild the PDFs in the same PR.
//
// It refuses, and writes nothing, when the lesson source has a problem (every
// problem listed with its file and line, as gen-guide-data.mjs lists them), or
// when a PDF it printed does not carry its title.
//
// CHAPTER MODE, --content <dir>: the old builder, unchanged. Reads every flat
// chapter file <dir>/*.md in file-name order, converts the small Markdown
// subset below to HTML and prints, into --out (default: this folder, whose
// *.pdf is gitignored):
//
//   guia-plataforma-osteojp.pdf   cover, index, every chapter
//   guia-rececao.pdf              cover, the Receção chapter
//   guia-terapeuta.pdf            cover, the Terapeuta chapter
//   guia-proprietario.pdf         cover, the Proprietário chapter
//
// The Markdown subset: "# ", "## ", "### " headings, paragraphs, "* " and
// "1. " lists, **bold**, and image lines ![alt](path) alone on their line.
// Two image lines in a row (blank lines between them are fine), one phone
// capture (-390) and one desktop capture (-desktop), print side by side.
// Image paths are relative to the content directory.
//
// It refuses to print, and exits 1, when there is no chapter file, when a
// chapter uses a dash character or a hyphen as punctuation, when it uses
// Markdown outside the subset, when an image it names does not exist, or when
// one of the three roles has no chapter. scripts/guide-content.test.mjs spawns
// this mode and asserts those messages exactly. Exit 2 is a bad invocation.
//
// No dependency of its own: Playwright is resolved from apps/web, which has
// @playwright/test as a devDependency.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DASH_CHARS,
  REPO_ROOT,
  faqFor,
  guideSourceHash,
  lintLine,
  loadGuide,
  parseBlocks,
  sectionsFor,
  serializeGuideData,
} from './guide-model.mjs';
import {
  GUIDE_TITLE,
  MANIFEST_NAME,
  PDF_DIR,
  PDF_JOBS,
  countPdfPages,
  pdfTitle,
  readPdfTitle,
  sha256Hex,
  sourcePrefix,
  titleMark,
} from './guide-pdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ROLES = PDF_JOBS.filter((job) => job.profile !== null).map((job) => ({ slug: job.profile, label: job.label, file: job.file }));
const FULL_FILE = PDF_JOBS[0].file;
const GUIDE_SUBTITLE = 'Para a equipa da clínica';
const LABEL_OF = Object.fromEntries(ROLES.map((role) => [role.slug, role.label]));

// The dash list (DASH_CHARS), the line lint and the Markdown parser live in
// guide-model.mjs, shared with the lesson source; the messages are unchanged.
// scripts/guide-content.test.mjs keeps its own copy of the dash list, which
// must stay the same as DASH_CHARS there.

class BuildError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------- arguments

const USAGE =
  'Usage: node docs/guide/build/build-guide.mjs [--out <dir>]\n' +
  '       node docs/guide/build/build-guide.mjs --content <chapter dir> [--out <dir>]\n';

function parseArgs(argv) {
  const opts = { content: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg === '--content' || arg === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new BuildError(`${arg} needs a directory`, 2);
      opts[arg.slice(2)] = path.resolve(value);
      i += 1;
      continue;
    }
    throw new BuildError(`Unknown argument: ${arg}`, 2);
  }
  return opts;
}

// ------------------------------------------------------------------ reading

function readChapters(contentDir) {
  if (!existsSync(contentDir) || !statSync(contentDir).isDirectory()) {
    throw new BuildError(`No chapter files: the directory ${contentDir} does not exist.`);
  }
  const names = readdirSync(contentDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  if (names.length === 0) {
    throw new BuildError(`No chapter files: ${contentDir} has no *.md file.`);
  }
  return names.map((name) => {
    const file = path.join(contentDir, name);
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return { name, file, lines: text.split(/\r?\n/) };
  });
}

// ------------------------------------------------------------------- checks

function lintChapter(chapter, contentDir) {
  const errors = [];
  const at = (n, message) => errors.push(`${chapter.name}:${n}: ${message}`);

  chapter.lines.forEach((line, index) => {
    for (const problem of lintLine(line, contentDir)) at(index + 1, problem);
  });

  const first = chapter.lines.find((line) => line.trim() !== '');
  if (!first || !/^#\s+\S/.test(first)) at(1, 'a chapter must start with its "# " title line');
  return errors;
}

// A chapter belongs to a role by its file name, else by its "# " title.
function normalise(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function roleOf(chapter) {
  const byName = ROLES.filter((role) => normalise(chapter.name).includes(role.slug));
  if (byName.length === 1) return byName[0];
  const byTitle = ROLES.filter((role) => normalise(chapter.title).includes(role.slug));
  if (byTitle.length === 1) return byTitle[0];
  return null;
}

// ------------------------------------------------------------ Markdown to HTML

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*(.+?)\*\*/g, (_, bold) => `<strong>${bold}</strong>`);
}

function shotKind(src) {
  if (/-390\.[a-z]+$/i.test(src)) return 'phone';
  if (/-desktop\.[a-z]+$/i.test(src)) return 'desktop';
  return 'other';
}

// Consecutive image blocks become figure rows: a phone capture next to a
// desktop capture shares one row, anything else stands alone.
function groupFigures(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type !== 'image') {
      out.push(block);
      continue;
    }
    const next = blocks[i + 1];
    const kinds = next && next.type === 'image' ? [shotKind(block.src), shotKind(next.src)].sort().join('+') : '';
    if (kinds === 'desktop+phone') {
      const phone = shotKind(block.src) === 'phone' ? block : next;
      const desktop = phone === block ? next : block;
      out.push({ type: 'figure', shots: [phone, desktop] });
      i += 1;
    } else {
      out.push({ type: 'figure', shots: [block] });
    }
  }
  return out;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const dataUriCache = new Map();

function dataUri(file) {
  if (!dataUriCache.has(file)) {
    const mime = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    dataUriCache.set(file, `data:${mime};base64,${readFileSync(file).toString('base64')}`);
  }
  return dataUriCache.get(file);
}

// The caption is the image's alt text ("Agenda no telemóvel"), so a figure
// that the page break has separated from its section heading still says which
// screen it shows. An image with no alt text falls back to the device name.
function renderFigure(figure, contentDir) {
  const shots = figure.shots.map((shot) => {
    const kind = shotKind(shot.src);
    const caption = shot.alt.trim() || (kind === 'phone' ? 'Telemóvel' : kind === 'desktop' ? 'Computador' : '');
    const src = dataUri(path.resolve(contentDir, shot.src));
    return (
      `<figure class="shot ${kind}"><img src="${src}" alt="${escapeHtml(shot.alt)}">` +
      (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
      '</figure>'
    );
  });
  const single = figure.shots.length === 1 ? ' single' : '';
  return `<div class="figrow${single}">${shots.join('')}</div>`;
}

function renderBlock(block, contentDir, ids) {
  switch (block.type) {
    case 'heading': {
      const id = block.level === 1 ? ids.chapter : block.level === 2 ? ids.section() : '';
      return `<h${block.level}${id ? ` id="${id}"` : ''}>${inline(block.text)}</h${block.level}>`;
    }
    case 'para':
      return `<p${block.lead ? ' class="lead"' : ''}>${inline(block.text)}</p>`;
    case 'list': {
      const start = block.kind === 'ol' && block.start !== 1 ? ` start="${block.start}"` : '';
      const items = block.items.map((item) => `<li>${inline(item)}</li>`).join('');
      return `<${block.kind}${start}>${items}</${block.kind}>`;
    }
    case 'figure':
      return renderFigure(block, contentDir);
    default:
      throw new Error(`unknown block ${block.type}`);
  }
}

// A section heading is kept on one page with the screenshots it introduces,
// when at most one block (a short introduction) sits between them. A
// paragraph directly followed by a list ("Contactar um paciente:") introduces
// it, so it never ends a page with its list starting on the next one.
function renderChapter(chapter, contentDir) {
  const blocks = groupFigures(parseBlocks(chapter.lines));
  blocks.forEach((block, i) => {
    if (block.type === 'para' && blocks[i + 1]?.type === 'list') block.lead = true;
  });
  let section = 0;
  let titled = false;
  const ids = {
    get chapter() {
      if (titled) return '';
      titled = true;
      return `c${chapter.index}`;
    },
    section: () => {
      section += 1;
      return `c${chapter.index}-s${section}`;
    },
  };
  const html = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type === 'heading' && block.level > 1) {
      let j = i + 1;
      while (j < blocks.length && j <= i + 2 && blocks[j].type !== 'figure' && blocks[j].type !== 'heading') j += 1;
      if (j <= i + 2 && j < blocks.length && blocks[j].type === 'figure') {
        const kept = blocks.slice(i, j + 1).map((b) => renderBlock(b, contentDir, ids));
        html.push(`<div class="keep">${kept.join('\n')}</div>`);
        i = j;
        continue;
      }
    }
    html.push(renderBlock(block, contentDir, ids));
  }
  return `<section class="chapter">\n${html.join('\n')}\n</section>`;
}

function sectionsOf(chapter) {
  return chapter.lines.map((line) => /^##\s+(.*)$/.exec(line.trim())).filter(Boolean).map((m) => m[1].trim());
}

function renderToc(chapters) {
  const items = chapters.map((chapter) => {
    const sections = sectionsOf(chapter)
      .map((title, i) => `<li><a href="#c${chapter.index}-s${i + 1}">${inline(title)}</a></li>`)
      .join('');
    return (
      `<li><a class="toc-chapter" href="#c${chapter.index}">${inline(chapter.title)}</a>` +
      (sections ? `<ul class="toc-sections">${sections}</ul>` : '') +
      '</li>'
    );
  });
  return `<section class="toc"><h1>Índice</h1><ol class="toc-chapters">${items.join('')}</ol></section>`;
}

// ------------------------------------------------------------------ colours

// The PDF's colours, by token name, from the one file that defines them
// (packages/ui/theme.css), read the way capture-guide.mjs reads the overlay's.
const TOKENS = {
  paper: '--color-surface', // the page
  ink: '--color-text-primary', // body text and bold labels
  muted: '--color-text-secondary', // captions, goals, the footer
  head: '--color-primary-800', // headings
  accent: '--color-accent-2-500', // the cover bar and the title rule: shapes, never text
  accentInk: '--color-accent-2-700', // text in the accent colour: the role and "Só para" labels (AA)
  rule: '--color-border-strong', // image borders and the role block rule
  wash: '--color-surface-muted', // the "Sem imagem" note and inline code
};

function readTokens() {
  const file = path.join(REPO_ROOT, 'packages', 'ui', 'theme.css');
  if (!existsSync(file)) throw new BuildError(`Cannot find ${file}; the PDF colours are its tokens.`);
  const css = readFileSync(file, 'utf8');
  const out = {};
  for (const [key, name] of Object.entries(TOKENS)) {
    const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(css);
    if (!m) throw new BuildError(`packages/ui/theme.css defines no hex for ${name}`);
    out[key] = m[1];
  }
  return out;
}

function css(tokens) {
  return `
@page { size: A4; }
:root {
  --paper: ${tokens.paper};
  --ink: ${tokens.ink};
  --muted: ${tokens.muted};
  --head: ${tokens.head};
  --accent: ${tokens.accent};
  --accent-ink: ${tokens.accentInk};
  --rule: ${tokens.rule};
  --wash: ${tokens.wash};
}
html {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.45;
  color: var(--ink);
  background: var(--paper);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body { margin: 0; }
h1, h2, h3 { color: var(--head); line-height: 1.2; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 24pt; margin: 0 0 7mm; padding-bottom: 3mm; border-bottom: 0.8mm solid var(--accent); }
h2 { font-size: 15pt; margin: 8mm 0 2.5mm; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; }
p { margin: 0 0 3mm; orphans: 3; widows: 3; }
p.lead { break-after: avoid; page-break-after: avoid; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0 0 1.2mm; break-inside: avoid; page-break-inside: avoid; }
strong { font-weight: 650; color: var(--ink); }
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; background: var(--wash); padding: 0 1mm; border-radius: 0.8mm; }
a { color: inherit; text-decoration: none; }

.keep { break-inside: avoid; page-break-inside: avoid; }
.keep > h2:first-child, .keep > h3:first-child { margin-top: 8mm; }
.figrow { display: flex; gap: 6mm; align-items: flex-start; margin: 3mm 0 6mm; break-inside: avoid; page-break-inside: avoid; }
.figrow.single { justify-content: center; }
.shot { margin: 0; }
/* 38mm makes a 390x844 phone capture as tall as a 1440x900 desktop capture
   filling the rest of the 174mm row, once the 6mm gap and each image's 0.3mm
   border (inside its width, box-sizing below) are taken out. */
.shot.phone { flex: 0 0 38mm; }
.shot.desktop, .shot.other { flex: 1 1 auto; min-width: 0; }
.figrow.single .shot.phone { flex-basis: 50mm; }
/* A lesson's pair: each capture's flex-grow is its own width over height
   (set inline), so the two print at one height across the row. */
.figrow.pair .shot { flex-basis: 0; min-width: 0; }
.shot img { display: block; box-sizing: border-box; width: 100%; height: auto; border: 0.3mm solid var(--rule); border-radius: 1mm; }
figcaption { margin-top: 1.5mm; font-size: 8.5pt; color: var(--muted); text-align: center; }

.chapter { break-before: page; page-break-before: always; }

.cover { height: 250mm; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
.cover-bar { height: 3mm; width: 40mm; background: var(--accent); margin: 30mm 0 12mm; }
.cover-title { font-size: 32pt; font-weight: 700; color: var(--head); line-height: 1.15; margin: 0 0 5mm; }
.cover-subtitle { font-size: 16pt; color: var(--muted); margin: 0; }
.cover-role { font-size: 20pt; font-weight: 600; color: var(--accent-ink); margin: 16mm 0 0; }
.cover-date { margin-top: auto; font-size: 11pt; color: var(--muted); }
.cover-source { margin: 1mm 0 0; font-size: 8.5pt; color: var(--muted); }

.toc h1 { margin-bottom: 6mm; }
.toc-chapters { list-style: none; padding: 0; margin: 0; }
.toc-chapters > li { margin: 0 0 5mm; break-inside: avoid; }
.toc-chapter { display: block; font-size: 13pt; font-weight: 650; color: var(--head); margin-bottom: 1.5mm; }
.toc-sections { list-style: none; padding: 0 0 0 4mm; margin: 0; columns: 2; column-gap: 8mm; font-size: 10pt; line-height: 1.35; }
.toc-sections li { margin: 0 0 0.8mm; break-inside: avoid; }

.goal { color: var(--muted); margin: 0 0 4mm; break-after: avoid; page-break-after: avoid; }
.lesson { margin-top: 9mm; padding-top: 1mm; }
.lesson > h2 { margin-top: 0; }
.chapter > .lesson:first-of-type { margin-top: 6mm; }
.role { margin: 0 0 3mm; padding: 1.5mm 0 0.5mm 4mm; border-left: 0.6mm solid var(--rule); }
.role-label { margin: 0 0 1.5mm; font-size: 8.5pt; font-weight: 650; color: var(--accent-ink); break-after: avoid; page-break-after: avoid; }
.noimage { margin: 3mm 0 6mm; padding: 3mm 4mm; background: var(--wash); border-radius: 1mm; break-inside: avoid; page-break-inside: avoid; }
.noimage p { margin: 0; font-size: 9pt; color: var(--muted); }
.noimage .noimage-title { font-weight: 650; color: var(--ink); margin-bottom: 0.8mm; }
.see { font-size: 9.5pt; color: var(--muted); break-before: avoid; page-break-before: avoid; break-inside: avoid; page-break-inside: avoid; }
.see p { margin: 0 0 1mm; font-weight: 650; }
.see ul { margin: 0; }
.see li { margin: 0 0 0.6mm; }
.see a { color: var(--accent-ink); }
`;
}

function buildDate() {
  return new Intl.DateTimeFormat('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date());
}

function renderCover({ role, date, source }) {
  return (
    '<section class="cover">' +
    '<div class="cover-bar"></div>' +
    `<p class="cover-title">${escapeHtml(GUIDE_TITLE)}</p>` +
    `<p class="cover-subtitle">${escapeHtml(GUIDE_SUBTITLE)}</p>` +
    (role ? `<p class="cover-role">Perfil: ${escapeHtml(role)}</p>` : '') +
    `<p class="cover-date">Versão de ${escapeHtml(date)}</p>` +
    (source ? `<p class="cover-source">Fonte das lições: ${escapeHtml(sourcePrefix(source))}</p>` : '') +
    '</section>'
  );
}

function htmlPage(title, style, body) {
  return (
    '<!doctype html>\n<html lang="pt-PT"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(title)}</title><style>${style}</style></head>\n<body>\n` +
    body.join('\n') +
    '\n</body></html>\n'
  );
}

function renderDocument({ title, role, chapters, withToc, contentDir, date, style }) {
  const body = [
    renderCover({ role: role ? role.label : null, date, source: null }),
    withToc ? renderToc(chapters) : '',
    ...chapters.map((c) => renderChapter(c, contentDir)),
  ];
  return htmlPage(title, style, body);
}

function footerTemplate(label, tokens) {
  return (
    '<div style="width:100%;margin:0 18mm;display:flex;justify-content:space-between;' +
    `font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:8pt;color:${tokens.muted};">` +
    `<span>${escapeHtml(label)}</span>` +
    '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>' +
    '</div>'
  );
}

// The guide carries no dash, and that includes the words this script adds.
function assertNoDashes(text, where) {
  for (const [ch, name] of DASH_CHARS) {
    if (text.includes(ch)) throw new BuildError(`${where} contains a dash character, ${name}.`);
  }
}

// ------------------------------------------------------------ lesson mode

/** The chrome strings /ajuda uses, from the one dictionary, so the PDF says the same words. */
function readStrings() {
  const file = path.join(REPO_ROOT, 'packages', 'i18n', 'src', 'strings.pt.json');
  const strings = JSON.parse(readFileSync(file, 'utf8'));
  const pick = (key) => {
    if (typeof strings[key] !== 'string') throw new BuildError(`packages/i18n/src/strings.pt.json has no "${key}"`);
    return strings[key];
  };
  return {
    faq: pick('guide.tabFaq'),
    faqLessons: pick('guide.faqLessonsLabel'),
    noImage: pick('guide.noImage'),
    noImageHint: pick('guide.noImageHint'),
  };
}

/** "Receção", "Receção e Proprietário", "Receção, Terapeuta e Proprietário". */
function rolesLabel(roles) {
  const labels = roles.map((role) => LABEL_OF[role] ?? role);
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

/**
 * The blocks one PDF prints. A role PDF (profile set) keeps its own role
 * blocks, unwrapped in place, and drops every other, as /ajuda does. The full
 * PDF (profile null) keeps every role block, to print under its label.
 */
function resolveBlocks(blocks, profile) {
  if (profile === null) return blocks;
  return blocks.flatMap((block) => {
    if (block.type !== 'role') return [block];
    return block.roles.includes(profile) ? resolveBlocks(block.blocks, profile) : [];
  });
}

/** Width over height of a PNG, from its IHDR chunk; null when the file is not a PNG. */
function pngRatio(file) {
  const head = readFileSync(file).subarray(0, 24);
  if (head.length < 24 || head.toString('latin1', 1, 4) !== 'PNG' || head.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = head.readUInt32BE(16);
  const height = head.readUInt32BE(20);
  return width > 0 && height > 0 ? width / height : null;
}

/**
 * A lesson's capture pair, phone then desktop, side by side at one height,
 * each captioned by its alt text; or the "Sem imagem" note when the lesson has
 * no capture yet. Never an image that did not resolve: the model checked each
 * path, and the page is checked again for images that did not load.
 */
function renderPair(images, publicDir, strings) {
  if (!images) {
    return (
      '<div class="noimage" data-no-image="">' +
      `<p class="noimage-title">${escapeHtml(strings.noImage)}</p>` +
      `<p>${escapeHtml(strings.noImageHint)}</p>` +
      '</div>'
    );
  }
  const shots = [
    ['phone', images.phone],
    ['desktop', images.desktop],
  ].map(([kind, image]) => {
    const file = path.join(publicDir, image.src);
    const ratio = pngRatio(file) ?? (kind === 'phone' ? 0.5 : 1.6);
    const caption = image.alt.trim() || (kind === 'phone' ? 'Telemóvel' : 'Computador');
    return (
      `<figure class="shot ${kind}" style="flex-grow:${ratio.toFixed(4)}">` +
      `<img src="${dataUri(file)}" alt="${escapeHtml(image.alt)}">` +
      `<figcaption>${escapeHtml(caption)}</figcaption></figure>`
    );
  });
  return `<div class="figrow pair">${shots.join('')}</div>`;
}

/**
 * One lesson body or FAQ answer as HTML. The capture pair prints where its
 * first image line sits; `images` undefined means "print no figure" (an FAQ
 * answer, whose pair is its primary lesson's and prints there). A paragraph
 * directly followed by a list is kept with it.
 */
function renderModelBlocks(blocks, ctx, images) {
  const html = [];
  let figureDone = false;
  blocks.forEach((block, i) => {
    switch (block.type) {
      case 'heading':
        html.push(`<h3>${inline(block.text)}</h3>`);
        break;
      case 'para': {
        const lead = blocks[i + 1]?.type === 'list' ? ' class="lead"' : '';
        html.push(`<p${lead}>${inline(block.text)}</p>`);
        break;
      }
      case 'list': {
        const start = block.kind === 'ol' && block.start !== 1 ? ` start="${block.start}"` : '';
        html.push(`<${block.kind}${start}>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${block.kind}>`);
        break;
      }
      case 'image':
        if (images !== undefined && !figureDone) html.push(renderPair(images, ctx.publicDir, ctx.strings));
        figureDone = true;
        break;
      case 'role':
        // Only the full PDF still has role blocks here (resolveBlocks).
        html.push(
          `<div class="role"><p class="role-label">Só para ${escapeHtml(rolesLabel(block.roles))}</p>` +
            `${renderModelBlocks(block.blocks, ctx, undefined).html}</div>`,
        );
        break;
      default:
        throw new BuildError(`unknown block type "${block.type}" in the lesson model`);
    }
  });
  return { html: html.join('\n'), figureDone };
}

const lessonAnchor = (item) => `l-${item.id.replace(/\./g, '-')}`;
const faqAnchor = (item) => `f-${item.slug}`;
const sectionAnchor = (section) => `s-${section.id}`;

function renderLesson(lesson, ctx) {
  const body = renderModelBlocks(resolveBlocks(lesson.blocks, ctx.profile), ctx, lesson.images);
  return (
    `<article class="lesson" id="${lessonAnchor(lesson)}">\n` +
    `<h2>${inline(lesson.title)}</h2>\n` +
    (lesson.goal ? `<p class="goal">${inline(lesson.goal)}</p>\n` : '') +
    body.html +
    // A lesson whose body has no image line: the pair, or the note, at the end.
    (body.figureDone ? '' : `\n${renderPair(lesson.images, ctx.publicDir, ctx.strings)}`) +
    '\n</article>'
  );
}

function renderFaqEntry(entry, ctx) {
  const body = renderModelBlocks(resolveBlocks(entry.blocks, ctx.profile), ctx, undefined);
  // The lessons it links, narrowed to the ones this PDF prints, the primary first.
  // One per line: a lesson title can hold a comma ("Confirmar, concluir, ...").
  const links = entry.see
    .map((id) => ctx.printed.get(id))
    .filter(Boolean)
    .map((lesson) => `<li><a href="#${lessonAnchor(lesson)}">${inline(lesson.title)}</a></li>`);
  return (
    `<article class="lesson" id="${faqAnchor(entry)}">\n` +
    `<h2>${inline(entry.question ?? entry.title)}</h2>\n` +
    body.html +
    (links.length > 0 ? `\n<div class="see"><p>${escapeHtml(ctx.strings.faqLessons)}</p><ul>${links.join('')}</ul></div>` : '') +
    '\n</article>'
  );
}

function renderLessonToc(faq, sections, strings) {
  const group = (href, title, items) =>
    `<li><a class="toc-chapter" href="#${href}">${inline(title)}</a>` +
    (items.length ? `<ul class="toc-sections">${items.join('')}</ul>` : '') +
    '</li>';
  const groups = [];
  if (faq.length > 0) {
    groups.push(group('perguntas', strings.faq, faq.map((entry) => `<li><a href="#${faqAnchor(entry)}">${inline(entry.question ?? entry.title)}</a></li>`)));
  }
  for (const { section, lessons } of sections) {
    groups.push(
      group(
        sectionAnchor(section),
        section.title,
        lessons.map((lesson) => `<li><a href="#${lessonAnchor(lesson)}">${inline(lesson.title)}</a></li>`),
      ),
    );
  }
  return `<section class="toc"><h1>Índice</h1><ol class="toc-chapters">${groups.join('')}</ol></section>`;
}

/**
 * The full PDF's content: every published lesson and FAQ entry, in the
 * Proprietário order (the owner reads every published lesson). A published
 * item the Proprietário does not read would follow the ordered ones, in file
 * order, so the full PDF never silently leaves a lesson out.
 */
function fullContent(guide) {
  const byOwner = (items) =>
    items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const pa = a.item.order.proprietario;
        const pb = b.item.order.proprietario;
        if ((pa === undefined) !== (pb === undefined)) return pa === undefined ? 1 : -1;
        return (pa ?? 0) - (pb ?? 0) || a.index - b.index;
      })
      .map((entry) => entry.item);
  const sections = byOwner(guide.sections)
    .map((section) => ({ section, lessons: byOwner(guide.lessons.filter((l) => l.section === section.id && !l.hold)) }))
    .filter((entry) => entry.lessons.length > 0);
  return { sections, faq: byOwner(guide.faq.filter((f) => !f.hold)) };
}

function renderGuidePdf({ job, guide, sourceHash, date, style, strings }) {
  const { sections, faq } = job.profile === null ? fullContent(guide) : { sections: sectionsFor(guide, job.profile), faq: faqFor(guide, job.profile) };
  const printed = new Map(sections.flatMap((entry) => entry.lessons).map((lesson) => [lesson.id, lesson]));
  const ctx = { profile: job.profile, publicDir: guide.publicDir, strings, printed };
  const body = [renderCover({ role: job.label, date, source: sourceHash }), renderLessonToc(faq, sections, strings)];
  if (faq.length > 0) {
    body.push(`<section class="chapter" id="perguntas">\n<h1>${escapeHtml(strings.faq)}</h1>\n${faq.map((entry) => renderFaqEntry(entry, ctx)).join('\n')}\n</section>`);
  }
  for (const { section, lessons } of sections) {
    const intro = renderModelBlocks(resolveBlocks(section.blocks, job.profile), ctx, undefined).html;
    body.push(
      `<section class="chapter" id="${sectionAnchor(section)}">\n<h1>${inline(section.title)}</h1>\n` +
        (section.goal ? `<p class="goal">${inline(section.goal)}</p>\n` : '') +
        `${intro}\n${lessons.map((lesson) => renderLesson(lesson, ctx)).join('\n')}\n</section>`,
    );
  }
  return {
    html: htmlPage(pdfTitle(job.label, sourceHash), style, body),
    counts: { sections: sections.length, lessons: printed.size, faq: faq.length },
  };
}

// ---------------------------------------------------------------- printing

function loadChromium() {
  const webPackage = new URL('../../../apps/web/package.json', import.meta.url);
  if (!existsSync(fileURLToPath(webPackage))) {
    throw new BuildError(`Cannot find ${fileURLToPath(webPackage)}; run this script from the OsteoJP repository.`);
  }
  const require = createRequire(webPackage);
  const tried = [];
  for (const name of ['@playwright/test', 'playwright-core', 'playwright']) {
    try {
      const mod = require(require.resolve(name));
      if (mod && mod.chromium) return mod.chromium;
      tried.push(`${name} (no chromium export)`);
    } catch (error) {
      tried.push(`${name} (${error.code ?? error.message})`);
    }
  }
  throw new BuildError(
    'Playwright is not installed for apps/web, so the PDF cannot be printed.\n' +
      `Tried: ${tried.join(', ')}.\n` +
      'Run "pnpm install" at the repository root, then "pnpm --filter web exec playwright install chromium".',
  );
}

async function launch() {
  const chromium = loadChromium();
  try {
    return await chromium.launch();
  } catch (error) {
    throw new BuildError(
      `Chromium for Playwright did not start: ${error.message.split('\n')[0]}\n` +
        'Install it with "pnpm --filter web exec playwright install chromium".',
    );
  }
}

/** Prints one HTML document to an A4 PDF; returns the PDF bytes and its page count. */
async function printPdf(browser, html, footer, file) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 120_000 });
    const broken = await page.evaluate(async () => {
      const images = [...document.images];
      await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
      return images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.alt || '(no alt)');
    });
    if (broken.length > 0) {
      throw new BuildError(`${broken.length} image(s) did not load in the page: ${broken.join(', ')}`);
    }
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
      margin: { top: '18mm', right: '18mm', bottom: '20mm', left: '18mm' },
      outline: true,
      tagged: true,
    });
    const pages = countPdfPages(pdf);
    if (pages === 0) throw new BuildError(`Could not count the pages of ${file}; the PDF was not written.`);
    return { pdf, pages };
  } finally {
    await page.close();
  }
}

function shownPath(file) {
  const shown = path.relative(process.cwd(), file);
  return shown.startsWith('..') ? file : shown;
}

function megabytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

// -------------------------------------------------------------------- main

async function buildChapters(opts) {
  const chapters = readChapters(opts.content);

  const errors = chapters.flatMap((chapter) => lintChapter(chapter, opts.content));
  if (errors.length > 0) {
    throw new BuildError(`The chapters are not ready to print (${errors.length} problem(s)):\n  ${errors.join('\n  ')}`);
  }

  chapters.forEach((chapter, i) => {
    chapter.index = i + 1;
    chapter.title = /^#\s+(.*)$/.exec(chapter.lines.find((line) => line.trim() !== '').trim())[1].trim();
    chapter.role = roleOf(chapter);
  });

  const roleProblems = [];
  ROLES.forEach((role, i) => {
    const owners = chapters.filter((c) => c.role === role).map((c) => c.name);
    if (owners.length === 0) {
      roleProblems.push(`no chapter for ${role.label}: name its file with "${role.slug}" (for example 0${i + 1}-${role.slug}.md) or put "${role.label}" in its "# " title`);
    } else if (owners.length > 1) {
      roleProblems.push(`${owners.length} chapters claim ${role.label}: ${owners.join(', ')}`);
    }
  });
  if (roleProblems.length > 0) {
    throw new BuildError(`Cannot split the guide by role:\n  ${roleProblems.join('\n  ')}`);
  }

  const tokens = readTokens();
  const style = css(tokens);
  const date = buildDate();
  const shared = chapters.filter((c) => c.role === null);
  const jobs = [
    { file: FULL_FILE, title: GUIDE_TITLE, role: null, chapters, withToc: true, footer: GUIDE_TITLE },
    ...ROLES.map((role) => ({
      file: role.file,
      title: `${GUIDE_TITLE}: ${role.label}`,
      role,
      chapters: chapters.filter((c) => c.role === role || shared.includes(c)),
      withToc: false,
      footer: `${GUIDE_TITLE}, ${role.label}`,
    })),
  ];

  const documents = jobs.map((job) => {
    const html = renderDocument({ ...job, contentDir: opts.content, date, style });
    const footer = footerTemplate(job.footer, tokens);
    assertNoDashes(html, `The HTML for ${job.file}`);
    assertNoDashes(footer, `The footer for ${job.file}`);
    return { ...job, html, footer };
  });

  const out = opts.out ?? HERE;
  const browser = await launch();
  mkdirSync(out, { recursive: true });
  try {
    for (const doc of documents) {
      const file = path.join(out, doc.file);
      const { pdf, pages } = await printPdf(browser, doc.html, doc.footer, file);
      writeFileSync(file, pdf);
      process.stdout.write(`${shownPath(file)}  ${pages} pages\n`);
    }
  } finally {
    await browser.close();
  }
}

async function buildLessons(opts) {
  const guide = loadGuide();
  if (guide.errors.length > 0) {
    throw new BuildError(`The lesson source is not ready to print (${guide.errors.length} problem(s)):\n  ${guide.errors.join('\n  ')}`);
  }
  const sourceHash = guideSourceHash(guide);
  const tokens = readTokens();
  const style = css(tokens);
  const strings = readStrings();
  const date = buildDate();

  const documents = PDF_JOBS.map((job) => {
    const { html, counts } = renderGuidePdf({ job, guide, sourceHash, date, style, strings });
    const footer = footerTemplate(job.label ? `${GUIDE_TITLE}, ${job.label}` : GUIDE_TITLE, tokens);
    assertNoDashes(html, `The HTML for ${job.file}`);
    assertNoDashes(footer, `The footer for ${job.file}`);
    return { job, html, footer, counts };
  });

  // Every PDF is printed and checked in memory first; nothing is written
  // unless all four carry their title.
  const out = opts.out ?? PDF_DIR;
  const mark = titleMark(sourceHash);
  const printed = [];
  const browser = await launch();
  try {
    for (const doc of documents) {
      const file = path.join(out, doc.job.file);
      const { pdf, pages } = await printPdf(browser, doc.html, doc.footer, file);
      const title = readPdfTitle(pdf);
      if (title === null || !title.endsWith(mark)) {
        throw new BuildError(`${doc.job.file}: the printed PDF's title is ${JSON.stringify(title)}, not one ending with ${JSON.stringify(mark)}; nothing was written.`);
      }
      printed.push({ ...doc, file, pdf, pages });
    }
  } finally {
    await browser.close();
  }

  mkdirSync(out, { recursive: true });
  const manifest = {
    $comment:
      'Written by docs/guide/build/build-guide.mjs with the PDFs beside it. Do not edit by hand: change the lesson source and run node docs/guide/build/build-guide.mjs. apps/web/lib/guide/guide-pdf.test.ts checks the source hash, each PDF sha256 and each PDF title against this file.',
    format: 1,
    source: {
      sha256: sourceHash,
      sections: guide.sections.length,
      lessons: guide.lessons.filter((l) => !l.hold).length,
      faq: guide.faq.filter((f) => !f.hold).length,
    },
    pdfs: printed.map((doc) => ({
      file: doc.job.file,
      profile: doc.job.profile,
      pages: doc.pages,
      bytes: doc.pdf.length,
      sha256: sha256Hex(doc.pdf),
      lessons: doc.counts.lessons,
      faq: doc.counts.faq,
    })),
  };
  for (const doc of printed) {
    writeFileSync(doc.file, doc.pdf);
    process.stdout.write(
      `${shownPath(doc.file)}  ${doc.pages} pages, ${megabytes(doc.pdf.length)}, ${doc.counts.lessons} lessons, ${doc.counts.faq} FAQ entries\n`,
    );
  }
  const manifestFile = path.join(out, MANIFEST_NAME);
  writeFileSync(manifestFile, serializeGuideData(manifest));
  process.stdout.write(`${shownPath(manifestFile)}  source ${sourcePrefix(sourceHash)}\n`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.content !== null) await buildChapters(opts);
  else await buildLessons(opts);
}

main().catch((error) => {
  if (error instanceof BuildError) {
    process.stderr.write(`build-guide: ${error.message}\n`);
    process.exit(error.code);
  }
  process.stderr.write(`build-guide: unexpected failure: ${error.stack ?? error}\n`);
  process.exit(1);
});
