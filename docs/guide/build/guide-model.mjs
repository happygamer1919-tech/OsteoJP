// The guide's content model: one reader for the lesson source, shared by every
// consumer of it.
//
//   docs/guide/content/NN-<section>/_seccao.md        a section of the guide
//   docs/guide/content/NN-<section>/NN-<slug>.md      a lesson of that section
//   docs/guide/content/00-perguntas/NN-<slug>.md      an FAQ entry (PR 4)
//
// The three chapter files at the top of docs/guide/content (01-rececao.md and
// its two siblings) are NOT read here. build-guide.mjs still prints them, and
// the Markdown lint and parser it uses live in this file, so the chapters and
// the lessons are held to one set of rules.
//
// A guide file is a flat front matter block, then a body. The block opens and
// closes with a line of three hyphens (the only place a guide file may have
// one); between them, one "key: value" per line:
//
//   id: agenda.marcar-consulta
//   title: Marcar uma consulta
//   goal: Criar uma marcação para um paciente que já tem ficha.
//   roles: rececao, terapeuta, proprietario
//   order: rececao 1, terapeuta 3, proprietario 2
//   capability: appointments:write
//
// and the body after it:
//
//   ## Marcar uma consulta
//
//   1. Clique em **Nova marcação**.
//
//   ::: terapeuta
//   Só um terapeuta lê este parágrafo.
//   :::
//
// The body uses the chapters' Markdown subset (build/README.md) plus role
// blocks: a line "::: <role> [<role> ...]" opens one, a line ":::" closes it,
// and only viewers of those roles see what is inside.
//
// Pure ESM, no dependency. Nothing runs at import time: build-guide.mjs imports
// this module for its lint and parser, and a test imports it to regenerate the
// JSON that /ajuda reads (apps/web/lib/guide/guide-data.json).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repository root, from this file's own location. */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
/** Where the lesson folders live. */
export const CONTENT_DIR = path.join(REPO_ROOT, 'docs', 'guide', 'content');
/** apps/web's static folder; a lesson's captures sit under its ajuda/ folder. */
export const PUBLIC_DIR = path.join(REPO_ROOT, 'apps', 'web', 'public');
/** The screen list whose capture names a lesson's "screens" key may use. */
export const OUTLINE_FILE = path.join(REPO_ROOT, 'docs', 'guide', 'outline.md');
/** Where gen-guide-data.mjs writes the JSON that /ajuda reads. */
export const GUIDE_DATA_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'guide', 'guide-data.json');

/** A lesson body stays UNDER this many words (so at most 199). */
export const WORD_LIMIT = 200;

// ==== The Markdown lint and parser ====
//
// Moved here from build-guide.mjs, unchanged, so the chapter PDFs and the
// lessons share them. The messages are the builder's own:
// scripts/guide-content.test.mjs spawns the builder and asserts them exactly.

// Every dash character the guide must not contain, by code point. Not only
// the dashes proper: a Unicode hyphen, a non-breaking hyphen or a minus sign
// looks like "-" on the page but slips past the ASCII hyphen checks below.
// Keep this list the same as DASHES in scripts/guide-content.test.mjs.
export const DASH_CHARS = [
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
export const HYPHEN_PUNCTUATION = /(^|\s)-|-(\s|$)/;

export const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
export const IMG_ANY = /!\[[^\]]*\]\(([^)\s]*)\)/g;

/** The builder's "image not found" message, or null when the image exists. */
export function imageProblem(src, baseDir) {
  const resolved = path.resolve(baseDir, src);
  if (!src || /^[a-z]+:/i.test(src) || !existsSync(resolved) || !statSync(resolved).isFile()) {
    return `image not found: ${src} (looked for ${resolved})`;
  }
  return null;
}

/**
 * What is wrong with one line of Markdown, in the builder's words and order.
 * Image paths resolve against baseDir.
 */
