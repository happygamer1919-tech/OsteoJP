/**
 * THE PLATFORM GUIDE'S CHAPTERS, CHECKED BEFORE THEY ARE PRINTED.
 *
 * docs/guide/content/*.md are the chapters of the staff guide, one per role
 * (Receção, Terapeuta, Proprietário), printed to A4 by
 * docs/guide/build/build-guide.mjs. The owner ruled two things this file
 * turns into assertions:
 *
 *   NO DASHES. No em dash (U+2014), no en dash (U+2013), and no hyphen used as
 *   punctuation between words or as a list marker. A hyphen inside a word
 *   Portuguese spells with one (palavra-passe, e-mail) is fine. The dash list
 *   also holds the characters that print like a hyphen but are not the ASCII
 *   one (U+2010, U+2011, the minus sign U+2212 and three look-alikes), because
 *   the hyphen checks read only "-" and would let those through.
 *
 *   EVERY SCREEN OF docs/guide/outline.md IS SHOWN. Every screen entry of the
 *   outline links its two captures, and each capture the outline links appears
 *   in a chapter, the phone (-390) and the desktop image of one screen on
 *   consecutive image lines, which the build prints side by side.
 *
 * And the chapters use only the Markdown the build converts: "#", "##", "###"
 * headings, paragraphs, "* " and "1. " lists, **bold**, and image lines. Any
 * other syntax would print as literal characters.
 *
 * THE LESSON TREE (Suporte e Guia, G1). The guide is moving from the three
 * chapters to short lessons, and this file reads both layouts, so the lessons
 * do not need the owner's hand again each time one is added. The tree is:
 *
 *   docs/guide/content/NN-<section>/_seccao.md       the section
 *   docs/guide/content/NN-<section>/NN-<slug>.md     a lesson
 *   docs/guide/content/00-perguntas/NN-<slug>.md     an FAQ entry
 *
 * Every file of it opens with a flat front matter block: a line of three
 * hyphens, one "key: value" per line, a line of three hyphens. The two fence
 * lines are the only place a guide file may hold "---", and they are exempt
 * from the dash rules below; nothing else is. The checks, each one a test:
 *
 *   the keys are a closed set (FRONT_MATTER_KEYS); id, title and roles are
 *   required, and goal (question in an FAQ entry); roles names only rececao,
 *   terapeuta and proprietario; no value holds a dash character or a hyphen
 *   used as punctuation;
 *
 *   the body carries the chapters' rules: no dash character, no hyphen used as
 *   punctuation, the Markdown subset, and a first line "## <title>";
 *
 *   a role block opens with a line "::: <role> [<role> ...]" naming roles of
 *   that file, closes with a line ":::", and does not nest;
 *
 *   a lesson image exists under apps/web/public/ajuda (a chapter image keeps
 *   the docs/guide/screens rule), and its phone and desktop captures sit on
 *   consecutive image lines, as a chapter's do.
 *
 * THE CHAPTER COUNT RULE is: at least three chapter files, OR a lesson tree in
 * which rececao, terapeuta and proprietario each have at least one published
 * lesson (a lesson with "hold" is not published). So a later pull request may
 * retire the chapters. With no chapter file, the tests that read only
 * chapters have nothing to read; each says so as a VACUOUS diagnostic, and
 * the count rule is what stops that from passing on an empty guide.
 *
 * NOTHING IS SKIPPED. A missing content directory FAILS every test here, and
 * so does a content directory with neither a chapter file nor a lesson file:
 * a guide with nothing in it is not a clean guide.
 *
 * GUIDE_DIR (a directory holding outline.md, content/ and screens/) points the
 * test at another tree. It exists to prove the test red on a seeded fixture.
 * The lesson captures are then looked for in GUIDE_DIR/../../apps/web/public/ajuda,
 * which is where a lesson's "../../../../apps/web/public/ajuda/..." path lands.
 *
 * Run: pnpm test:scripts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = process.env.GUIDE_DIR ? resolve(process.env.GUIDE_DIR) : join(REPO, 'docs', 'guide');
const CONTENT = join(GUIDE, 'content');
const SCREENS = join(GUIDE, 'screens');
const OUTLINE = join(GUIDE, 'outline.md');
const BUILDER = join(REPO, 'docs', 'guide', 'build', 'build-guide.mjs');
// Where a lesson's captures live. Derived from GUIDE rather than REPO so that a
// GUIDE_DIR fixture laid out as <root>/docs/guide carries its own captures.
const AJUDA = resolve(GUIDE, '..', '..', 'apps', 'web', 'public', 'ajuda');

// Keep this list the same as DASH_CHARS in docs/guide/build/build-guide.mjs.
const DASHES = [
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
// A hyphen that starts or ends a word: "outro- solto", "outro -solto", or one
// at either end of the line. Inside a word (palavra-passe) it never matches.
const HYPHEN_PUNCTUATION = /(^|\s)-|-(\s|$)/;

/** The dash characters on one line, as "col: label". */
function dashesIn(line) {
  const found = [];
  for (const [ch, label] of DASHES) {
    const col = line.indexOf(ch);
    if (col !== -1) found.push(`${col + 1}: ${label}`);
  }
  return found;
}

/** What is wrong with one line's hyphens; empty when nothing is. */
function hyphenProblems(line) {
  const found = [];
  // The list-marker check runs first: "- item" would match the punctuation
  // pattern too, and the list-marker message is the one that says what to do.
  if (/^\s*-(\s|$)/.test(line)) found.push('hyphen list marker; use "* "');
  else if (HYPHEN_PUNCTUATION.test(line)) found.push('hyphen between words');
  if (line.includes('--')) found.push('double hyphen');
  return found;
}
const IMAGE = /!\[[^\]]*\]\(([^)]*)\)/g;
const IMAGE_LINE = /^!\[[^\]]*\]\(([^)\s]+)\)$/;

const shown = (p) => (p.startsWith(REPO + sep) ? relative(REPO, p) : p);
const posix = (p) => p.split(sep).join('/');

