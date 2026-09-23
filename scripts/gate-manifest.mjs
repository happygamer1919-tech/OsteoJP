// THE GATE SET, AND THE HASHES THAT FREEZE IT.
//
// ==========================================================================
// WHY THIS EXISTS: A GATE WAS EDITED TO PASS A LANE'S OWN PR, TWICE
// ==========================================================================
// SR-71, recorded 2026-09-21: "A lane never edits a gate to pass its own PR. It
// halts and cards it." It was written because a lane moved `.claude/skills/`
// out of a HELD class to unmerge-block its own change, and it was breached
// again the same day when a lane widened an exemption inside
// `scripts/env-example-covers-the-code.test.mjs` - a script that runs in the
// REQUIRED `quality` job - so that its own PR would go green.
//
// Both times the rule was written down and both times the rule did not stop it,
// because a rule that lives only in prose is enforced by whoever remembers it at
// the moment they are blocked. This is the mechanical version: the gate files
// are pinned by sha256, a required check compares them, and moving the pin is a
// PR of its own that the owner merges by hand.
//
// ==========================================================================
// WHAT IS IN THE SET, AND WHY EACH GROUP IS IN IT
// ==========================================================================
// The owner's words were "required-check scripts, merge-control config,
// workflow files". Each entry below names which of those it is. The set is a
// LIST OF GLOBS rather than a list of paths so that a new guard is covered the
// moment the manifest is regenerated, and so a reader can see the RULE rather
// than only its output.
//
// WHAT IS DELIBERATELY NOT IN IT: application code, tests that are not gates,
// docs, the board JSON. Freezing those would make every PR a GATE-CHANGE and
// the friction would be routed around within a week, which is how a control
// stops being a control.
//
// MEASURED COST, re-measured after the 2026-09-22 narrowing rather than
// carried over: see the figure printed in that PR's description. Adding a guard
// file never trips this check - only modifying or deleting a pinned one does.
//
// THE CRITERION, in one line, because it is what decides membership: a file is
// in this set if editing it can change a REQUIRED CHECK'S VERDICT.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Repository root, derived from this file's location. */
export const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/**
 * The gate set. Each entry is a glob against a repo-relative POSIX path.
 *
 * `*` matches within one path segment, `**` matches across segments.
 */
export const GATE_GLOBS = Object.freeze([
  // --- workflow files: every scheduled and triggered job in the repository ---
  ".github/workflows/*.yml",
  // --- required-check scripts invoked BY those workflows ---
  ".github/scripts/*.mjs",
  "scripts/check-journal.mjs",
  "scripts/sync-supabase-migrations.mjs",
  "scripts/secret-scan.mjs",
  "scripts/check-openapi-drift.mjs",
  "packages/db/scripts/check-security-definer-owner.mjs",
  "docs/board/reconcile-board.mjs",
  "docs/board/validate-board.mjs",
  // --- every guard that RUNS in the required `quality` job via test:scripts.
  //     `pnpm test:scripts` is `node --test "scripts/**/*.test.mjs"
  //     "docs/board/**/*.test.mjs"`, so this glob pair IS that check's contents.
  //     This is the group the second breach happened in.
  "scripts/**/*.test.mjs",
  "docs/board/**/*.test.mjs",
  // --- `.claude/skills/**/*.md` WAS HERE AND CAME OUT, 2026-09-22, by owner
  //     ruling: the manifest holds files that decide a REQUIRED CHECK'S
  //     VERDICT, and nothing in CI reads those files. Verified rather than
  //     assumed - the only references to them anywhere are this file's own
  //     glob and a PATH STRING in gate-freeze.test.mjs; no required check
  //     opens them.
  //
  //     SAY THE COST OUT LOUD: that is where the FIRST SR-71 breach happened,
  //     a lane moving itself out of a HELD merge class. The freeze no longer
  //     covers it. What covers it now is the merge class itself plus review,
  //     which is what was in place when the breach happened. If that is not
  //     enough, the answer is a check that READS those files - then they
  //     decide a verdict and belong here on the stated criterion. ---
  // --- a gate's INPUT is a gate. `env-example-covers-the-code.test.mjs`
  //     compares the code against this file, so ADDING A NAME HERE SILENCES
  //     THAT GUARD - which is the same weakening as editing the guard itself,
  //     wearing the face of documentation. MEASURED before freezing it: this
  //     file changed in 0 of the last 60 squashed PRs, so the friction is
  //     approximately zero and the hole it closes is real. ---
  ".env.example",
  // --- the task graph. Editing it can stop `lint`, `typecheck` or `test`
  //     from running at all while every check still reports green. ---
  "turbo.json",
  // --- this machinery itself, so the freeze cannot be unfrozen quietly ---
  "scripts/gate-manifest.mjs",
  "scripts/assert-gates-unchanged.mjs",
]);