export function lintLine(line, baseDir) {
  const problems = [];
  const trimmed = line.trim();

  for (const [ch, name] of DASH_CHARS) {
    if (line.includes(ch)) problems.push(`contains a dash character, ${name}; use a comma, full stop, colon or parentheses`);
  }
  if (/^\s*-(\s|$)/.test(line)) problems.push('hyphen used as a list marker; use "* "');
  else if (HYPHEN_PUNCTUATION.test(line)) problems.push('hyphen used as punctuation between words');
  if (line.includes('--')) problems.push('double hyphen');

  if (/^\s*(```|~~~)/.test(line)) problems.push('fenced code is not supported');
  if (line.includes('|')) problems.push('tables ("|") are not supported');
  if (/<[A-Za-z!/?]/.test(line)) problems.push('HTML tags are not supported');
  if (/^\s*>/.test(line)) problems.push('block quotes (">") are not supported');
  if (/^#{4,}/.test(trimmed)) problems.push('headings deeper than "###" are not supported');
  else if (/^#+[^#\s]/.test(trimmed)) problems.push('a heading needs a space after "#"');
  if (/^([-*_=])(\s*\1){2,}$/.test(trimmed)) problems.push('horizontal rules and underlined headings are not supported');
  if (/^\s*\+\s/.test(line)) problems.push('use "* " for list items');
  if (/^\s+(\*|\+|\d+\.)\s/.test(line)) problems.push('nested lists are not supported');
  else if (/^(\t| {4,})\S/.test(line)) problems.push('indented code is not supported');
  if (/(^|[^!])\[[^\]]*\]\(/.test(line)) problems.push('links are not supported; only image lines ![alt](path)');
  if (line.includes('![') && !IMG_LINE.test(trimmed)) problems.push('an image must be alone on its line, as ![alt](path)');
  const leftover = line.replace(/^\s*\*\s+/, '').replace(/\*\*[^*]+\*\*/g, '');
  if (leftover.includes('*')) problems.push('unsupported "*": use **bold** or a "* " list item');
  if (line.includes('__')) problems.push('use **bold**, not __bold__');

  for (const match of line.matchAll(IMG_ANY)) {
    const problem = imageProblem(match[1], baseDir);
    if (problem) problems.push(problem);
  }
  return problems;
}

/** The Markdown subset as blocks: heading, para, list, image. */
export function parseBlocks(lines) {
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

// ==== The lesson source ====

/** The three guide profiles. Admin is derived in apps/web (the Proprietário lessons it can open). */
export const PROFILES = Object.freeze(['rececao', 'terapeuta', 'proprietario']);

/** The closed front matter key set. Any other key is an error. */
export const FRONT_MATTER_KEYS = Object.freeze([
  'id',
  'title',
  'goal',
  'roles',
  'order',
  'capability',
  'screens',
  'shots',
  'faq',
  'question',
  'answers',
  'see',
  'review',
  'hold',
]);

/** The folder of the FAQ entries; every other NN-<slug> folder is a section. */
export const FAQ_FOLDER = '00-perguntas';
/** The file that describes a section. */
export const SECTION_FILE = '_seccao.md';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const FOLDER = new RegExp(`^(\\d\\d)-(${SLUG})$`);
const LESSON_FILE = new RegExp(`^(\\d\\d)-(${SLUG})\\.md$`);
const SLUG_ONLY = new RegExp(`^${SLUG}$`);
const LESSON_ID = new RegExp(`^${SLUG}\\.${SLUG}$`);
const CAPABILITY = /^[a-z_]+:[a-z_]+$/;
const TOKEN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const ROLE_MARKER = /^:::(?: ([a-z]+(?: [a-z]+)*))?$/;

/** Thrown by guideData when the source has errors; carries every one of them. */
export class GuideError extends Error {
  constructor(errors) {
    super(`The guide source has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
    this.errors = errors;
  }
}

const posix = (p) => p.split(path.sep).join('/');

function splitList(value) {
  return value.split(',').map((item) => item.trim());
}

/**
 * Reads the front matter of one file. Returns { fields, end } where fields maps
 * a key to { value, line } and end is the index of the closing fence line, or
 * null when there is no readable front matter.
 */
function readFrontMatter(lines, at) {
  if (lines[0] !== '---') {
    at(1, 'a guide file starts with its front matter, opened by a line of three hyphens');
    return null;
  }
  const end = lines.indexOf('---', 1);
  if (end === -1) {
    at(1, 'the front matter is never closed by a line of three hyphens');
    return null;
  }
  const fields = {};
  for (let i = 1; i < end; i += 1) {
    const n = i + 1;
    const match = /^([a-z]+): (\S.*)$/.exec(lines[i]);
    if (!match) {
      at(n, 'a front matter line is "key: value"');
      continue;
    }
    const key = match[1];
    const value = match[2].replace(/\s+$/, '');
    if (!FRONT_MATTER_KEYS.includes(key)) {
      at(n, `unknown front matter key "${key}"; the keys are: ${FRONT_MATTER_KEYS.join(' ')}`);
      continue;
    }
    if (key in fields) {
      at(n, `front matter key "${key}" is given twice`);
      continue;
    }
    for (const [ch, name] of DASH_CHARS) {
      if (value.includes(ch)) at(n, `the value of "${key}" contains a dash character, ${name}`);
    }
    if (HYPHEN_PUNCTUATION.test(value) || value.includes('--')) {
      at(n, `the value of "${key}" uses a hyphen as punctuation; a hyphen belongs only inside a word`);
    }
    fields[key] = { value, line: n };
  }
  return { fields, end };
}

function readRoles(field, at) {
  const roles = [];
  for (const role of splitList(field.value)) {
    if (!PROFILES.includes(role)) at(field.line, `unknown role "${role}" in roles; the roles are ${PROFILES.join(', ')}`);
    else if (roles.includes(role)) at(field.line, `role "${role}" is listed twice`);
    else roles.push(role);
  }
  return roles;
}

function readOrder(field, roles, at) {
  const order = {};
  if (!field) {
    if (roles.length > 0) at(1, 'missing front matter key "order" (a position for each role)');
    return order;
  }
  for (const item of splitList(field.value)) {
    const match = /^([a-z]+) ([1-9]\d*)$/.exec(item);
    if (!match) {
      at(field.line, `an order item is "<role> <position>", not "${item}"`);
      continue;
    }
    const [, role, position] = match;
    if (!roles.includes(role)) at(field.line, `order gives a position to "${role}", which is not in roles`);
    else if (role in order) at(field.line, `order gives "${role}" two positions`);
    else order[role] = Number(position);
  }
  for (const role of roles) {
    if (!(role in order)) at(field.line, `order gives no position to "${role}"`);
  }
  return order;
}

function readIdList(field, at, shape, what) {
  if (!field) return [];
  const items = splitList(field.value);
  for (const item of items) {
    if (!shape.test(item)) at(field.line, `"${item}" is not ${what}`);
  }
  return items;
}

/**
 * The body of one file: lint every line, split the role blocks out, parse the
 * rest with parseBlocks. Returns { blocks, images } where blocks still holds the
 * "## " title heading.
 */
function readBody(lines, start, ctx, at) {
  const blocks = [];
  const images = [];
  let segment = [];
  let open = null;
  let titleSeen = false;

  const flush = (target) => {
    target.push(...parseBlocks(segment));
    segment = [];
  };

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith(':::')) {
      const marker = ROLE_MARKER.exec(line);
      if (!marker) {
        at(n, 'a role block line is ":::" alone, or "::: " and role names separated by one space');
        continue;
      }
      if (marker[1] === undefined) {
        if (!open) {
          at(n, 'this ":::" closes a role block that was never opened');
          continue;
        }
        const inner = parseBlocks(segment);
        segment = [];
        if (inner.length === 0) at(open.line, 'an empty role block');
        blocks.push({ type: 'role', roles: open.roles, blocks: inner });
        open = null;
        continue;
      }
      if (open) {
        at(n, `role blocks do not nest; close the block opened on line ${open.line} with ":::" first`);
        continue;
      }
      const roles = marker[1].split(' ');
      for (const role of roles) {
        if (!PROFILES.includes(role)) at(n, `unknown role "${role}" in a role block; the roles are ${PROFILES.join(', ')}`);
        else if (!ctx.roles.includes(role)) at(n, `the role block names "${role}", which is not in this file's roles, so no viewer would see it`);
      }
      if (new Set(roles).size !== roles.length) at(n, 'the role block names a role twice');
      if (ctx.kind === 'section') at(n, 'a section file has no role blocks');
      flush(blocks);
      open = { roles, line: n };
      continue;
    }

    for (const problem of lintLine(line, ctx.dir)) at(n, problem);
    if (line.includes('`')) at(n, 'code ("`") is not supported in a guide file');

    if (trimmed !== '' && !titleSeen) {
      titleSeen = true;
      if (trimmed !== `## ${ctx.title}`) at(n, `the body starts with the "## " title line, "## ${ctx.title}"`);
    } else if (/^#{1,2}\s/.test(trimmed)) {
      at(n, 'a guide file has one "## " title line; use "### " for a heading inside it');
    }

    const image = IMG_LINE.exec(trimmed);
    if (image) images.push({ line: n, alt: image[1], src: image[2], inRole: open !== null });

    segment.push(line);
  }

  if (open) {
    at(open.line, 'this role block is never closed with ":::"');
    flush([]);
  }
  flush(blocks);
  if (!titleSeen) at(lines.length, `the body is empty; it starts with the "## " title line, "## ${ctx.title}"`);
  return { blocks, images };
}