/**
 * The chapter files: the *.md FILES at the top of the content directory. The
 * lesson tree's folders sit beside them and are never read here. May be empty
 * (the chapters can be retired), but only when the lesson tree holds a file:
 * zero of both would pass every per-line check below for the wrong reason.
 */
function loadChapters() {
  assert.ok(
    existsSync(CONTENT) && statSync(CONTENT).isDirectory(),
    `${shown(CONTENT)} does not exist, so the guide has no chapters. This test fails rather than skips.`,
  );
  const chapters = readdirSync(CONTENT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ name, lines: readFileSync(join(CONTENT, name), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/) }));
  assert.ok(
    chapters.length > 0 || lessonTree().files.length > 0,
    `${shown(CONTENT)} has no *.md chapter file and no lesson tree. This test fails rather than passes on nothing.`,
  );
  return chapters;
}

/** A chapter test with no chapter to read says so, rather than passing quietly. */
function vacuousWithoutChapters(t, chapters) {
  if (chapters.length > 0) return false;
  t.diagnostic(
    `VACUOUS: ${shown(CONTENT)} holds no chapter file, so this chapter rule has nothing to read. ` +
      'The lesson tree carries the guide; the chapter count test holds it to a lesson for every role.',
  );
  return true;
}

/**
 * The phone (-390) and desktop images of each screen must sit on consecutive
 * image lines (blank lines between them are fine). Any other non-blank line
 * ends a run, a role block marker included. Returns [{ n, problem }].
 */
function imagePairProblems(lines, start = 0) {
  const kind = (src) => (/-390\.png$/.test(src) ? 'phone' : /-desktop\.png$/.test(src) ? 'desktop' : 'other');
  const screen = (src) => src.replace(/-(390|desktop)\.png$/, '');
  const problems = [];
  let run = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += 2) {
      const [a, b] = [run[i], run[i + 1]];
      if (!b) {
        problems.push({ n: a.n, problem: `${a.src} stands alone; put the phone and desktop images of a screen on consecutive lines` });
      } else if ([kind(a.src), kind(b.src)].sort().join('+') !== 'desktop+phone' || screen(a.src) !== screen(b.src)) {
        problems.push({ n: a.n, problem: `${a.src} and ${b.src} are not the phone and desktop images of one screen` });
      }
    }
    run = [];
  };
  for (let i = start; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    const m = IMAGE_LINE.exec(trimmed);
    if (m) run.push({ src: m[1], n: i + 1 });
    else flush();
  }
  flush();
  return problems;
}

