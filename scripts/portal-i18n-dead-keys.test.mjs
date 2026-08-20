import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * LE-dead-i18n-keys-imply-screens — A DEAD STRING READS AS COVERAGE.
 *
 * ==========================================================================
 * WHY THIS IS A GATE AND NOT TIDINESS.
 * ==========================================================================
 * Anyone auditing "does the portal handle a 403 well" finds a pt-PT string, a
 * sensible sentence, and concludes the case is handled. IT IS NOT HANDLED - it
 * is UNREACHABLE, which is a different and better fact, and nothing on the
 * surface says so. The keys imply screens that do not exist.
 *
 * That is the same family as every other entry in this repo's LEARNINGS: a
 * thing that LOOKS like the benign case and is never contradicted.
 *
 * ==========================================================================
 * THE CARD SAYS SIX. IT IS AT LEAST 163, MEASURED 2026-08-20.
 * ==========================================================================
 * The card was written from one question ("can a patient reach a 403") and
 * named the six keys that question touched. Scanned properly, 163 of the
 * portal's 408 keys are referenced by nothing anywhere in `apps/`, `packages/`
 * or `scripts/`.
 *
 * THE LARGEST GROUP IS NOT THE ERROR PAGES. It is `auth`, at 33 - the whole
 * email, password, magic-link and activate family, retired by Decision D when
 * portal login became phone-and-code. Those strings describe a login screen
 * that no longer exists, in Portuguese, ready to be found by anyone asking
 * whether the portal has password recovery. `errors` is 6 of 163.
 *
 * ==========================================================================
 * WHAT THIS FILE DOES, AND THE ONE THING IT REFUSES TO DO.
 * ==========================================================================
 * It RATCHETS. The 163 are not deleted here: deleting product strings is a
 * decision about the portal's error surface and belongs to the owner, not to a
 * terminal - the card says so in its own words and the question is written up at
 * docs/QUESTIONS.md as Q-PORTAL-DEAD-I18N-1.
 *
 * What it makes impossible is the number GROWING SILENTLY. A 164th dead key is
 * red, and the failure names the group it landed in. A key added before its
 * screen now has to arrive WITH its screen, or be declared.
 *
 * ==========================================================================
 * THE REFERENCE RULE IS DELIBERATELY OVER-INCLUSIVE, AND THAT IS THE SAFE BIAS.
 * ==========================================================================
 * A key counts as REFERENCED if its full dotted path appears, OR its leaf
 * appears as a property access, OR its leaf appears as a quoted string. That
 * over-counts references - `common.yes` would be "referenced" by any `.yes` in
 * the repo - which UNDER-counts dead keys.
 *
 * THAT DIRECTION IS CHOSEN ON PURPOSE. This file makes a claim ABOUT DEADNESS,
 * and a false "this key is dead" is a claim that could get a live string
 * deleted. A false "this key is alive" only makes the ratchet looser. So 163 is
 * a FLOOR: at least that many are dead, possibly more. It is not a count of all
 * dead keys and must not be quoted as one.
 *
 * IT ALSO CANNOT SEE DYNAMIC ACCESS, and the over-inclusive rule is what covers
 * that: `s.services[serviceId]` never writes the leaf, and the quoted-string arm
 * catches most such keys because the id is a literal somewhere. Where it does
 * not, the key reads as dead when it is not - which the floor framing already
 * accounts for.
 */

const PT = "packages/i18n/src/portal/strings.pt.json";
const EN = "packages/i18n/src/portal/strings.en.json";

/**
 * MEASURED 2026-08-20 against main at 4b385e6. A RATCHET, NOT A TARGET: it may
 * only ever go DOWN. Lowering it when keys are removed is the point; raising it
 * is how a ratchet becomes a rubber stamp, and a PR that needs it raised should
 * say why in its own body rather than edit this number quietly.
 */
const DEAD_KEY_CEILING = 163;

/**
 * The six the card names, each with what should happen to it. THIS IS THE
 * ANNOTATION THE CARD WANTED AND COULD NOT HAVE: option (c) on the card was
 * "KEEP and annotate - impossible in JSON without a convention this repo does
 * not have". A JSON dictionary has nowhere to say "this is dead on purpose". A
 * guard does.
 *
 * IT IS CHECKED IN BOTH DIRECTIONS. A key listed here that turns out to be LIVE
 * is also a failure: it means somebody wired the screen up and this record went
 * stale, which is exactly how a note stops being true without anybody noticing.
 */
const DECLARED_DEAD = {
  "errors.403_title": "Decision D: a portal patient has no route that can 403. Delete per option (a).",
  "errors.403_body": "The worst-written of the six - offers no retry, no navigation, no telephone. Being dead is currently the only thing stopping it shipping as a dead end.",
  "errors.500_title": "REACHABLE as a browser state even though no route renders it. Option (b): wire a real boundary rather than delete.",
  "errors.500_body": "As above.",
  "errors.offline_title": "REACHABLE as a browser state. Option (b).",
  "errors.offline_body": "As above.",
};

function flatten(o, pre = "", out = []) {
  for (const [k, v] of Object.entries(o)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.push(key);
  }
  return out;
}

/**
 * THIS FILE IS EXCLUDED FROM ITS OWN CORPUS, and it is not a technicality: the
 * first run FAILED because of it. `DECLARED_DEAD` quotes the six key names, the
 * corpus includes `scripts/`, and so the guard read its own record of a key
 * being dead as evidence that the key is alive.
 *
 * SECOND INSTANCE OF THE SAME SHAPE IN ONE DAY. The agenda freshness guard went
 * red on its own doc comment for the identical reason, and
 * ACC-fixture-forbidden-state-sweep recorded it before either: a shape-match
 * counts the APPEARANCE OF A STRING, not the thing the string sometimes
 * indicates. A file that TALKS ABOUT keys is not a file that USES them.
 */