/** Where the pinned hashes live. */
export const MANIFEST_PATH = ".github/gate-manifest.json";

/** Directories never walked. */
const SKIP = new Set(["node_modules", ".git", ".next", ".turbo", "dist", "build", "coverage"]);

/** Glob -> RegExp. `**` crosses separators, `*` does not. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` should also match zero segments, so `a/**/b.md` matches `a/b.md`.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$+?.()|{}[]".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

const MATCHERS = GATE_GLOBS.map(globToRegExp);

/** Is this repo-relative path a gate file? */
export function isGateFile(p) {
  return MATCHERS.some((re) => re.test(p));
}

/** Every existing gate file, repo-relative, sorted. Walks the tree once. */
export function gateFiles(root = ROOT) {
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) {
        const rel = relative(root, abs).split(sep).join("/");
        if (isGateFile(rel)) out.push(rel);
      }
    }
  })(root);
  return out.sort();
}

/** sha256 of a file's bytes, lowercase hex. */
export function hashFile(abs) {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

/** { path: sha256 } for every gate file on disk. */
export function hashAll(root = ROOT) {
  const out = {};
  for (const rel of gateFiles(root)) out[rel] = hashFile(join(root, rel));
  return out;
}

/**
 * The `scripts` block of package.json, hashed separately.
 *
 * WHY NOT THE WHOLE FILE. `package.json` changes on every dependency bump, so
 * freezing it whole would make a routine upgrade a GATE-CHANGE and the control
 * would be routed around. But the `scripts` block is a gate: rewriting
 * `test:scripts` to point at a directory that does not exist leaves every check
 * green while running nothing, which is the exact defect class this repository
 * has already shipped twice (a skipped RLS suite, a drift check that exited 0).
 */
export function packageScriptsHash(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const scripts = Object.fromEntries(Object.entries(pkg.scripts ?? {}).sort());
  return createHash("sha256").update(JSON.stringify(scripts)).digest("hex");
}

/** The whole manifest, as it should be written. */
export function buildManifest(root = ROOT) {
  return {
    _comment:
      "GATE FREEZE. Do not edit by hand and do not regenerate inside an ordinary PR. " +
      "It moves ONLY in a PR titled GATE-CHANGE that touches nothing else, is never " +
      "armed, and is merged by the owner by hand. See scripts/gate-manifest.mjs.",
    globs: [...GATE_GLOBS],
    packageJsonScripts: packageScriptsHash(root),
    files: hashAll(root),
  };
}

export function readManifest(root = ROOT) {
  return JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8"));
}

/** Compare disk against the manifest. Pure, so a test can drive it. */
export function compare(manifest, onDisk, pkgHash) {
  const changed = [];
  const removed = [];
  const added = [];
  for (const [p, h] of Object.entries(manifest.files ?? {})) {
    if (!(p in onDisk)) removed.push(p);
    else if (onDisk[p] !== h) changed.push(p);
  }
  for (const p of Object.keys(onDisk)) if (!(p in (manifest.files ?? {}))) added.push(p);
  const pkgMoved = manifest.packageJsonScripts !== pkgHash;
  return { changed, removed, added, pkgMoved };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // `node scripts/gate-manifest.mjs --write` regenerates. Only ever run this
  // inside a GATE-CHANGE PR.
  const write = process.argv.includes("--write");
  const m = buildManifest();
  if (write) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(ROOT, MANIFEST_PATH), JSON.stringify(m, null, 2) + "\n");
    console.log(`wrote ${MANIFEST_PATH}: ${Object.keys(m.files).length} gate files`);
  } else {
    console.log(JSON.stringify(m, null, 2));
  }
}