// The Markdown the build prints: "#", "##", "###" headings, paragraphs, "* "
// and "1. " lists, **bold** and image lines. Anything else prints as literal
// characters. One list for the chapters and the lesson bodies.
const SUBSET_RULES = [
  [/^\s*(```|~~~)/, 'fenced code'],
  [/\|/, 'a table row ("|")'],
  [/<[A-Za-z!/?]/, 'an HTML tag'],
  [/^\s*>/, 'a block quote (">")'],
  [/^\s*#{4,}/, 'a heading deeper than "###"'],
  [/^\s*#+[^#\s]/, 'a heading without a space after "#"'],
  [/^\s*([-*_=])(\s*\1){2,}\s*$/, 'a horizontal rule or an underlined heading'],
  [/^\s*\+\s/, 'a "+" list marker'],
  [/^\s+(\*|\+|\d+\.)\s/, 'a nested list'],
  [/^(\t| {4,})\S/, 'an indented code block'],
  [/(^|[^!])\[[^\]]*\]\(/, 'a link (only image lines are printed)'],
  [/__/, '"__" emphasis (use **bold**)'],
];

/** What one line breaks of the Markdown subset; empty when nothing. */
function subsetProblems(line) {
  const found = [];
  for (const [re, what] of SUBSET_RULES) if (re.test(line)) found.push(what);
  if (line.includes('![') && !IMAGE_LINE.test(line.trim())) found.push('an image not alone on its line as ![alt](path)');
  const leftover = line.replace(/^\s*\*\s+/, '').replace(/\*\*[^*]+\*\*/g, '');
  if (leftover.includes('*')) found.push('a "*" that is neither **bold** nor a "* " list item');
  return found;
}

// ==========================================================================
// THE LESSON TREE
// ==========================================================================

/** The three guide profiles a lesson names. Admin is derived in apps/web, never named here. */
const ROLES = ['rececao', 'terapeuta', 'proprietario'];
/** The closed front matter key set. Any other key is an offence. */
const FRONT_MATTER_KEYS = [
  ...['id', 'title', 'goal', 'roles', 'order', 'capability', 'screens'],
  ...['shots', 'faq', 'question', 'answers', 'see', 'review', 'hold'],
];
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const TREE_FOLDER = new RegExp(`^\\d\\d-${SLUG}$`);
const TREE_FILE = new RegExp(`^\\d\\d-${SLUG}\\.md$`);
const SECTION_FILE = '_seccao.md';
const FAQ_FOLDER = '00-perguntas';
const FENCE = '---';
const FRONT_MATTER_LINE = /^([a-z]+): (\S.*)$/;
const ROLE_OPEN = /^::: ([a-z]+(?: [a-z]+)*)$/;
const ROLE_CLOSE = ':::';

/**
 * Reads and checks the lesson tree under contentDir, with captures under
 * ajudaDir. Never throws on bad content: every problem is an offence string
 * "<folder>/<file>:<line>: <what>", filed under the test that reports it.
 * Returns { files, published, offences }, where published counts each role's
 * lessons without "hold".
 */
function readLessonTree(contentDir, ajudaDir) {
  const offences = { layout: [], frontMatter: [], dashes: [], roleBlocks: [], markdown: [], images: [] };
  const files = [];
  const published = Object.fromEntries(ROLES.map((role) => [role, 0]));
  if (!existsSync(contentDir) || !statSync(contentDir).isDirectory()) return { files, published, offences };

  const folders = readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    if (!TREE_FOLDER.test(folder)) {
      offences.layout.push(`${folder}/: a folder of the lesson tree is named NN-<section>, such as 02-agenda`);
      continue;
    }
    const isFaq = folder === FAQ_FOLDER;
    const entries = readdirSync(join(contentDir, folder), { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    if (!isFaq && !entries.some((entry) => entry.isFile() && entry.name === SECTION_FILE)) {
      offences.layout.push(`${folder}/: no ${SECTION_FILE} describing the section`);
    }
    for (const entry of entries) {
      const rel = `${folder}/${entry.name}`;
      let kind = null;
      if (entry.isFile() && entry.name === SECTION_FILE && !isFaq) kind = 'section';
      else if (entry.isFile() && TREE_FILE.test(entry.name)) kind = isFaq ? 'faq' : 'lesson';
      if (!kind) {
        offences.layout.push(`${rel}: a file of the lesson tree is NN-<slug>.md${isFaq ? '' : ` or ${SECTION_FILE}`}, and nothing else sits in its folder`);
        continue;
      }
      const file = checkTreeFile(join(contentDir, folder, entry.name), rel, kind, ajudaDir, offences);
      files.push(file);
      if (kind === 'lesson' && !file.held) for (const role of file.roles) published[role] += 1;
    }
  }
  return { files, published, offences };
}

/** Checks one file of the lesson tree into offences; returns { rel, kind, roles, held }. */
function checkTreeFile(abs, rel, kind, ajudaDir, offences) {
  const lines = readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const at = (list, n, what) => offences[list].push(`${rel}:${n}: ${what}`);

  // The front matter.
  const fields = {};
  let bodyStart = 0;
  let readable = false;
  if (lines[0] !== FENCE) {
    at('frontMatter', 1, 'a guide file starts with its front matter, opened by a line of three hyphens');
  } else {
    const end = lines.indexOf(FENCE, 1);
    if (end === -1) {
      at('frontMatter', 1, 'the front matter is never closed by a line of three hyphens');
      bodyStart = 1;
    } else {
      readable = true;
      bodyStart = end + 1;
      for (let i = 1; i < end; i += 1) {
        const n = i + 1;
        const m = FRONT_MATTER_LINE.exec(lines[i]);
        if (!m) {
          at('frontMatter', n, `a front matter line is "key: value" with a value, not ${JSON.stringify(lines[i])}`);
          continue;
        }
        const key = m[1];
        const value = m[2].replace(/\s+$/, '');
        for (const [ch, label] of DASHES) {
          if (value.includes(ch)) at('frontMatter', n, `the value of "${key}" contains a dash character, ${label}`);
        }
        if (HYPHEN_PUNCTUATION.test(value) || value.includes('--')) {
          at('frontMatter', n, `the value of "${key}" uses a hyphen as punctuation; a hyphen belongs only inside a word`);
        }
        if (!FRONT_MATTER_KEYS.includes(key)) {
          at('frontMatter', n, `unknown front matter key "${key}"; the keys are: ${FRONT_MATTER_KEYS.join(' ')}`);
        } else if (key in fields) {
          at('frontMatter', n, `front matter key "${key}" is given twice`);
        } else {
          fields[key] = { value, n };
        }
      }
    }
  }
  if (readable) {
    const required = kind === 'faq' ? ['id', 'title', 'roles', 'question'] : ['id', 'title', 'roles', 'goal'];
    for (const key of required) if (!fields[key]) at('frontMatter', 1, `missing front matter key "${key}"`);
  }
  const roles = [];
  if (fields.roles) {
    for (const role of fields.roles.value.split(',').map((item) => item.trim())) {
      if (!ROLES.includes(role)) at('frontMatter', fields.roles.n, `unknown role ${JSON.stringify(role)} in roles; the roles are ${ROLES.join(', ')}`);
      else if (roles.includes(role)) at('frontMatter', fields.roles.n, `role "${role}" is listed twice`);
      else roles.push(role);
    }
  }

  // The body.
  let open = null;
  let titleSeen = false;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    const trimmed = line.trim();

    if (trimmed !== '' && !titleSeen) {
      titleSeen = true;
      const want = fields.title ? `## ${fields.title.value}` : null;
      if (want ? trimmed !== want : !/^##\s+\S/.test(trimmed)) {
        at('markdown', n, `the body starts with its "## " title line${want ? `, ${JSON.stringify(want)}` : ''}`);
      }
    }

    if (trimmed.startsWith(':::')) {
      if (line === ROLE_CLOSE) {
        if (!open) at('roleBlocks', n, 'this ":::" closes a role block that was never opened');
        else if (!open.content) at('roleBlocks', open.n, 'an empty role block');
        open = null;
        continue;
      }
      const m = ROLE_OPEN.exec(line);
      if (!m) {
        at('roleBlocks', n, 'a role block line is ":::" alone, or "::: " and role names separated by one space');
        continue;
      }
      if (open) at('roleBlocks', n, `role blocks do not nest; close the block opened on line ${open.n} with ":::" first`);
      const named = m[1].split(' ');
      for (const role of named) {
        if (!ROLES.includes(role)) at('roleBlocks', n, `unknown role "${role}" in a role block; the roles are ${ROLES.join(', ')}`);
        else if (!roles.includes(role)) at('roleBlocks', n, `the role block names "${role}", which is not in this file's roles, so no viewer would see it`);
      }
      if (new Set(named).size !== named.length) at('roleBlocks', n, 'the role block names a role twice');
      open = { n, content: false };
      continue;
    }
    if (open && trimmed !== '') open.content = true;

    for (const found of dashesIn(line)) at('dashes', n, `column ${found}`);
    for (const problem of hyphenProblems(line)) at('dashes', n, `${problem}: ${trimmed}`);
    for (const what of subsetProblems(line)) at('markdown', n, what);

    for (const m of line.matchAll(IMAGE)) {
      const src = m[1];
      const file = resolve(dirname(abs), src);
      const underAjuda = posix(relative(ajudaDir, file));
      const inside = underAjuda !== '' && underAjuda !== '..' && !underAjuda.startsWith('../') && !isAbsolute(underAjuda);
      if (!inside) at('images', n, `${src} points outside ${shown(ajudaDir)}`);
      else if (!existsSync(file) || !statSync(file).isFile()) at('images', n, `${src} does not exist`);
    }
  }
  if (open) at('roleBlocks', open.n, 'this role block is never closed with ":::"');
  if (!titleSeen) at('markdown', lines.length, 'the body is empty; it starts with its "## " title line');
  for (const { n, problem } of imagePairProblems(lines, bodyStart)) at('images', n, problem);

  return { rel, kind, roles, held: Boolean(fields.hold) };
}

