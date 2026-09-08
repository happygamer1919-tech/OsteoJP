// LANG-01. THE GUEST FLOW MAY NOT IMPORT THE FROZEN, MODULE-LOAD DICTIONARY.
//
// WHAT THE FROZEN DICTIONARY IS. `apps/portal/lib/i18n.ts` resolves the locale
// ONCE, when the module is first imported, to the literal 'pt', and exports the
// result as `s`. It is a MODULE CONSTANT shared by every render of every request
// in the process - not a value that can be different for two visitors.
//
// WHY A GUARD AND NOT A COMMENT. LANG-01 converted the GUEST flow to a
// per-request dictionary and deliberately left the other 27 files alone: they
// are the AUTHENTICATED portal, whose locale is a stored fact about a patient
// and therefore waits on BLUE's column. So two mechanisms now coexist in one
// app, and the failure mode is silent in the worst way - a new file in
// `app/marcacao/` writes `import { s } from '@/lib/i18n'`, type-checks, renders,
// and is simply always Portuguese inside an English page. Nothing is red.
//
// SO THE BOUNDARY IS MECHANICAL. The quarantine is a PATH PREFIX list, not a
// file list: every file under a converted prefix is covered, including ones
// that do not exist yet, which is the half a file list cannot do.
//
// HOW TO EXTEND IT. When the authenticated portal converts, add its prefix here
// and the guard grows with it. When the LAST prefix is added, `lib/i18n.ts`
// stops exporting `s` at all and this file can be deleted - a compile error is
// strictly better than a guard, and it only becomes available at the end.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = join(ROOT, "apps", "portal");

/**
 * The prefixes that have been converted to a PER-REQUEST dictionary and may
 * never import the frozen one again. Repo-relative, POSIX separators.
 */
const QUARANTINED = [
  // LANG-01: the public guest booking flow.
  "apps/portal/app/marcacao",
  // Its confirmation copy, which the flow resolves per locale.
  "apps/portal/lib/guest/commitment-copy.ts",
  // The root layout, which renders <html lang> off the resolved locale.
  "apps/portal/app/layout.tsx",
];

/** Comments stripped before the match. This boundary is described at length in
 *  prose - in the very files it governs - and a predicate over raw text would
 *  match those descriptions and go red on correct code. Same reason
 *  `pack-sessions-remaining-is-frozen.test.mjs` strips them. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** Every source file under `dir`, skipping build output and dependencies. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const ALL = walk(PORTAL);
const rel = (f) => relative(ROOT, f).split(sep).join("/");
const isQuarantined = (r) => QUARANTINED.some((q) => r === q || r.startsWith(`${q}/`));

/** The import this guard is about, in every spelling that reaches the same module. */
const FROZEN_IMPORT = /from\s+['"](?:@\/lib\/i18n|\.{1,2}\/(?:\.\.\/)*lib\/i18n)['"]/;

test("the quarantined prefixes exist - a guard over nothing guards nothing", () => {
  // The premise first. A renamed directory would leave every assertion below
  // passing over an empty set, which is the vacuous shape this repo keeps
  // finding in its own instruments.
  for (const q of QUARANTINED) {
    const covered = ALL.map(rel).filter((r) => r === q || r.startsWith(`${q}/`));
    assert.ok(
      covered.length > 0,
      `quarantined path "${q}" matches no file. It was renamed or removed; ` +
        `update QUARANTINED rather than leaving a guard that selects nobody.`,
    );
  }
});

test("no quarantined file imports the frozen module-load dictionary", () => {
  const offenders = ALL.filter((f) => isQuarantined(rel(f)))
    .filter((f) => FROZEN_IMPORT.test(stripComments(readFileSync(f, "utf8"))))
    .map(rel);

  assert.deepEqual(
    offenders,
    [],
    `these files import the FROZEN pt dictionary from a per-request surface:\n` +
      offenders.map((o) => `  ${o}`).join("\n") +
      `\n\nThey will render Portuguese inside a page the visitor asked for in ` +
      `another language, and nothing else will report it. Take the dictionary ` +
      `as a prop, or call resolvePortalStrings() if you are a server component.`,
  );
});

test("the guard can actually fail - the pattern matches a real import", () => {
  // CRITERION F. A regex that matched nothing would make the test above pass
  // forever. It is proved against the shape it is looking for, and against the
  // UNCONVERTED files, which genuinely still carry that import today.
  assert.ok(FROZEN_IMPORT.test(`import { s } from '@/lib/i18n'`));
  assert.ok(FROZEN_IMPORT.test(`import { s } from "../../lib/i18n"`));
  assert.ok(!FROZEN_IMPORT.test(`import { s } from '@/lib/locale'`));

  const unconverted = ALL.filter((f) => !isQuarantined(rel(f))).filter((f) =>
    FROZEN_IMPORT.test(stripComments(readFileSync(f, "utf8"))),
  );
  assert.ok(
    unconverted.length > 0,
    "no file anywhere imports the frozen dictionary. If the authenticated portal " +
      "has been converted, delete lib/i18n.ts's `s` export and this whole guard - " +
      "a compile error is better than a check.",
  );
});
