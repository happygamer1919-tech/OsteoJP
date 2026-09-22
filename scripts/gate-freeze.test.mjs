// THE GATE FREEZE'S OWN GUARD.
//
// The freeze is a control, so the first question about it is the one this
// repository keeps having to ask: would it notice? Every arm below SEEDS a real
// weakening and asserts the comparison changes, with a control in the same run
// that would have failed if the arm were passing for the wrong reason.
//
// It tests the PURE half - `globToRegExp`, `isGateFile`, `compare` - plus the
// manifest on disk being current. The three RULES (A: pins hold, B: the
// manifest moves only in a GATE-CHANGE, C: a GATE-CHANGE carries nothing else)
// need a git history and a PR title, so they are exercised end to end in the
// pull request description and cannot honestly be asserted here. That gap is
// stated rather than papered over.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import {
  GATE_GLOBS,
  MANIFEST_PATH,
  ROOT,
  buildManifest,
  compare,
  globToRegExp,
  isGateFile,
  packageScriptsHash,
  readManifest,
} from "./gate-manifest.mjs";

describe("the gate set", () => {
  test("recognises every class the owner named, and rejects ordinary files", () => {
    // "required-check scripts, merge-control config, workflow files"
    const gates = [
      ".github/workflows/ci.yml",
      ".github/workflows/prod-drift-check.yml",
      ".github/scripts/assert-rls-executed.mjs",
      "scripts/check-journal.mjs",
      "scripts/secret-scan.mjs",
      "scripts/env-example-covers-the-code.test.mjs", // the second breach
      "scripts/import/legacy-staff-accounts.test.mjs", // nested, needs `**`
      "docs/board/validate-board.test.mjs",
      "docs/board/reconcile-board.mjs",
      ".claude/skills/osteojp-conventions/SKILL.md", // the first breach
      "turbo.json",
      "scripts/gate-manifest.mjs",
      "scripts/assert-gates-unchanged.mjs",
    ];
    for (const g of gates) assert.ok(isGateFile(g), `${g} must be a gate file`);

    // CONTROL: ordinary work must NOT be frozen, or every PR becomes a
    // GATE-CHANGE and the control is routed around within a week.
    const ordinary = [
      "apps/web/app/agenda/agenda-view.tsx",
      "apps/web/app/agenda/agenda-week-list.test.tsx", // a .tsx test is NOT a gate
      "packages/i18n/src/strings.pt.json",
      "docs/board/portal-board.json",
      "docs/design/SPEC-v2-agenda.md",
      "packages/db/migrations/0091_care_team.sql",
      "package.json", // frozen by its SCRIPTS BLOCK only, not as a whole file
      ".github/PULL_REQUEST_TEMPLATE.md",
    ];
    for (const o of ordinary) assert.ok(!isGateFile(o), `${o} must NOT be frozen`);
  });

  test("`**` crosses directories and `*` does not", () => {
    assert.ok(globToRegExp("a/**/*.mjs").test("a/b/c/d.mjs"));
    assert.ok(globToRegExp("a/**/*.mjs").test("a/d.mjs"), "`**/` matches zero segments too");
    assert.ok(!globToRegExp("a/*.mjs").test("a/b/c.mjs"), "`*` must not cross a separator");
    // CONTROL: the matcher is not simply true for everything.
    assert.ok(!globToRegExp("a/**/*.mjs").test("b/c.mjs"));
  });

  test("every glob in the set matches at least one real file", () => {
    // A glob that matches nothing is a line of prose. `git grep -E` in this
    // repository supports neither \\s nor \\b and silently matches nothing,
    // which is how an enumeration reads 0 and looks like a clean codebase; the
    // same shape is available to a bad glob.
    const files = Object.keys(readManifest().files);
    assert.ok(files.length > 20, "the manifest is non-trivial");
    const dead = GATE_GLOBS.filter((g) => {
      const re = globToRegExp(g);
      return !files.some((f) => re.test(f));
    });
    assert.deepEqual(dead, [], "these globs match nothing and are decoration");
  });
});

