import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

/**
 * LE-e2e-suite-not-typechecked — THE E2E SUITE STAYS IN THE TYPECHECK.
 *
 * ==========================================================================
 * WHAT THE GAP WAS, AND WHY IT WAS INVISIBLE.
 * ==========================================================================
 * `apps/web/tsconfig.json` excluded `e2e` and `playwright.config.ts`, and
 * Playwright transpiles TypeScript with esbuild — which STRIPS types and does
 * not check them. So `pnpm typecheck`, one of the four repo gates, did not read
 * a single line of the e2e suite, and neither did anything else.
 *
 * IT WAS NOT HYPOTHETICAL. Turning it on surfaced two real errors, both
 * `'possibly null'` on a `boundingBox()` narrowed by `expect(...).not.toBeNull()`
 * — which asserts at runtime and narrows NOTHING for the compiler. They never
 * crashed, because the boxes are always there when the dialog is open. **That is
 * exactly why nothing found them**: a type error that does not crash is
 * invisible without a compiler.
 *
 * ==========================================================================
 * WHY A GUARD AND NOT JUST THE CONFIG CHANGE.
 * ==========================================================================
 * The exclusion is one line in a JSON file. Re-adding it makes the gate go blind
 * again and NOTHING GOES RED — the suite still runs, the checks still pass, and
 * the only signal is an absence. That was proven rather than argued: restoring
 * the exclusion with a deliberate type error in place takes the error count from
 * 1 back to 0.
 *
 * An absence is the one thing a green check cannot report, so it is asserted
 * here instead.
 */

const TSCONFIG = "apps/web/tsconfig.json";
const E2E_DIR = "apps/web/e2e";

/**
 * JSONC: tsconfig allows comments, and this one has them.
 *
 * STRING-AWARE, AND THE FIRST VERSION WAS NOT — which this file found on its own
 * first run. A naive block-comment regex sees the slash-star inside the path
 * alias "@/(star)" as a comment opener and strips everything to the next
 * close-comment, eating the middle of the file. JSON.parse then failed at the
 * alias.
 *
 * THE SECOND VERSION OF THIS COMMENT BROKE THE FILE TOO, and it is worth one
 * line: it quoted the regex literally, and the close-comment inside that quote
 * ENDED THIS BLOCK EARLY. Hence the prose above spells the tokens out. Four
 * instances of one lesson in a day, the last two inside guards written about
 * it: a shape-match counts the APPEARANCE of a token, not what the token means
 * where it sits.
 *
 * SAME LESSON AS THE THREE GUARDS BEFORE IT, in a third costume: a shape-match
 * counts the APPEARANCE of a token, not the thing the token sometimes means. A
 * `/*` inside a string is not a comment.
 *
 * IT THROWS RATHER THAN RETURNING `{}`, and that is what made the bug loud. A
 * stripper that returned an empty object on a parse failure would have given
 * `cfg.exclude ?? []` an empty array, and the two exclusion assertions below
 * would have PASSED — a broken instrument reporting a clean result, which is the
 * whole family this repo keeps finding.
 */
function readJsonc(path) {
  const raw = readFileSync(path, "utf8");
  let out = "";
  let i = 0;
  let inString = false;
  while (i < raw.length) {
    const c = raw[i];
    const next = raw[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = raw.indexOf("*/", i + 2);
      i = end === -1 ? raw.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = raw.indexOf("\n", i);
      i = end === -1 ? raw.length : end;
      continue;
    }
    out += c;
    i += 1;
  }
  return JSON.parse(out);
}

test("the scan is not vacuous", () => {
  // A guard about a directory that does not exist is a guard about nothing, and
  // it would go green the day somebody deleted the suite.
  assert.ok(existsSync(TSCONFIG), `${TSCONFIG} is missing`);
  assert.ok(existsSync(E2E_DIR), `${E2E_DIR} is missing`);
  const specs = readdirSync(E2E_DIR).filter((f) => f.endsWith(".spec.ts"));
  assert.ok(specs.length >= 10, `expected 10+ e2e specs, found ${specs.length}`);
});

test("apps/web does not exclude e2e from the typecheck", () => {
  const cfg = readJsonc(TSCONFIG);
  const exclude = cfg.exclude ?? [];
  const offenders = exclude.filter((p) => /(^|\/)e2e($|\/)/.test(p));
  assert.deepEqual(
    offenders,
    [],
    `${TSCONFIG} excludes ${offenders.join(", ")}, so \`pnpm typecheck\` reads none of the ` +
      `e2e suite. Playwright strips types without checking them, so nothing else does either — ` +
      `and a type error that does not crash is then invisible. Re-adding this exclusion turns ` +
      `no check red; that is why it is asserted here.`,
  );
});

test("apps/web does not exclude playwright.config.ts either", () => {
  // Included in the same change and worth its own arm: the config decides which
  // specs run and on what, so a type error in it is a suite that runs the wrong
  // thing rather than a spec that fails.
  const cfg = readJsonc(TSCONFIG);
  const exclude = cfg.exclude ?? [];
  assert.ok(
    !exclude.some((p) => p.includes("playwright.config")),
    `${TSCONFIG} excludes playwright.config.ts from the typecheck`,
  );
});

test("the include globs actually reach the e2e directory", () => {
  // The negative of the test above: an exclusion is not the only way to leave
  // the suite unchecked. Narrowing `include` to `app/**` would exclude it just
  // as effectively while the `exclude` array stayed clean, and both assertions
  // above would still pass.
  const cfg = readJsonc(TSCONFIG);
  const include = cfg.include ?? [];
  assert.ok(
    include.some((p) => p === "**/*.ts" || p === "**/*.tsx" || p.startsWith("e2e/")),
    `${TSCONFIG} include is ${JSON.stringify(include)}, which does not reach e2e/`,
  );
});