let TREE = null;
/** The repository's lesson tree (or GUIDE_DIR's), read once. */
function lessonTree() {
  TREE ??= readLessonTree(CONTENT, AJUDA);
  return TREE;
}

/** Does the lesson tree give each role at least one published lesson? */
function lessonsCarryEveryRole(tree) {
  return ROLES.every((role) => tree.published[role] > 0);
}

/** The lesson tree for a lesson test, with a VACUOUS diagnostic when there is none. */
function loadLessonTree(t) {
  loadChapters();
  const tree = lessonTree();
  if (tree.files.length === 0 && tree.offences.layout.length === 0) {
    t.diagnostic(`VACUOUS: ${shown(CONTENT)} holds no lesson tree, so this lesson rule has nothing to read. The chapters carry the guide.`);
  }
  return tree;
}

/** Every image a chapter names, with where it points under screens/. */
function imagesOf(chapters) {
  const found = [];
  for (const { name, lines } of chapters) {
    lines.forEach((line, i) => {
      for (const m of line.matchAll(IMAGE)) {
        const src = m[1];
        const file = resolve(CONTENT, src);
        const underScreens = posix(relative(SCREENS, file));
        const inside =
          underScreens !== '' && underScreens !== '..' && !underScreens.startsWith('../') && !isAbsolute(underScreens);
        found.push({ at: `${name}:${i + 1}`, src, file, key: inside ? underScreens : null });
      }
    });
  }
  return found;
}

function report(offences, headline) {
  assert.deepEqual(offences, [], `${headline}\n  ${offences.join('\n  ')}`);
}