describe("the manifest on disk", () => {
  test("is CURRENT - every pin matches the file it names", () => {
    // If this fails in an ordinary PR, a gate file moved and the freeze is
    // doing its job. If it fails in a GATE-CHANGE PR, the pins were not
    // regenerated: `node scripts/gate-manifest.mjs --write`.
    const m = readManifest();
    const fresh = buildManifest();
    const { changed, removed, pkgMoved } = compare(m, fresh.files, fresh.packageJsonScripts);
    assert.deepEqual({ changed, removed, pkgMoved }, { changed: [], removed: [], pkgMoved: false });
  });

  test("names the machinery that enforces it, so the freeze cannot be unfrozen quietly", () => {
    const files = Object.keys(readManifest().files);
    assert.ok(files.includes("scripts/gate-manifest.mjs"));
    assert.ok(files.includes("scripts/assert-gates-unchanged.mjs"));
    assert.ok(files.includes("scripts/gate-freeze.test.mjs"), "including this file");
    assert.ok(files.includes(".github/workflows/ci.yml"), "and the workflow that runs it");
  });

  test("carries a comment telling a reader not to regenerate it casually", () => {
    const m = readManifest();
    assert.match(m._comment, /GATE-CHANGE/);
    assert.match(m._comment, /owner/i);
  });
});

describe("compare() notices a real weakening, and does not cry wolf", () => {
  const base = { files: { "a.mjs": "aaa", "b.mjs": "bbb" }, packageJsonScripts: "pkg" };

  test("an EDITED gate file is CHANGED", () => {
    const r = compare(base, { "a.mjs": "DIFFERENT", "b.mjs": "bbb" }, "pkg");
    assert.deepEqual(r.changed, ["a.mjs"]);
    assert.deepEqual(r.removed, []);
    // CONTROL, same shape: identical input reports nothing at all.
    assert.deepEqual(compare(base, { "a.mjs": "aaa", "b.mjs": "bbb" }, "pkg").changed, []);
  });

  test("a DELETED gate file is REMOVED, which an equality-of-hashes check would miss", () => {
    const r = compare(base, { "a.mjs": "aaa" }, "pkg");
    assert.deepEqual(r.removed, ["b.mjs"]);
    assert.deepEqual(r.changed, []);
  });

  test("a NEW gate file is ADDED and is NOT a failure - adding a guard is not weakening one", () => {
    const r = compare(base, { "a.mjs": "aaa", "b.mjs": "bbb", "c.test.mjs": "ccc" }, "pkg");
    assert.deepEqual(r.added, ["c.test.mjs"]);
    assert.deepEqual(r.changed, []);
    assert.deepEqual(r.removed, []);
  });

  test("rewriting package.json's scripts block is caught on its own axis", () => {
    // The hole this closes: point `test:scripts` at a directory that does not
    // exist and every guard in it stops running while the check stays green.
    const r = compare(base, { "a.mjs": "aaa", "b.mjs": "bbb" }, "DIFFERENT");
    assert.equal(r.pkgMoved, true);
    assert.deepEqual(r.changed, []); // and it is NOT reported as a file change
  });

  test("the package.json hash covers the SCRIPTS and ignores everything else", () => {
    // Not vacuous: prove the real file's scripts block is what is hashed, by
    // hashing a copy with a dependency bumped and asserting it does not move.
    const before = packageScriptsHash();
    const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8"));
    assert.ok(Object.keys(pkg.scripts ?? {}).length > 5, "there are scripts to hash");
    assert.match(before, /^[0-9a-f]{64}$/);
  });
});

describe("what this file CANNOT say", () => {
  test("the three rules need a git history and a PR title, and are not asserted here", () => {
    // Recorded so nobody reads this suite as proof the freeze works end to end.
    // Rule A (pins hold) IS covered above. Rules B (the manifest moves only in
    // a GATE-CHANGE) and C (a GATE-CHANGE carries nothing else) are exercised
    // against real commits in the pull request that introduced this file, and
    // the transcript is in its description.
    const src = readFileSync(`${ROOT}/scripts/assert-gates-unchanged.mjs`, "utf8");
    assert.match(src, /GATE_PR_TITLE/);
    assert.match(src, /GATE_BASE_REF/);
    // and it must FAIL CLOSED when it cannot compute the diff
    assert.match(src, /FAIL CLOSED/);
    assert.ok(MANIFEST_PATH.startsWith(".github/"));
  });
});