const SELF = "scripts/portal-i18n-dead-keys.test.mjs";

function sourceFiles() {
  const files = [];
  for (const root of ["apps", "packages", "scripts"]) {
    if (!existsSync(root)) continue;
    (function walk(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "dist" || e.name.startsWith(".")) continue;
        const f = join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.(ts|tsx|mjs|js|cjs)$/.test(e.name) && f !== SELF) files.push(f);
      }
    })(root);
  }
  return files;
}

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ptKeys = flatten(JSON.parse(readFileSync(PT, "utf8")));
const enKeys = flatten(JSON.parse(readFileSync(EN, "utf8")));
const files = sourceFiles();
const src = files.map((f) => readFileSync(f, "utf8")).join("\n");

function isReferenced(key) {
  const leaf = key.split(".").pop();
  return (
    new RegExp(esc(key)).test(src) ||
    new RegExp(`\\.${esc(leaf)}\\b`).test(src) ||
    new RegExp(`["'\`]${esc(leaf)}["'\`]`).test(src)
  );
}

const dead = ptKeys.filter((k) => !isReferenced(k));

test("the scan is not vacuous", () => {
  // LEARNINGS entry 5, and this project has already had the exact accident: a
  // `find` that matched nothing reported "0 files scanned, 0 violations" and
  // read as clean. A scan over zero files finds every key dead; a scan over a
  // corpus containing the dictionaries themselves finds none dead. Both are
  // caught here.
  assert.ok(files.length >= 500, `expected 500+ source files, scanned ${files.length}`);
  assert.ok(ptKeys.length >= 300, `expected 300+ portal keys, found ${ptKeys.length}`);
  assert.ok(dead.length > 0, "a dead count of zero means the reference rule matched everything");
  assert.ok(
    dead.length < ptKeys.length,
    "every key reading as dead means the source corpus is empty or unreadable",
  );
});

test("the scan excludes itself, and would otherwise be wrong about it", () => {
  // A POSITIVE CONTROL ON THE EXCLUSION. If `SELF` ever stops matching - the
  // file is renamed, the path convention changes - this file's own DECLARED_DEAD
  // entries silently become "references" and every key in that list reads as
  // alive. The failure would look like good news.
  // SELF MUST NAME A FILE THAT EXISTS, ASSERTED FIRST. Without this the check
  // below passes for ANY bogus path - `files.includes("scripts/nope.mjs")` is
  // false whether the exclusion works or not - and the exclusion could rot to
  // nothing while this test stayed green. Found by the negative control that
  // renamed SELF: it correctly reddened the DECLARED_DEAD test and this one,
  // the guard on the exclusion itself, did not notice.
  assert.ok(existsSync(SELF), `SELF names ${SELF}, which does not exist - the exclusion excludes nothing`);
  assert.ok(
    !files.includes(SELF),
    `${SELF} must not be in its own corpus: it quotes the key names it is asserting are dead`,
  );
  assert.ok(
    files.some((f) => f.startsWith("scripts/")),
    "excluding this file must not exclude scripts/ wholesale",
  );
});

test("pt and en carry the SAME key set", () => {
  // `PortalStrings` is inferred from the PT file and EN must satisfy it, so a
  // MISSING en key is already a type error. An EXTRA one is not: an en-only key
  // is dead by construction, invisible to the compiler, and would sit in the
  // file forever. Pinned here because it is the cheap half of the same problem.
  const onlyPt = ptKeys.filter((k) => !enKeys.includes(k));
  const onlyEn = enKeys.filter((k) => !ptKeys.includes(k));
  assert.deepEqual(onlyPt, [], "keys in pt with no en counterpart");
  assert.deepEqual(onlyEn, [], "keys in en with no pt counterpart");
});

test("the dead-key count does not grow", () => {
  const byGroup = {};
  for (const k of dead) {
    const g = k.split(".")[0];
    byGroup[g] = (byGroup[g] ?? 0) + 1;
  }
  const breakdown = Object.entries(byGroup)
    .sort((a, b) => b[1] - a[1])
    .map(([g, n]) => `${g}=${n}`)
    .join(" ");

  assert.ok(
    dead.length <= DEAD_KEY_CEILING,
    `${dead.length} portal i18n keys are referenced by nothing, above the ceiling of ` +
      `${DEAD_KEY_CEILING}. By group: ${breakdown}.\n` +
      `A string with no screen behind it READS AS COVERAGE: somebody auditing whether a ` +
      `case is handled finds a sensible pt-PT sentence and concludes it is. If this PR ` +
      `adds a key ahead of the screen that uses it, ship them together. If the key is ` +
      `deliberately dead, add it to DECLARED_DEAD with the reason.`,
  );
});

test("every DECLARED_DEAD key is still dead, and still exists", () => {
  // BOTH DIRECTIONS. A declared-dead key that has become LIVE means somebody
  // wired the screen up and this record went stale - which is precisely how a
  // note stops being true without anybody noticing, and is the failure mode the
  // whole card is about, one layer in.
  for (const [key, why] of Object.entries(DECLARED_DEAD)) {
    assert.ok(
      ptKeys.includes(key),
      `DECLARED_DEAD names ${key}, which is no longer in ${PT}. If it was deleted, ` +
        `remove it from DECLARED_DEAD and lower DEAD_KEY_CEILING.`,
    );
    assert.ok(
      dead.includes(key),
      `DECLARED_DEAD says ${key} is dead ("${why}") and it is now REFERENCED. ` +
        `The screen exists: remove it from this list and say so on ` +
        `LE-dead-i18n-keys-imply-screens.`,
    );
  }
});