/** Every word a viewer could read: headings, paragraphs and list items, role blocks included. */
export function countWords(blocks) {
  const count = (text) =>
    text
      .replace(/\*\*/g, '')
      .split(/\s+/)
      .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  let words = 0;
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'para') words += count(block.text);
    else if (block.type === 'list') for (const item of block.items) words += count(item);
    else if (block.type === 'role') words += countWords(block.blocks);
  }
  return words;
}

/**
 * The lesson's capture pair, checked: none, or exactly one phone capture (390)
 * and one desktop capture of this lesson, on consecutive image lines outside any role
 * block, at apps/web/public/ajuda/<section>/<slug>-{390,desktop}.png.
 */
function readImages(images, ctx, at, lines) {
  if (images.length === 0) return null;
  const first = images[0];
  if (ctx.kind === 'section') {
    at(first.line, 'a section file has no image; the captures belong to its lessons');
    return null;
  }
  if (images.length !== 2) {
    at(first.line, `a lesson has one capture pair (the phone capture, 390, and the desktop capture), not ${images.length} image line(s)`);
    return null;
  }
  const [a, b] = images;
  let ok = true;
  if (a.inRole || b.inRole) {
    at(a.line, 'the capture pair sits outside any role block');
    ok = false;
  }
  if (lines.slice(a.line, b.line - 1).some((line) => line.trim() !== '')) {
    at(a.line, 'the phone and desktop images sit on consecutive image lines');
    ok = false;
  }
  const want = {
    phone: path.join(ctx.publicDir, 'ajuda', ctx.section, `${ctx.slug}-390.png`),
    desktop: path.join(ctx.publicDir, 'ajuda', ctx.section, `${ctx.slug}-desktop.png`),
  };
  const found = {};
  for (const image of images) {
    const resolved = path.resolve(ctx.dir, image.src);
    const kind = resolved === want.phone ? 'phone' : resolved === want.desktop ? 'desktop' : null;
    if (!kind) {
      at(image.line, `a capture of this lesson is apps/web/public/ajuda/${ctx.section}/${ctx.slug}-390.png or ${ctx.slug}-desktop.png, not ${image.src}`);
      ok = false;
    } else if (found[kind]) {
      at(image.line, `the ${kind} capture is named twice`);
      ok = false;
    } else {
      found[kind] = { src: `/${posix(path.relative(ctx.publicDir, resolved))}`, alt: image.alt };
    }
  }
  if (!ok || !found.phone || !found.desktop) return null;
  return found;
}

