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
 * NOTHING IS SKIPPED. A missing content directory FAILS every test here: a
 * guide with no chapters is not a clean guide.
 *
 * GUIDE_DIR (a directory holding outline.md, content/ and screens/) points the
 * test at another tree. It exists to prove the test red on a seeded fixture.
 *
 * Run: pnpm test:scripts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = process.env.GUIDE_DIR ? resolve(process.env.GUIDE_DIR) : join(REPO, 'docs', 'guide');
const CONTENT = join(GUIDE, 'content');
const SCREENS = join(GUIDE, 'screens');
const OUTLINE = join(GUIDE, 'outline.md');
const BUILDER = join(REPO, 'docs', 'guide', 'build', 'build-guide.mjs');

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

function loadChapters() {
  assert.ok(
    existsSync(CONTENT) && statSync(CONTENT).isDirectory(),
    `${shown(CONTENT)} does not exist, so the guide has no chapters. This test fails rather than skips.`,
  );
  const chapters = readdirSync(CONTENT)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({ name, lines: readFileSync(join(CONTENT, name), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/) }));
  // Zero files would pass every per-line check below for the wrong reason.
  assert.ok(chapters.length > 0, `${shown(CONTENT)} has no *.md chapter file. This test fails rather than passes on nothing.`);
  return chapters;
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

test('the content directory holds at least three chapter files', (t) => {
  if (process.env.GUIDE_DIR) t.diagnostic(`GUIDE_DIR is set: checking ${GUIDE}`);
  const chapters = loadChapters();
  assert.ok(
    chapters.length >= 3,
    `expected a chapter per role (Receção, Terapeuta, Proprietário) in ${shown(CONTENT)}, ` +
      `found ${chapters.length}: ${chapters.map((c) => c.name).join(', ') || '(none)'}`,
  );
});

test('no chapter contains an em dash, an en dash or any other dash character', () => {
  const offences = [];
  for (const { name, lines } of loadChapters()) {
    lines.forEach((line, i) => {
      for (const found of dashesIn(line)) offences.push(`${name}:${i + 1}:${found}`);
    });
  }
  report(offences, 'The guide carries no dashes. Use a comma, a full stop, a colon or parentheses:');
});

test('no chapter uses a hyphen as a list marker or as punctuation between words', () => {
  const offences = [];
  for (const { name, lines } of loadChapters()) {
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

test('every image path resolves to an existing file under docs/guide/screens', () => {
  const images = imagesOf(loadChapters());
  assert.ok(images.length > 0, 'the chapters name no image at all, so there is nothing to check');
  const offences = [];
  for (const image of images) {
    if (!image.key) offences.push(`${image.at}: ${image.src} points outside ${shown(SCREENS)}`);
    else if (!existsSync(image.file) || !statSync(image.file).isFile()) offences.push(`${image.at}: ${image.src} does not exist`);
  }
  report(offences, 'Every image must be a capture in docs/guide/screens, named relative to docs/guide/content:');
});

test('every screen in docs/guide/outline.md appears as both its -390 and its -desktop image', () => {
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

  const shownInChapters = new Set(imagesOf(loadChapters()).map((image) => image.key).filter(Boolean));
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

test("each screen's phone and desktop images sit on consecutive image lines", () => {
  const kind = (src) => (/-390\.png$/.test(src) ? 'phone' : /-desktop\.png$/.test(src) ? 'desktop' : 'other');
  const screen = (src) => src.replace(/-(390|desktop)\.png$/, '');
  const offences = [];
  for (const { name, lines } of loadChapters()) {
    let run = [];
    const flush = () => {
      for (let i = 0; i < run.length; i += 2) {
        const [a, b] = [run[i], run[i + 1]];
        if (!b) {
          offences.push(`${name}:${a.n}: ${a.src} stands alone; put the phone and desktop images of a screen on consecutive lines`);
        } else if ([kind(a.src), kind(b.src)].sort().join('+') !== 'desktop+phone' || screen(a.src) !== screen(b.src)) {
          offences.push(`${name}:${a.n}: ${a.src} and ${b.src} are not the phone and desktop images of one screen`);
        }
      }
      run = [];
    };
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed === '') return;
      const m = IMAGE_LINE.exec(trimmed);
      if (m) run.push({ src: m[1], n: i + 1 });
      else flush();
    });
    flush();
  }
  report(offences, 'The build prints a screen as one row, phone beside desktop, only when the two lines are consecutive:');
});

test('every chapter starts with its "# " title line', () => {
  const offences = [];
  for (const { name, lines } of loadChapters()) {
    const first = lines.find((line) => line.trim() !== '');
    if (!first || !/^#\s+\S/.test(first)) offences.push(`${name}: first line is ${JSON.stringify(first ?? '')}`);
  }
  report(offences, 'The build takes each chapter title from its first line, which must be "# <title>":');
});

test('the chapters use only the Markdown subset the build prints', () => {
  const rules = [
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
  const offences = [];
  for (const { name, lines } of loadChapters()) {
    lines.forEach((line, i) => {
      const at = `${name}:${i + 1}`;
      for (const [re, what] of rules) if (re.test(line)) offences.push(`${at}: ${what}`);
      if (line.includes('![') && !IMAGE_LINE.test(line.trim())) offences.push(`${at}: an image not alone on its line as ![alt](path)`);
      const leftover = line.replace(/^\s*\*\s+/, '').replace(/\*\*[^*]+\*\*/g, '');
      if (leftover.includes('*')) offences.push(`${at}: a "*" that is neither **bold** nor a "* " list item`);
    });
  }
  report(offences, 'Only "#", "##", "###", paragraphs, "* " and "1. " lists, **bold** and image lines are printed:');
});
