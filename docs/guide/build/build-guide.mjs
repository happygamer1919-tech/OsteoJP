#!/usr/bin/env node
// Builds the platform guide PDFs from docs/guide/content/*.md.
//
//   node docs/guide/build/build-guide.mjs [--content <dir>] [--out <dir>]
//
// Reads every chapter file in file-name order, converts the small Markdown
// subset below to HTML, and prints it to A4 with Playwright's Chromium:
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
// one of the three roles has no chapter. Exit 2 is a bad invocation.
//
// No dependency of its own: Playwright is resolved from apps/web, which has
// @playwright/test as a devDependency.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ROLES = [
  { slug: 'rececao', label: 'Receção', file: 'guia-rececao.pdf' },
  { slug: 'terapeuta', label: 'Terapeuta', file: 'guia-terapeuta.pdf' },
  { slug: 'proprietario', label: 'Proprietário', file: 'guia-proprietario.pdf' },
];
const FULL_FILE = 'guia-plataforma-osteojp.pdf';
const GUIDE_TITLE = 'Guia da plataforma OsteoJP';
const GUIDE_SUBTITLE = 'Para a equipa da clínica';

// Every dash character the guide must not contain, by code point. Not only
// the dashes proper: a Unicode hyphen, a non-breaking hyphen or a minus sign
// looks like "-" on the page but slips past the ASCII hyphen checks below.
// Keep this list the same as DASHES in scripts/guide-content.test.mjs.
const DASH_CHARS = [
  ['\u2010', 'hyphen (U+2010)'],
  ['\u2011', 'non-breaking hyphen (U+2011)'],
  ['\u2012', 'figure dash (U+2012)'],
  ['\u2013', 'en dash (U+2013)'],
  ['\u2014', 'em dash (U+2014)'],
  ['\u2015', 'horizontal bar (U+2015)'],
  ['\u2212', 'minus sign (U+2212)'],
  ['\ufe58', 'small em dash (U+FE58)'],
  ['\ufe63', 'small hyphen-minus (U+FE63)'],
  ['\uff0d', 'fullwidth hyphen-minus (U+FF0D)'],
];

// A hyphen used as punctuation: one that starts a word ("outro -solto", or a
// line) or ends one ("outro- solto", or a line). A hyphen inside a word
// (palavra-passe, e-mail) has a letter on both sides and never matches.
const HYPHEN_PUNCTUATION = /(^|\s)-|-(\s|$)/;

const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const IMG_ANY = /!\[[^\]]*\]\(([^)\s]*)\)/g;