function captureNames(outline) {
  return new Set([...outline.matchAll(/\]\(screens\/[a-z]+\/([a-z0-9-]+)-(?:390|desktop)\.png\)/g)].map((m) => m[1]));
}

/**
 * Reads one guide file. kind is 'section', 'lesson' or 'faq'. Returns the
 * parsed record, or null when its front matter could not be read at all.
 */
function readGuideFile(file, ctx, at) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const front = readFrontMatter(lines, at);
  if (!front) return null;
  const { fields } = front;
  const value = (key) => (fields[key] ? fields[key].value : null);

  const required = ctx.kind === 'faq' ? ['id', 'title', 'roles', 'question'] : ['id', 'title', 'roles', 'goal'];
  for (const key of required) {
    if (!fields[key]) at(1, `missing front matter key "${key}"`);
  }
  if (ctx.kind === 'section') {
    for (const key of Object.keys(fields)) {
      if (!['id', 'title', 'goal', 'roles', 'order'].includes(key)) {
        at(fields[key].line, `a section file takes id, title, goal, roles and order, not "${key}"`);
      }
    }
  }

  const wantId = ctx.kind === 'section' ? ctx.section : `${ctx.section}.${ctx.slug}`;
  if (fields.id && fields.id.value !== wantId) at(fields.id.line, `the id of this file is "${wantId}", from its folder and name`);

  const roles = fields.roles ? readRoles(fields.roles, at) : [];
  const order = readOrder(fields.order, roles, at);

  const capability = value('capability');
  if (fields.capability && !CAPABILITY.test(capability)) {
    at(fields.capability.line, `"${capability}" is not a packages/auth capability such as appointments:write`);
  }

  const screens = readIdList(fields.screens, at, SLUG_ONLY, 'a capture name from docs/guide/outline.md');
  if (ctx.screenNames) {
    for (const name of screens) {
      if (SLUG_ONLY.test(name) && !ctx.screenNames.has(name)) {
        at(fields.screens.line, `"${name}" is not a capture name in docs/guide/outline.md`);
      }
    }
  }
  const faq = readIdList(fields.faq, at, SLUG_ONLY, 'an FAQ slug such as marcar-consulta');
  const answers = readIdList(fields.answers, at, LESSON_ID, 'a lesson id such as agenda.marcar-consulta');
  const see = readIdList(fields.see, at, LESSON_ID, 'a lesson id such as agenda.marcar-consulta');
  for (const key of ['review', 'hold']) {
    if (fields[key] && !TOKEN.test(fields[key].value)) at(fields[key].line, `"${key}" is one card name, such as CARE-02a or GUEST-05`);
  }

  const title = value('title') ?? '';
  const body = readBody(lines, front.end + 1, { ...ctx, roles, title }, at);
  const words = countWords(body.blocks);
  if (words >= WORD_LIMIT) at(front.end + 2, `${words} words; a guide file stays under ${WORD_LIMIT}`);

  const images = readImages(body.images, ctx, at, lines);
  const shots = value('shots');
  if (shots !== null && shots !== wantId) at(fields.shots.line, `shots is this file's id, "${wantId}"`);
  if (body.images.length > 0 && shots === null && ctx.kind !== 'section') {
    at(body.images[0].line, `a lesson with a capture names its capture spec: "shots: ${wantId}"`);
  }
  if (shots !== null && body.images.length === 0) at(fields.shots.line, 'shots is set, but the body has no capture pair');

  // The "## " title heading is the title key, already checked; the blocks are what follows it.
  const blocks = body.blocks[0]?.type === 'heading' && body.blocks[0].level === 2 ? body.blocks.slice(1) : body.blocks;

  return {
    kind: ctx.kind,
    id: wantId,
    section: ctx.section,
    slug: ctx.slug,
    file: ctx.rel,
    title,
    goal: value('goal'),
    question: value('question'),
    roles,
    order,
    capability,
    screens,
    shots,
    faq,
    answers,
    see,
    review: value('review'),
    hold: value('hold'),
    blocks,
    words,
    images,
  };
}