// One screen of the outline: "* **Name** (`/route`): what it is. Capturas: ...".
const OUTLINE_ENTRY = /^\* \*\*([^*]+)\*\* \(`\//;
const CAPTURE_LINK = /\]\((screens\/[^)\s]+\.png)\)/g;

/**
 * The outline's screen entries that do not link exactly one phone (-390) and
 * one desktop capture of the same screen. The test below that holds the
 * chapters to the outline reads only the captures the outline LINKS, so an
 * entry that links none ("Capturas: por tirar.") passed it; this is the check
 * that reads the entries themselves (outline.md: "Cada ecrã tem duas
 * capturas").
 */
function outlineEntriesWithoutCaptures(text) {
  const entries = [];
  const offences = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const entry = OUTLINE_ENTRY.exec(line);
    if (!entry) return;
    entries.push(entry[1]);
    const links = [...line.matchAll(CAPTURE_LINK)].map((m) => m[1]);
    const phones = links.filter((l) => l.endsWith('-390.png'));
    const desktops = links.filter((l) => l.endsWith('-desktop.png'));
    const paired =
      links.length === 2 &&
      phones.length === 1 &&
      desktops.length === 1 &&
      phones[0].replace(/-390\.png$/, '') === desktops[0].replace(/-desktop\.png$/, '');
    if (!paired) offences.push(`outline.md:${i + 1}: ${entry[1]} links ${links.length ? links.join(', ') : 'no capture'}`);
  });
  return { entries, offences };
}

test('the content directory holds at least three chapter files, or a lesson tree with a lesson for every role', (t) => {
  if (process.env.GUIDE_DIR) t.diagnostic(`GUIDE_DIR is set: checking ${GUIDE}`);
  const chapters = loadChapters();
  const tree = lessonTree();
  const perRole = ROLES.map((role) => `${role} ${tree.published[role]}`).join(', ');
  // The profile, printed on every run, so a pass says what it passed on.
  t.diagnostic(
    `chapters: ${chapters.length}; lesson tree: ${tree.files.length} files, ` +
      `${tree.files.filter((f) => f.kind === 'lesson').length} lessons; published lessons per role: ${perRole}`,
  );
  assert.ok(
    chapters.length >= 3 || lessonsCarryEveryRole(tree),
    `expected a chapter per role (Receção, Terapeuta, Proprietário) in ${shown(CONTENT)}, ` +
      `found ${chapters.length}: ${chapters.map((c) => c.name).join(', ') || '(none)'}; ` +
      `or a lesson tree with a published lesson for each of ${ROLES.join(', ')}, found ${perRole}`,
  );
});

test('no chapter contains an em dash, an en dash or any other dash character', (t) => {
  const chapters = loadChapters();
  vacuousWithoutChapters(t, chapters);
  const offences = [];
  for (const { name, lines } of chapters) {
    lines.forEach((line, i) => {
      for (const found of dashesIn(line)) offences.push(`${name}:${i + 1}:${found}`);
    });
  }
  report(offences, 'The guide carries no dashes. Use a comma, a full stop, a colon or parentheses:');
});

test('no chapter uses a hyphen as a list marker or as punctuation between words', (t) => {
  const chapters = loadChapters();
  vacuousWithoutChapters(t, chapters);
  const offences = [];
  for (const { name, lines } of chapters) {
    lines.forEach((line, i) => {
      for (const problem of hyphenProblems(line)) offences.push(`${name}:${i + 1}: ${problem}: ${line.trim()}`);
    });
  }
  report(offences, 'A hyphen belongs only inside a compound word (palavra-passe, e-mail):');
});

// THE TWO CHECKS ABOVE, PROVED BOTH WAYS on lines seeded here. A red arm alone
// only shows a rule is not too loose; the null arm (a compound word must pass)
// is what catches a rule tightened so far it refuses palavra-passe.
test('the dash and hyphen checks refuse a seeded offence and pass a compound word', () => {
  const red = [
    ['Um outro- solto aqui.', 'hyphen between words'],
    ['Um outro -solto aqui.', 'hyphen between words'],
    ['Um outro - solto aqui.', 'hyphen between words'],
    ['Termina num hífen-', 'hyphen between words'],
    ['- um item', 'hyphen list marker; use "* "'],
    ['Dois hífenes -- aqui.', 'double hyphen'],
  ];
  for (const [line, want] of red) {
    assert.ok(hyphenProblems(line).includes(want), `the hyphen check let ${JSON.stringify(line)} through (wanted "${want}")`);
  }
  const redChars = [
    ['Um hífen‑assim.', 'non-breaking hyphen (U+2011)'],
    ['Um hífen‐assim.', 'hyphen (U+2010)'],
    ['Menos −3 aqui.', 'minus sign (U+2212)'],
    ['Um travessão — aqui.', 'em dash (U+2014)'],
    ['Um traço – aqui.', 'en dash (U+2013)'],
    ['Largo－traço.', 'fullwidth hyphen-minus (U+FF0D)'],
  ];
  for (const [line, want] of redChars) {
    assert.ok(dashesIn(line).some((f) => f.endsWith(want)), `the dash check let ${JSON.stringify(line)} through (wanted "${want}")`);
  }
  const clean = [
    'A palavra-passe e o e-mail ficam na ficha.',
    'Carregue em **Guardar**: aparece **Notas guardadas**.',
    'O número (+351...) fica guardado.',
  ];
  for (const line of clean) {
    assert.deepEqual(hyphenProblems(line), [], `the hyphen check refused a clean line: ${JSON.stringify(line)}`);
    assert.deepEqual(dashesIn(line), [], `the dash check refused a clean line: ${JSON.stringify(line)}`);
  }
});

// The builder carries its own copy of these rules, and it is the one that
// decides whether a PDF is printed. It lints before it loads Chromium, so both
// arms run without a browser: the red one stops at the lint, the clean one
// passes the lint and stops at the role check (one chapter, two roles missing).
test('the builder refuses a chapter with a hyphen or a dash character, and accepts a compound word', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guide-lint-'));
  const run = () =>
    spawnSync(process.execPath, [BUILDER, '--content', dir, '--out', dir], { encoding: 'utf8', timeout: 60_000 });
  try {
    writeFileSync(
      join(dir, '01-rececao.md'),
      ['# Receção', '', 'Um outro- solto aqui.', 'Um outro -solto aqui.', 'Um hífen‑assim.', 'Menos −3 aqui.', ''].join('\n'),
    );
    const red = run();
    assert.equal(red.status, 1, `the builder exited ${red.status} on a seeded offence, wanted 1\n${red.stderr}`);
    for (const want of [
      '01-rececao.md:3: hyphen used as punctuation between words',
      '01-rececao.md:4: hyphen used as punctuation between words',
      '01-rececao.md:5: contains a dash character, non-breaking hyphen (U+2011)',
      '01-rececao.md:6: contains a dash character, minus sign (U+2212)',
    ]) {
      assert.ok(red.stderr.includes(want), `the builder did not report "${want}":\n${red.stderr}`);
    }

    writeFileSync(join(dir, '01-rececao.md'), ['# Receção', '', 'A palavra-passe e o e-mail ficam na ficha.', ''].join('\n'));
    const clean = run();
    assert.ok(!clean.stderr.includes('not ready to print'), `the builder's lint refused a clean chapter:\n${clean.stderr}`);
    assert.ok(
      clean.stderr.includes('Cannot split the guide by role'),
      `the clean fixture should pass the lint and stop at the role check:\n${clean.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every image path resolves to an existing file under docs/guide/screens', (t) => {
  const chapters = loadChapters();
  if (vacuousWithoutChapters(t, chapters)) return;
  const images = imagesOf(chapters);
  assert.ok(images.length > 0, 'the chapters name no image at all, so there is nothing to check');
  const offences = [];
  for (const image of images) {
    if (!image.key) offences.push(`${image.at}: ${image.src} points outside ${shown(SCREENS)}`);
    else if (!existsSync(image.file) || !statSync(image.file).isFile()) offences.push(`${image.at}: ${image.src} does not exist`);
  }
  report(offences, 'Every image must be a capture in docs/guide/screens, named relative to docs/guide/content:');
});

test('every screen in docs/guide/outline.md appears as both its -390 and its -desktop image', (t) => {
  const chapters = loadChapters();
  const outline = readFileSync(OUTLINE, 'utf8');
  const wanted = [...outline.matchAll(/\]\((screens\/[^)\s]+\.png)\)/g)].map((m) => m[1].slice('screens/'.length));
  // A parse that found nothing would pass this test for the wrong reason.
  assert.ok(wanted.length > 0, `found no capture links in ${shown(OUTLINE)}`);
  const phones = wanted.filter((k) => k.endsWith('-390.png'));
  const desktops = wanted.filter((k) => k.endsWith('-desktop.png'));
  assert.equal(phones.length + desktops.length, wanted.length, 'the outline links a capture that is neither -390 nor -desktop');
  for (const phone of phones) {
    assert.ok(desktops.includes(phone.replace(/-390\.png$/, '-desktop.png')), `the outline links ${phone} without its desktop twin`);
  }

  // The outline's own shape above still binds without chapters; only "shown in
  // a chapter" needs a chapter to read.
  if (vacuousWithoutChapters(t, chapters)) return;
  const shownInChapters = new Set(imagesOf(chapters).map((image) => image.key).filter(Boolean));
  const missing = [...new Set(wanted)].filter((key) => !shownInChapters.has(key));
  report(missing, `${missing.length} of the outline's ${new Set(wanted).size} captures appear in no chapter:`);
});

test('every screen entry in docs/guide/outline.md links its -390 and its -desktop capture', () => {
  const { entries, offences } = outlineEntriesWithoutCaptures(readFileSync(OUTLINE, 'utf8'));
  // A parse that found no entry would pass this test for the wrong reason.
  assert.ok(entries.length > 0, `found no screen entry ("* **Name** (\`/route\`)") in ${shown(OUTLINE)}`);
  report(offences, 'Every screen in the outline has two captures, phone and desktop, linked on its own line:');
});