class BuildError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = { content: path.resolve(HERE, '..', 'content'), out: HERE };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: node docs/guide/build/build-guide.mjs [--content <dir>] [--out <dir>]\n');
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
    const n = index + 1;
    const trimmed = line.trim();

    for (const [ch, name] of DASH_CHARS) {
      if (line.includes(ch)) at(n, `contains a dash character, ${name}; use a comma, full stop, colon or parentheses`);
    }
    if (/^\s*-(\s|$)/.test(line)) at(n, 'hyphen used as a list marker; use "* "');
    else if (HYPHEN_PUNCTUATION.test(line)) at(n, 'hyphen used as punctuation between words');
    if (line.includes('--')) at(n, 'double hyphen');

    if (/^\s*(```|~~~)/.test(line)) at(n, 'fenced code is not supported');
    if (line.includes('|')) at(n, 'tables ("|") are not supported');
    if (/<[A-Za-z!/?]/.test(line)) at(n, 'HTML tags are not supported');
    if (/^\s*>/.test(line)) at(n, 'block quotes (">") are not supported');
    if (/^#{4,}/.test(trimmed)) at(n, 'headings deeper than "###" are not supported');
    else if (/^#+[^#\s]/.test(trimmed)) at(n, 'a heading needs a space after "#"');
    if (/^([-*_=])(\s*\1){2,}$/.test(trimmed)) at(n, 'horizontal rules and underlined headings are not supported');
    if (/^\s*\+\s/.test(line)) at(n, 'use "* " for list items');
    if (/^\s+(\*|\+|\d+\.)\s/.test(line)) at(n, 'nested lists are not supported');
    else if (/^(\t| {4,})\S/.test(line)) at(n, 'indented code is not supported');
    if (/(^|[^!])\[[^\]]*\]\(/.test(line)) at(n, 'links are not supported; only image lines ![alt](path)');
    if (line.includes('![') && !IMG_LINE.test(trimmed)) at(n, 'an image must be alone on its line, as ![alt](path)');
    const leftover = line.replace(/^\s*\*\s+/, '').replace(/\*\*[^*]+\*\*/g, '');
    if (leftover.includes('*')) at(n, 'unsupported "*": use **bold** or a "* " list item');
    if (line.includes('__')) at(n, 'use **bold**, not __bold__');

    for (const match of line.matchAll(IMG_ANY)) {
      const src = match[1];
      const resolved = path.resolve(contentDir, src);
      if (!src || /^[a-z]+:/i.test(src) || !existsSync(resolved) || !statSync(resolved).isFile()) {
        at(n, `image not found: ${src} (looked for ${resolved})`);
      }
    }
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

function parseBlocks(lines) {
  const blocks = [];
  let para = null;
  let list = null;
  let afterBlank = false;
  const close = () => {
    para = null;
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      para = null;
      afterBlank = true;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const image = IMG_LINE.exec(line);
    const bullet = /^\*\s+(.*)$/.exec(line);
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);

    if (heading) {
      close();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
    } else if (image) {
      close();
      blocks.push({ type: 'image', alt: image[1], src: image[2] });
    } else if (bullet || numbered) {
      para = null;
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        list = { type: 'list', kind, start: numbered ? Number(numbered[1]) : 1, items: [] };
        blocks.push(list);
      }
      list.items.push(bullet ? bullet[1] : numbered[2]);
    } else if (list && !afterBlank) {
      list.items[list.items.length - 1] += ` ${line}`;
    } else if (para) {
      para.text += ` ${line}`;
    } else {
      list = null;
      para = { type: 'para', text: line };
      blocks.push(para);
    }
    afterBlank = false;
  }
  return blocks;
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

const CSS = `
@page { size: A4; }
:root {
  --ink: #1f2a30;
  --muted: #5a6b76;
  --head: #334956;
  --accent: #45b9a7;
  --accent-ink: #2d7f72;
  --rule: #b8c4cc;
}
html {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.45;
  color: var(--ink);
  background: #ffffff;
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
strong { font-weight: 650; color: #16242b; }
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; background: #eef2f4; padding: 0 1mm; border-radius: 0.8mm; }
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
.shot img { display: block; box-sizing: border-box; width: 100%; height: auto; border: 0.3mm solid var(--rule); border-radius: 1mm; }
figcaption { margin-top: 1.5mm; font-size: 8.5pt; color: var(--muted); text-align: center; }

.chapter { break-before: page; page-break-before: always; }

.cover { height: 250mm; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
.cover-bar { height: 3mm; width: 40mm; background: var(--accent); margin: 30mm 0 12mm; }
.cover-title { font-size: 32pt; font-weight: 700; color: var(--head); line-height: 1.15; margin: 0 0 5mm; }
.cover-subtitle { font-size: 16pt; color: var(--muted); margin: 0; }
.cover-role { font-size: 20pt; font-weight: 600; color: var(--accent-ink); margin: 16mm 0 0; }
.cover-date { margin-top: auto; font-size: 11pt; color: var(--muted); }

.toc h1 { margin-bottom: 6mm; }
.toc-chapters { list-style: none; padding: 0; margin: 0; }
.toc-chapters > li { margin: 0 0 5mm; break-inside: avoid; }
.toc-chapter { display: block; font-size: 13pt; font-weight: 650; color: var(--head); margin-bottom: 1.5mm; }
.toc-sections { list-style: none; padding: 0 0 0 4mm; margin: 0; columns: 2; column-gap: 8mm; font-size: 10pt; line-height: 1.35; }
.toc-sections li { margin: 0 0 0.8mm; break-inside: avoid; }
`;

function buildDate() {
  return new Intl.DateTimeFormat('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date());
}

function renderDocument({ title, role, chapters, withToc, contentDir, date }) {
  const cover =
    '<section class="cover">' +
    '<div class="cover-bar"></div>' +
    `<p class="cover-title">${escapeHtml(GUIDE_TITLE)}</p>` +
    `<p class="cover-subtitle">${escapeHtml(GUIDE_SUBTITLE)}</p>` +
    (role ? `<p class="cover-role">Perfil: ${escapeHtml(role.label)}</p>` : '') +
    `<p class="cover-date">Versão de ${escapeHtml(date)}</p>` +
    '</section>';
  const body = [cover, withToc ? renderToc(chapters) : '', ...chapters.map((c) => renderChapter(c, contentDir))];
  return (
    '<!doctype html>\n<html lang="pt-PT"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(title)}</title><style>${CSS}</style></head>\n<body>\n` +
    body.join('\n') +
    '\n</body></html>\n'
  );
}

function footerTemplate(label) {
  return (
    '<div style="width:100%;margin:0 18mm;display:flex;justify-content:space-between;' +
    'font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:8pt;color:#5a6b76;">' +
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

function countPages(pdf) {
  const matches = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

async function printPdf(browser, html, footerLabel, file) {
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
      footerTemplate: footerTemplate(footerLabel),
      margin: { top: '18mm', right: '18mm', bottom: '20mm', left: '18mm' },
      outline: true,
      tagged: true,
    });
    const pages = countPages(pdf);
    if (pages === 0) throw new BuildError(`Could not count the pages of ${file}; the PDF was not written.`);
    writeFileSync(file, pdf);
    return pages;
  } finally {
    await page.close();
  }
}

// -------------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
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
    const html = renderDocument({ ...job, contentDir: opts.content, date });
    assertNoDashes(html, `The HTML for ${job.file}`);
    assertNoDashes(footerTemplate(job.footer), `The footer for ${job.file}`);
    return { ...job, html };
  });

  const chromium = loadChromium();
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new BuildError(
      `Chromium for Playwright did not start: ${error.message.split('\n')[0]}\n` +
        'Install it with "pnpm --filter web exec playwright install chromium".',
    );
  }

  mkdirSync(opts.out, { recursive: true });
  try {
    for (const doc of documents) {
      const file = path.join(opts.out, doc.file);
      const pages = await printPdf(browser, doc.html, doc.footer, file);
      const shown = path.relative(process.cwd(), file);
      process.stdout.write(`${shown.startsWith('..') ? file : shown}  ${pages} pages\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (error instanceof BuildError) {
    process.stderr.write(`build-guide: ${error.message}\n`);
    process.exit(error.code);
  }
  process.stderr.write(`build-guide: unexpected failure: ${error.stack ?? error}\n`);
  process.exit(1);
});