/**
 * Reads the whole lesson source. Never throws on bad content: every problem is
 * in the returned errors, as "<folder>/<file>:<line>: <message>".
 *
 * options.contentDir  the folder holding the NN-<section>/ folders
 * options.publicDir   apps/web/public (captures resolve under its ajuda/)
 * options.outlineFile the outline whose capture names "screens" may use; null skips that check
 */
export function loadGuide(options = {}) {
  const contentDir = path.resolve(options.contentDir ?? CONTENT_DIR);
  const publicDir = path.resolve(options.publicDir ?? PUBLIC_DIR);
  const outlineFile = options.outlineFile === undefined ? OUTLINE_FILE : options.outlineFile;
  const errors = [];
  const guide = { contentDir, publicDir, sections: [], lessons: [], faq: [], errors };

  if (!existsSync(contentDir) || !statSync(contentDir).isDirectory()) {
    errors.push(`${contentDir}: the content directory does not exist`);
    return guide;
  }
  const screenNames = outlineFile && existsSync(outlineFile) ? captureNames(readFileSync(outlineFile, 'utf8')) : null;
  const folders = readdirSync(contentDir)
    .filter((name) => FOLDER.test(name) && statSync(path.join(contentDir, name)).isDirectory())
    .sort();
  if (folders.length === 0) errors.push(`${contentDir}: no NN-<section> folder`);

  const sectionNumbers = new Map();
  for (const folder of folders) {
    const [, number, slug] = FOLDER.exec(folder);
    const isFaq = folder === FAQ_FOLDER;
    const section = isFaq ? 'perguntas' : slug;
    if (!isFaq && sectionNumbers.has(number)) errors.push(`${folder}: two section folders are numbered ${number}`);
    sectionNumbers.set(number, folder);
    const dir = path.join(contentDir, folder);
    const names = readdirSync(dir).sort();
    if (!isFaq && !names.includes(SECTION_FILE)) errors.push(`${folder}: no ${SECTION_FILE} describing the section`);
    const lessonNumbers = new Map();
    for (const name of names) {
      const rel = `${folder}/${name}`;
      const at = (n, message) => errors.push(`${rel}:${n}: ${message}`);
      if (name.startsWith('.')) continue;
      const base = { dir, publicDir, screenNames, section, rel };
      if (name === SECTION_FILE && !isFaq) {
        const record = readGuideFile(path.join(dir, name), { ...base, kind: 'section', slug: section }, at);
        if (record) guide.sections.push({ ...record, folder });
        continue;
      }
      const lesson = LESSON_FILE.exec(name);
      if (!lesson) {
        errors.push(`${rel}: a guide file is named NN-<slug>.md${isFaq ? '' : ` or ${SECTION_FILE}`}`);
        continue;
      }
      if (lessonNumbers.has(lesson[1])) errors.push(`${rel}: two files in ${folder} are numbered ${lesson[1]}`);
      lessonNumbers.set(lesson[1], name);
      const record = readGuideFile(path.join(dir, name), { ...base, kind: isFaq ? 'faq' : 'lesson', slug: lesson[2] }, at);
      if (record) (isFaq ? guide.faq : guide.lessons).push(record);
    }
  }

  crossCheck(guide);
  return guide;
}