// THE CHECK ABOVE, PROVED BOTH WAYS on seeded outline lines. The red arms are
// the shapes that slipped through before (no link at all) and the near misses;
// the null arm is a complete entry, plus a line that is not an entry, which
// must be ignored rather than refused.
test('the outline entry check refuses an entry without both captures and passes a complete one', () => {
  const entry = (captures) => `* **Respostas** (\`/reminders/review\`): o ecrã. Capturas: ${captures}.`;
  const phone = '[telemóvel](screens/rececao/respostas-sms-390.png)';
  const desktop = '[computador](screens/rececao/respostas-sms-desktop.png)';
  const red = [
    entry('por tirar'),
    entry(phone),
    entry(desktop),
    entry(`${phone}, [computador](screens/rececao/outra-desktop.png)`),
    entry(`${phone}, ${phone}`),
    entry(`${phone}, ${desktop}, ${desktop}`),
  ];
  for (const line of red) {
    const { entries, offences } = outlineEntriesWithoutCaptures(line);
    assert.equal(entries.length, 1, `the seeded line was not read as an entry: ${line}`);
    assert.equal(offences.length, 1, `the outline entry check let ${JSON.stringify(line)} through`);
  }
  const clean = [entry(`${phone}, ${desktop}`), '* Cada ecrã tem duas capturas: telemóvel e computador.', 'Menu: Início, Agenda.'].join('\n');
  const { entries, offences } = outlineEntriesWithoutCaptures(clean);
  assert.deepEqual(entries, ['Respostas'], 'only the "* **Name** (`/route`)" line is a screen entry');
  assert.deepEqual(offences, [], `the outline entry check refused a complete entry:\n  ${offences.join('\n  ')}`);
});

test("each screen's phone and desktop images sit on consecutive image lines", (t) => {
  const chapters = loadChapters();
  vacuousWithoutChapters(t, chapters);
  const offences = [];
  for (const { name, lines } of chapters) {
    for (const { n, problem } of imagePairProblems(lines)) offences.push(`${name}:${n}: ${problem}`);
  }
  report(offences, 'The build prints a screen as one row, phone beside desktop, only when the two lines are consecutive:');
});

