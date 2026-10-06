import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// R45 (strategy, 2026-10-06), gate G2: "grep of patient-facing copy and the six
// templates for a hardcoded pair of clinic names. EXPECT: zero."
//
// THE RULING BEHIND IT: "No clinic names enumerated in copy." A sentence that
// lists the clinics is wrong the day one opens or closes, and the next clinic
// should need a row in Administração > Locais and nothing else. The footer, the
// Clínicas page and the telephones now read the active locations; this file is
// what keeps a list from being written back in.
//
// WHAT COUNTS AS A LIST. Two different place names in ONE string, or within a
// few lines of each other in code. A single name on its own is not a list: one
// label per short code and one address per published clinic are data about
// that clinic, and the two clinics' entries sit well apart. The six email
// templates are held to the stricter rule the ruling gives them: they name no
// place at all.
//
// WHAT IT CANNOT SEE, SAID PLAINLY. It knows the three place names the product
// has used. A list made only of names it has never heard of passes. What
// catches that is the other half of R45: the screens read their clinics from
// the locations, so there is no place left in this app where such a list would
// be written.

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Every place name the product has used for a clinic. A new clinic's name does
 *  not need adding for the rule to hold, which is the point of the rule; the
 *  three here are the ones a pasted list would most plausibly be made of. */
const PLACES = ['Linda-a-Velha', 'Castelo Branco', 'Montemor']

/**
 * Lower-cased, accents removed, every HTML entity and every run of anything
 * that is not a letter or a digit collapsed to one space. So "LINDA A VELHA",
 * "Linda&#8209;a&#8209;Velha" and "Castelo&nbsp;Branco" all read as the names
 * they are.
 */
const fold = (text: string): string =>
  text
    // ANY entity, and a soft hyphen, is a gap between letters at most. Which
    // one it is does not matter: everything that is not a letter or a digit
    // becomes one space two lines down.
    .replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/\u00ad/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')

const FOLDED_PLACES = PLACES.map((p) => fold(p).trim())

const placesIn = (text: string): string[] => {
  const folded = ` ${fold(text)} `
  return PLACES.filter((_, i) => folded.includes(` ${FOLDED_PLACES[i]} `))
}

/** How many lines of code are read together. A list written one name per line
 *  is still a list. */
const WINDOW = 4

/** Comments stripped before matching source: headers in this app explain the
 *  history in prose and name both clinics doing it, which is not copy. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name === '.next' || name === 'e2e') continue
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}

function stringValues(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === 'string') return [[path.join('.'), node]]
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => stringValues(v, [...path, k]))
  }
  return []
}

const TEMPLATES = readdirSync(join(ROOT, 'supabase/templates'))
  .filter((f) => f.endsWith('.html'))
  .sort()

/** Patient-facing code: the portal, and the API and reminder code that writes
 *  what a patient is sent. */
const SOURCE_DIRS = [
  'apps/portal/app',
  'apps/portal/components',
  'apps/portal/lib',
  'apps/api/app',
  'apps/api/lib',
  'apps/web/lib/reminders',
  // The staff app's two public pages, which a patient opens from a message.
  'apps/web/app/c',
  'apps/web/app/r',
]