function crossCheck(guide) {
  const { errors } = guide;
  const all = [...guide.sections, ...guide.lessons, ...guide.faq];
  const seen = new Map();
  for (const item of all) {
    if (seen.has(item.id)) errors.push(`${item.file}: the id "${item.id}" is also the id of ${seen.get(item.id)}`);
    else seen.set(item.id, item.file);
  }

  const sectionById = new Map(guide.sections.map((s) => [s.id, s]));
  for (const profile of PROFILES) {
    const positions = new Map();
    for (const section of guide.sections) {
      const position = section.order[profile];
      if (position === undefined) continue;
      if (positions.has(position)) {
        errors.push(`${section.file}: section position ${position} for ${profile} is also ${positions.get(position)}'s`);
      } else positions.set(position, section.id);
    }
  }

  for (const lesson of guide.lessons) {
    const section = sectionById.get(lesson.section);
    if (!section) continue;
    for (const role of lesson.roles) {
      if (!section.roles.includes(role)) {
        errors.push(`${lesson.file}: role "${role}" is not in the roles of its section (${section.file}), so no viewer would reach it`);
      }
    }
  }

  const groups = [...guide.sections.map((s) => [s.id, guide.lessons.filter((l) => l.section === s.id)]), ['perguntas', guide.faq]];
  for (const [, items] of groups) {
    for (const profile of PROFILES) {
      const positions = new Map();
      for (const item of items) {
        const position = item.order[profile];
        if (position === undefined) continue;
        if (positions.has(position)) errors.push(`${item.file}: position ${position} for ${profile} is also ${positions.get(position)}'s`);
        else positions.set(position, item.file);
      }
    }
  }

  for (const section of guide.sections) {
    for (const role of section.roles) {
      const reachable = guide.lessons.some((l) => l.section === section.id && !l.hold && l.roles.includes(role));
      if (!reachable) errors.push(`${section.file}: the section lists "${role}", but no published lesson in it does`);
    }
  }

  const lessonIds = new Set(guide.lessons.map((l) => l.id));
  for (const item of [...guide.lessons, ...guide.faq]) {
    for (const id of [...item.answers, ...item.see]) {
      if (LESSON_ID.test(id) && !lessonIds.has(id)) errors.push(`${item.file}: "${id}" is not a lesson id`);
    }
  }
  if (guide.faq.length > 0) {
    const faqSlugs = new Set(guide.faq.map((f) => f.slug));
    for (const lesson of guide.lessons) {
      for (const slug of lesson.faq) {
        if (!faqSlugs.has(slug)) errors.push(`${lesson.file}: faq "${slug}" names no file in ${FAQ_FOLDER}`);
      }
    }
  }
}

function assertProfile(profile) {
  if (!PROFILES.includes(profile)) throw new Error(`unknown guide profile "${profile}"; the profiles are ${PROFILES.join(', ')}`);
}

/**
 * The sections a profile sees, in that profile's section order, each with its
 * published lessons in that profile's lesson order. Held lessons are left out,
 * and so is a section left with no lesson. keep narrows the lessons further
 * (apps/web passes the admin capability filter).
 */