test('every chapter starts with its "# " title line', (t) => {
  const chapters = loadChapters();
  vacuousWithoutChapters(t, chapters);
  const offences = [];
  for (const { name, lines } of chapters) {
    const first = lines.find((line) => line.trim() !== '');
    if (!first || !/^#\s+\S/.test(first)) offences.push(`${name}: first line is ${JSON.stringify(first ?? '')}`);
  }
  report(offences, 'The build takes each chapter title from its first line, which must be "# <title>":');
});

test('the chapters use only the Markdown subset the build prints', (t) => {
  const chapters = loadChapters();
  vacuousWithoutChapters(t, chapters);
  const offences = [];
  for (const { name, lines } of chapters) {
    lines.forEach((line, i) => {
      for (const what of subsetProblems(line)) offences.push(`${name}:${i + 1}: ${what}`);
    });
  }
  report(offences, 'Only "#", "##", "###", paragraphs, "* " and "1. " lists, **bold** and image lines are printed:');
});

// ==========================================================================
// THE LESSON TREE: one test per rule, so a red names the rule it broke.
// ==========================================================================

test('the lesson tree holds only NN-<section>/ folders of NN-<slug>.md files, each section with its _seccao.md', (t) => {
  const tree = loadLessonTree(t);
  report(tree.offences.layout, 'The lesson tree is docs/guide/content/NN-<section>/ with _seccao.md and NN-<slug>.md, and 00-perguntas/:');
});

test('every lesson file opens with front matter of known keys, the required ones, and no dash in a value', (t) => {
  const tree = loadLessonTree(t);
  report(
    tree.offences.frontMatter,
    `Front matter is "---", then "key: value" lines from: ${FRONT_MATTER_KEYS.join(' ')}, then "---". ` +
      'id, title, roles and goal (question in an FAQ entry) are required, and no value holds a dash:',
  );
});

test('no lesson file contains a dash character or a hyphen used as punctuation', (t) => {
  const tree = loadLessonTree(t);
  report(tree.offences.dashes, 'The guide carries no dashes. A hyphen belongs only inside a compound word (palavra-passe, e-mail):');
});

test('every role block in a lesson file names roles of that file, closes, and does not nest', (t) => {
  const tree = loadLessonTree(t);
  report(tree.offences.roleBlocks, 'A role block opens with "::: <role> [<role> ...]" and closes with ":::":');
});

test('every lesson body starts with its "## " title and uses only the Markdown subset the build prints', (t) => {
  const tree = loadLessonTree(t);
  report(tree.offences.markdown, 'A lesson body is "## <title>", then "###" headings, paragraphs, lists, **bold** and image lines:');
});

test('every lesson image exists under apps/web/public/ajuda, phone and desktop on consecutive lines', (t) => {
  const tree = loadLessonTree(t);
  report(tree.offences.images, `A lesson capture is a file under ${shown(AJUDA)}, named relative to the lesson file:`);
});

// THE LESSON CHECKS ABOVE, PROVED BOTH WAYS on a tree seeded here. Each red arm
// changes ONE thing in a clean tree and must be refused with its own message;
// the null arm is the clean tree itself (a lesson with a role block and a
// capture pair, an FAQ entry with "question" and no "goal", palavra-passe in
// a body), which must pass every check and count a lesson for every role. A
// red arm alone only shows a rule is not too loose; the null arm is what
// catches a rule tightened so far it refuses real content.
const SEED_SECTION = 'content/01-inicio/_seccao.md';
const SEED_LESSON = 'content/01-inicio/01-primeiro-passo.md';
const SEED_FAQ = 'content/00-perguntas/01-marcar-consulta.md';
const SEED_PHONE = 'ajuda/inicio/primeiro-passo-390.png';
const SEED_TREE = {
  [SEED_SECTION]: [
    '---',
    'id: inicio',
    'title: Início',
    'goal: Orientar-se no primeiro dia.',
    'roles: rececao, terapeuta, proprietario',
    'order: rececao 1, terapeuta 1, proprietario 1',
    '---',
    '## Início',
    '',
    'O resumo do dia e o menu.',
    '',
  ].join('\n'),
  [SEED_LESSON]: [
    '---',
    'id: inicio.primeiro-passo',
    'title: O primeiro passo',
    'goal: Abrir o Início e ler o resumo do dia.',
    'roles: rececao, terapeuta, proprietario',
    'order: rececao 1, terapeuta 1, proprietario 1',
    'capability: appointments:read',
    'shots: inicio.primeiro-passo',
    '---',
    '## O primeiro passo',
    '',
    'A palavra-passe e o e-mail de Marta Exemplo ficam na ficha.',
    '',
    '::: terapeuta proprietario',
    'Só o terapeuta e o Proprietário leem este parágrafo.',
    ':::',
    '',
    '![Início no telemóvel](../../ajuda/inicio/primeiro-passo-390.png)',
    '![Início no computador](../../ajuda/inicio/primeiro-passo-desktop.png)',
    '',
  ].join('\n'),
  [SEED_FAQ]: [
    '---',
    'id: perguntas.marcar-consulta',
    'title: Como marco uma consulta?',
    'question: Como marco uma consulta para um paciente que já tem ficha?',
    'roles: rececao, terapeuta, proprietario',
    'order: rececao 1, terapeuta 1, proprietario 1',
    'answers: inicio.primeiro-passo',
    '---',
    '## Como marco uma consulta?',
    '',
    'Clique em **Nova marcação** e escolha o paciente.',
    '',
  ].join('\n'),
  [SEED_PHONE]: 'phone capture',
  'ajuda/inicio/primeiro-passo-desktop.png': 'desktop capture',
};

/** One text edit that must apply: an arm whose edit matched nothing would test the clean tree. */
function swap(text, from, to) {
  assert.ok(text.includes(from), `the seeded arm edits ${JSON.stringify(from)}, which the seeded file does not hold`);
  return text.replace(from, to);
}

/** Writes the seeded tree with edit applied (a null value removes a file), reads it, removes it. */
function seededTree(edit = () => ({})) {
  const root = mkdtempSync(join(tmpdir(), 'guide-lessons-'));
  try {
    const files = { ...SEED_TREE, ...edit(SEED_TREE) };
    for (const [rel, body] of Object.entries(files)) {
      if (body === null) continue;
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), body);
    }
    return readLessonTree(join(root, 'content'), join(root, 'ajuda'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the lesson checks refuse each seeded offence and pass the clean tree', () => {
  const clean = seededTree();
  assert.equal(clean.files.length, 3, `the reader should find the section, the lesson and the FAQ entry, found ${clean.files.length}`);
  for (const [rule, list] of Object.entries(clean.offences)) {
    assert.deepEqual(list, [], `the ${rule} check refused the clean seeded tree:\n  ${list.join('\n  ')}`);
  }
  assert.deepEqual(clean.published, { rececao: 1, terapeuta: 1, proprietario: 1 });
  assert.ok(lessonsCarryEveryRole(clean), 'the clean tree gives every role a lesson, so it may stand in for the chapters');

  const lesson = (from, to) => (tree) => ({ [SEED_LESSON]: swap(tree[SEED_LESSON], from, to) });
  const red = [
    [
      'a dash in a front matter value',
      lesson('goal: Abrir o Início e ler', 'goal: Abrir o Início \u2014 ler'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:4: the value of "goal" contains a dash character, em dash (U+2014)',
    ],
    [
      'a hyphen used as punctuation in a front matter value',
      lesson('goal: Abrir o Início e ler', 'goal: Abrir o Início - ler'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:4: the value of "goal" uses a hyphen as punctuation',
    ],
    [
      'an unknown front matter key',
      lesson('shots: inicio.primeiro-passo\n', 'shots: inicio.primeiro-passo\nautor: Bruno Ficticio\n'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:9: unknown front matter key "autor"',
    ],
    [
      'a lesson with no roles',
      lesson('roles: rececao, terapeuta, proprietario\n', ''),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:1: missing front matter key "roles"',
    ],
    [
      'a role outside the three',
      lesson('roles: rececao, terapeuta, proprietario', 'roles: rececao, terapeuta, proprietario, medico'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:5: unknown role "medico" in roles',
    ],
    [
      'an FAQ entry with no question',
      (tree) => ({ [SEED_FAQ]: swap(tree[SEED_FAQ], 'question: Como marco uma consulta para um paciente que já tem ficha?\n', '') }),
      'frontMatter',
      '00-perguntas/01-marcar-consulta.md:1: missing front matter key "question"',
    ],
    [
      'a lesson image that does not exist',
      () => ({ [SEED_PHONE]: null }),
      'images',
      '01-inicio/01-primeiro-passo.md:18: ../../ajuda/inicio/primeiro-passo-390.png does not exist',
    ],
    [
      'a lesson image outside apps/web/public/ajuda',
      lesson('](../../ajuda/inicio/primeiro-passo-390.png)', '](../../outro/primeiro-passo-390.png)'),
      'images',
      '01-inicio/01-primeiro-passo.md:18: ../../outro/primeiro-passo-390.png points outside',
    ],
    [
      'a dash character in a lesson body',
      lesson('ficam na ficha.', 'ficam \u2013 na ficha.'),
      'dashes',
      '01-inicio/01-primeiro-passo.md:12: column 51: en dash (U+2013)',
    ],
    [
      'a hyphen list marker in a lesson body',
      lesson('A palavra-passe e o e-mail', '- A palavra-passe e o e-mail'),
      'dashes',
      '01-inicio/01-primeiro-passo.md:12: hyphen list marker; use "* "',
    ],
    [
      'a role block that is never closed',
      lesson('parágrafo.\n:::\n', 'parágrafo.\n'),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:14: this role block is never closed with ":::"',
    ],
    [
      'a role block naming a role the file does not have',
      (tree) => ({
        [SEED_LESSON]: swap(
          swap(tree[SEED_LESSON], 'roles: rececao, terapeuta, proprietario', 'roles: rececao, proprietario'),
          'order: rececao 1, terapeuta 1, proprietario 1',
          'order: rececao 1, proprietario 1',
        ),
      }),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:14: the role block names "terapeuta", which is not in this file\'s roles',
    ],
    [
      'a body that does not start with its title',
      lesson('## O primeiro passo', '## Outro título'),
      'markdown',
      '01-inicio/01-primeiro-passo.md:10: the body starts with its "## " title line, "## O primeiro passo"',
    ],
    [
      'a stray file in a section folder',
      () => ({ 'content/01-inicio/notas.md': 'notas' }),
      'layout',
      '01-inicio/notas.md: a file of the lesson tree is NN-<slug>.md or _seccao.md',
    ],
    // The rest of the sweep: one arm for every other refusal the reader makes,
    // so no predicate above can be deleted with the suite still green.
    [
      'a double hyphen inside a front matter value',
      lesson('goal: Abrir o Início e ler', 'goal: Abrir o Início--ler'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:4: the value of "goal" uses a hyphen as punctuation',
    ],
    [
      'a front matter key given twice',
      lesson('capability: appointments:read\n', 'capability: appointments:read\ncapability: appointments:write\n'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:8: front matter key "capability" is given twice',
    ],
    [
      'a lesson with no goal',
      lesson('goal: Abrir o Início e ler o resumo do dia.\n', ''),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:1: missing front matter key "goal"',
    ],
    [
      'a role listed twice in roles',
      lesson('roles: rececao, terapeuta, proprietario', 'roles: rececao, terapeuta, proprietario, rececao'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:5: role "rececao" is listed twice',
    ],
    [
      'a front matter line that is not "key: value"',
      lesson('capability: appointments:read', 'capability appointments:read'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:7: a front matter line is "key: value"',
    ],
    [
      'a front matter key with no value',
      lesson('capability: appointments:read', 'capability:'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:7: a front matter line is "key: value" with a value',
    ],
    [
      'a file with no front matter',
      lesson('---\nid: inicio.primeiro-passo', 'id: inicio.primeiro-passo'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:1: a guide file starts with its front matter',
    ],
    [
      'a front matter block never closed',
      lesson('shots: inicio.primeiro-passo\n---\n', 'shots: inicio.primeiro-passo\n'),
      'frontMatter',
      '01-inicio/01-primeiro-passo.md:1: the front matter is never closed',
    ],
    [
      'a body with nothing in it',
      (tree) => ({ [SEED_LESSON]: `${swap(tree[SEED_LESSON], '## O primeiro passo', '').split('\n\n')[0]}\n` }),
      'markdown',
      '01-inicio/01-primeiro-passo.md:10: the body is empty',
    ],
    [
      'a table row in a lesson body',
      lesson('ficam na ficha.', 'ficam | na ficha.'),
      'markdown',
      '01-inicio/01-primeiro-passo.md:12: a table row',
    ],
    [
      'a phone capture with no desktop capture beside it',
      lesson('![Início no computador](../../ajuda/inicio/primeiro-passo-desktop.png)\n', ''),
      'images',
      '01-inicio/01-primeiro-passo.md:18: ../../ajuda/inicio/primeiro-passo-390.png stands alone',
    ],
    [
      'a role block naming an unknown role',
      lesson('::: terapeuta proprietario', '::: terapeuta medico'),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:14: unknown role "medico" in a role block',
    ],
    [
      'a role block naming a role twice',
      lesson('::: terapeuta proprietario', '::: terapeuta terapeuta'),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:14: the role block names a role twice',
    ],
    [
      'a malformed role block line',
      lesson('::: terapeuta proprietario', ':::terapeuta'),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:14: a role block line is ":::" alone',
    ],
    [
      'a ":::" that closes nothing',
      lesson('## O primeiro passo\n', '## O primeiro passo\n:::\n'),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:11: this ":::" closes a role block that was never opened',
    ],
    [
      'a role block inside a role block',
      lesson('Só o terapeuta', '::: proprietario\nSó o terapeuta'),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:15: role blocks do not nest',
    ],
    [
      'an empty role block',
      lesson('Só o terapeuta e o Proprietário leem este parágrafo.\n', ''),
      'roleBlocks',
      '01-inicio/01-primeiro-passo.md:14: an empty role block',
    ],
    [
      'a section folder with no _seccao.md',
      () => ({ [SEED_SECTION]: null }),
      'layout',
      '01-inicio/: no _seccao.md describing the section',
    ],
    [
      'a folder not named NN-<section>',
      () => ({ 'content/inicio/01-outro.md': 'outro' }),
      'layout',
      'inicio/: a folder of the lesson tree is named NN-<section>',
    ],
  ];
  for (const [what, edit, rule, want] of red) {
    const tree = seededTree(edit);
    assert.ok(
      tree.offences[rule].some((offence) => offence.startsWith(want)),
      `the ${rule} check let ${what} through; wanted an offence starting ${JSON.stringify(want)}, got:\n  ` +
        (tree.offences[rule].join('\n  ') || '(none)'),
    );
  }

  // The count rule: a held lesson is not published, and a role with no lesson
  // means the tree cannot stand in for the chapters.
  const held = seededTree(lesson('shots: inicio.primeiro-passo\n', 'shots: inicio.primeiro-passo\nhold: GUEST-05\n'));
  assert.deepEqual(held.published, { rececao: 0, terapeuta: 0, proprietario: 0 }, 'a held lesson counted as published');
  assert.ok(!lessonsCarryEveryRole(held), 'a tree whose only lesson is held stood in for the chapters');
  const noTherapist = seededTree((tree) => ({
    [SEED_LESSON]: swap(
      swap(swap(tree[SEED_LESSON], 'roles: rececao, terapeuta, proprietario', 'roles: rececao, proprietario'), 'terapeuta 1, ', ''),
      '::: terapeuta proprietario',
      '::: proprietario',
    ),
  }));
  assert.deepEqual(noTherapist.offences.roleBlocks, [], 'the no-therapist arm should break only the count rule');
  assert.ok(!lessonsCarryEveryRole(noTherapist), 'a tree with no lesson for terapeuta stood in for the chapters');
});
