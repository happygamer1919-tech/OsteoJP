// The RGPD-01 apply document is pasted into zsh, so it must mean the same thing
// in zsh — and the existing guard cannot see it.
//
// WHY THIS FILE EXISTS RATHER THAN A ONE-LINE CHANGE NEXT DOOR.
// `scripts/owner-blocks-survive-zsh.test.mjs` globs `migration-apply-NNNN.md`.
// RGPD-01's migration is deliberately UNNUMBERED — 0089's file is still on the
// #1338 branch and two other branches already hold a NEXT-AFTER-0089 — so its
// apply document has no number to be named after and the glob does not match it.
//
// The obvious fix is to widen that glob. It was not taken: PR #1388 is open
// against that exact file, and widening it here would manufacture a conflict in
// the one file two branches are already editing, for a rule that can be applied
// from outside instead. This runs the SAME exported detector against this one
// document, so the protection is identical and the shared file is untouched.
//
// WHEN RGPD-01 IS PROMOTED and its document is renamed to
// `docs/migration-apply-NNNN.md`, the main guard's glob starts matching it and
// THIS FILE SHOULD BE DELETED rather than left to assert the same thing twice.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { offendingLines } from "./owner-blocks-survive-zsh.test.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "docs/migration-apply-RGPD-01.md";

test("the RGPD-01 apply document exists, so this guard cannot pass over a missing file", () => {
  assert.ok(
    existsSync(join(ROOT, DOC)),
    `${DOC} is missing — the guard would otherwise report safety it never checked`,
  );
});

test("the RGPD-01 apply document is NOT covered by the numbered glob, which is why this file exists", () => {
  // If this ever fails, the document has been renamed to a numbered path and the
  // main guard now covers it. Delete this file instead of relaxing the check.
  assert.doesNotMatch(
    DOC,
    /^docs\/migration-apply-\d{4}\.md$/,
    "the document is now numbered; the main guard covers it and this file is redundant",
  );
});

test("no fenced line in the RGPD-01 apply document writes a parameter followed by a colon without braces", () => {
  const found = offendingLines(readFileSync(join(ROOT, DOC), "utf8")).map(
    (o) => `${DOC}:${o.line}: ${o.text}`,
  );
  assert.deepEqual(
    found,
    [],
    "In zsh `$NAME:` applies a modifier to the parameter (`:s` substitutes, `:h` takes the head),\n" +
      "so the line does something different from what bash does with it. Write `${NAME}:`.\n" +
      found.join("\n"),
  );
});

test("NEGATIVE CONTROL: the detector still catches the unbraced form in this document's own shape", () => {
  // Without this, a detector that had silently stopped matching would let the
  // test above pass on every document forever.
  const planted = ["```", "PIN=$(git rev-parse ${BRANCH})", "git show $PIN:scripts/x.sql", "```", ""].join("\n");
  const hits = offendingLines(planted);
  assert.equal(hits.length, 1, `expected the planted line to be caught, got ${JSON.stringify(hits)}`);
  assert.match(hits[0].text, /\$PIN:/);
});