export function sectionsFor(guide, profile, keep = () => true) {
  assertProfile(profile);
  return guide.sections
    .filter((section) => section.order[profile] !== undefined)
    .sort((a, b) => a.order[profile] - b.order[profile])
    .map((section) => ({
      section,
      lessons: guide.lessons
        .filter((l) => l.section === section.id && !l.hold && l.roles.includes(profile) && keep(l))
        .sort((a, b) => a.order[profile] - b.order[profile]),
    }))
    .filter((entry) => entry.lessons.length > 0);
}

/** The published lessons a profile sees, in order: section order, then lesson order. */
export function lessonsFor(guide, profile, keep = () => true) {
  return sectionsFor(guide, profile, keep).flatMap((entry) => entry.lessons);
}

/** The published FAQ entries a profile sees, in that profile's order. */
export function faqFor(guide, profile, keep = () => true) {
  assertProfile(profile);
  return guide.faq
    .filter((f) => !f.hold && f.roles.includes(profile) && keep(f))
    .sort((a, b) => a.order[profile] - b.order[profile]);
}

// ==== The JSON that /ajuda reads ====

/** "Clique em **Guardar**." as [{ text: "Clique em " }, { strong: "Guardar" }, { text: "." }]. */
export function inlineSpans(text) {
  const spans = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*(.+?)\*\*/g)) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index) });
    spans.push({ strong: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

function blocksJson(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.type === 'heading') out.push({ type: 'heading', level: block.level, spans: inlineSpans(block.text) });
    else if (block.type === 'para') out.push({ type: 'para', spans: inlineSpans(block.text) });
    else if (block.type === 'list') out.push({ type: 'list', kind: block.kind, start: block.start, items: block.items.map(inlineSpans) });
    else if (block.type === 'role') out.push({ type: 'role', roles: block.roles, blocks: blocksJson(block.blocks) });
    // The capture pair is one figure, where its first image line sits; its
    // files are in the lesson's "images".
    else if (block.type === 'image' && out[out.length - 1]?.type !== 'figure') out.push({ type: 'figure' });
  }
  return out;
}

function itemJson(item) {
  const json = {
    id: item.id,
    file: item.file,
    title: item.title,
    goal: item.goal,
    roles: item.roles,
    order: item.order,
    blocks: blocksJson(item.blocks),
    words: item.words,
  };
  if (item.kind === 'section') return json;
  return {
    ...json,
    section: item.section,
    question: item.question,
    capability: item.capability,
    screens: item.screens,
    shots: item.shots,
    faq: item.faq,
    answers: item.answers,
    see: item.see,
    review: item.review,
    images: item.images,
  };
}

/**
 * The JSON /ajuda reads: sections, published lessons and FAQ entries (front
 * matter plus the block AST, never HTML), each profile's order, and the ids
 * held back from publication. Throws GuideError when the source has errors.
 */
export function guideData(guide) {
  if (guide.errors.length > 0) throw new GuideError(guide.errors);
  return {
    $comment:
      'Generated from docs/guide/content by docs/guide/build/gen-guide-data.mjs. Do not edit by hand: change the lesson files and run node docs/guide/build/gen-guide-data.mjs.',
    format: 1,
    profiles: [...PROFILES],
    sections: guide.sections.map(itemJson),
    lessons: guide.lessons.filter((l) => !l.hold).map(itemJson),
    faq: guide.faq.filter((f) => !f.hold).map(itemJson),
    held: [...guide.lessons, ...guide.faq].filter((l) => l.hold).map((l) => ({ id: l.id, hold: l.hold })),
    orders: Object.fromEntries(
      PROFILES.map((profile) => [
        profile,
        {
          sections: sectionsFor(guide, profile).map((entry) => entry.section.id),
          lessons: lessonsFor(guide, profile).map((l) => l.id),
          faq: faqFor(guide, profile).map((f) => f.id),
        },
      ]),
    ),
  };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

/** Deterministic text: sorted keys, two-space indent, one trailing newline. */
export function serializeGuideData(data) {
  return `${JSON.stringify(sortKeys(data), null, 2)}\n`;
}

/** The exact bytes of apps/web/lib/guide/guide-data.json for this source. */
export function renderGuideData(options = {}) {
  return serializeGuideData(guideData(loadGuide(options)));
}