describe('R45 G2 — no patient-facing copy lists the clinics', () => {
  it('the scan reads what it claims to read (guards a vacuous pass)', () => {
    expect(TEMPLATES).toHaveLength(6)
    for (const loc of ['pt', 'en']) {
      const values = stringValues(JSON.parse(read(`packages/i18n/src/portal/strings.${loc}.json`)))
      expect(values.length).toBeGreaterThan(300)
    }
    expect(SOURCE_DIRS.flatMap(sourceFiles).length).toBeGreaterThan(150)
    // And it can see a name when one is there: each known clinic's own label is
    // still a string in the dictionary, one place apiece.
    const pt = stringValues(JSON.parse(read('packages/i18n/src/portal/strings.pt.json')))
    expect(pt.filter(([, v]) => placesIn(v).length === 1).length).toBeGreaterThan(0)
  })

  it('THE CONTROL: the rule tells a list from a single name', () => {
    expect(placesIn('Estamos presentes em Linda-a-Velha e Castelo Branco.')).toHaveLength(2)
    expect(placesIn('Linda-a-Velha · Castelo Branco')).toHaveLength(2)
    expect(placesIn('OsteoJP - Linda-a-Velha, Castelo Branco e Montemor-o-Novo')).toHaveLength(3)
    expect(placesIn('Praça Central Plaza, n.º 1 – A, 2795-246 Linda-a-Velha')).toHaveLength(1)
    expect(placesIn('As nossas clínicas')).toHaveLength(0)
    // Spelling does not hide a name: case, a missing hyphen, an entity.
    expect(placesIn('LINDA A VELHA e castelo branco')).toHaveLength(2)
    expect(placesIn('Linda&#8209;a&#8209;Velha e Castelo&nbsp;Branco')).toHaveLength(2)
    expect(placesIn('Linda&#8208;a&shy;Velha e Castelo&#32;Bran\u00adco')).toHaveLength(2)
    expect(placesIn('Montemor-o-Novo')).toEqual(['Montemor'])
    // And a word that merely contains a name's letters is not that name.
    expect(placesIn('castelobranco.example')).toHaveLength(0)
    // And the comment stripper does not eat a string that merely holds slashes.
    expect(stripComments("const u = 'https://x.test/a' // Linda-a-Velha e Castelo Branco")).toContain(
      'https://x.test/a',
    )
    expect(placesIn(stripComments('/* Linda-a-Velha e Castelo Branco */ const a = 1'))).toEqual([])
  })

  // THE STAFF DICTIONARIES TOO. The two public pages of the staff app (the
  // confirm link and the reschedule link a patient opens from a message) take
  // their words from them, and so do the messages themselves.
  const DICTIONARIES = [
    'packages/i18n/src/portal/strings.pt.json',
    'packages/i18n/src/portal/strings.en.json',
    'packages/i18n/src/strings.pt.json',
    'packages/i18n/src/strings.en.json',
  ]

  it.each(DICTIONARIES)('no string in %s names two clinics', (file) => {
    const values = stringValues(JSON.parse(read(file)))
    expect(values.length).toBeGreaterThan(300)
    const offenders = values
      .filter(([, value]) => placesIn(value).length > 1)
      .map(([key, value]) => `${key}: ${value}`)
    expect(offenders).toEqual([])
  })

  it.each(TEMPLATES)('the email template %s names no clinic', (file) => {
    // Stricter than a pair, by the ruling's own words: "The six auth templates
    // say "OsteoJP" with no list of clinics."
    expect(placesIn(read(`supabase/templates/${file}`))).toEqual([])
  })

  /** Every run of WINDOW lines in which two different clinics are named. */
  function listsIn(file: string, src: string): string[] {
    const lines = stripComments(src).split('\n')
    const found: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const names = placesIn(lines.slice(i, i + WINDOW).join('\n'))
      if (names.length > 1) found.push(`${file}:${i + 1}: ${names.join(' + ')}`)
    }
    return found
  }

  it('no patient-facing code names two clinics within a few lines', () => {
    const offenders = SOURCE_DIRS.flatMap(sourceFiles).flatMap((file) =>
      listsIn(relative(ROOT, join(ROOT, file)), read(file)),
    )
    expect(offenders).toEqual([])
  })

  it('THE CONTROL: a list written one name per line is caught, and two clinics far apart are not', () => {
    const oneNamePerLine = ["const CLINICS = [", "  { name: 'Linda-a-Velha' },", "  { name: 'Castelo Branco' },", ']'].join('\n')
    expect(listsIn('x.ts', oneNamePerLine).length).toBeGreaterThan(0)
    // The edge, both sides of it: names WINDOW - 1 lines apart share a window,
    // names WINDOW lines apart do not.
    const apart = (gap: number) =>
      ["a: 'Linda-a-Velha',", ...Array.from({ length: gap - 1 }, () => 'x,'), "b: 'Castelo Branco',"].join('\n')
    expect(listsIn('x.ts', apart(WINDOW - 1)).length).toBeGreaterThan(0)
    expect(listsIn('x.ts', apart(WINDOW))).toEqual([])
  })

  it('the published details of two clinics sit well clear of the window, not one line clear', () => {
    // `lib/clinics.ts` holds one entry per published clinic, each with its own
    // address. That is data about one clinic, not a list, and it must not pass
    // this scan by a single line: the next tidy-up would turn the gate red.
    const lines = stripComments(read('apps/portal/lib/clinics.ts')).split('\n')
    const at = (place: string) => lines.flatMap((l, i) => (placesIn(l).includes(place) ? [i] : []))
    const [lv, cb] = [at('Linda-a-Velha'), at('Castelo Branco')]
    expect(lv.length).toBeGreaterThan(0)
    expect(cb.length).toBeGreaterThan(0)
    const gap = Math.min(...lv.flatMap((a) => cb.map((b) => Math.abs(a - b))))
    expect(gap).toBeGreaterThanOrEqual(WINDOW + 3)
  })

  it('the two strings that listed the clinics are gone from both dictionaries', () => {
    for (const loc of ['pt', 'en']) {
      const d = JSON.parse(read(`packages/i18n/src/portal/strings.${loc}.json`)) as {
        common: Record<string, unknown>
        clinics: Record<string, unknown>
      }
      expect(d.common, loc).not.toHaveProperty('footer_locations')
      expect(d.clinics, loc).not.toHaveProperty('subtitle')
    }
  })
})
