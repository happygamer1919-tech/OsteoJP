/**
 * R17 (strategy, 2026-10-26): every rehearsal and throwaway script refuses to
 * run when its working directory resolves under osteojp-prod-apply.
 *
 * WHAT THESE TESTS ARE FOR. The guard (scripts/refuse-prod-apply-cwd.mjs) is
 * only worth anything if every script that should carry it does, and calls it
 * before anything else happens. So besides the rule itself, every guarded
 * script is SPAWNED with its working directory inside a fake checkout named
 * osteojp-prod-apply, and must print exactly the REFUSE line, print nothing on
 * stdout, leave the directory empty and exit with the refusal code. Remove the
 * call from any one of them and its case fails: each script without the guard
 * goes on to a usage line, a missing-variable line or a stack trace instead.
 *
 * The fake checkout lives under the OS temp directory. Nothing here names, or
 * goes near, the real one: the guard matches the directory NAME, which is the
 * point.
 *
 * The negative arms: a sibling named osteojp-prod-apply-other and an ordinary
 * directory are not refused, and the apply lane's own programs (which must run
 * in that checkout) do not carry the guard.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROD_APPLY_SEGMENT,
  REFUSE_EXIT_CODE,
  isUnderProdApply,
  pathArguments,
  physicalPath,
  prodApplyHit,
  refuseProdApplyCwd,
} from "./refuse-prod-apply-cwd.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX = path.join(ROOT, "packages/db/node_modules/.bin/tsx");

// The fake world. BASE is physical so expected paths compare exactly.
const BASE = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "r17-")));
const PROD = path.join(BASE, PROD_APPLY_SEGMENT);
const NESTED = path.join(PROD, "sub", "deeper");
const OTHER = path.join(BASE, `${PROD_APPLY_SEGMENT}-other`);
const NORMAL = path.join(BASE, "normal-worktree");
const LINK = path.join(BASE, "link-into-it");
for (const d of [NESTED, OTHER, NORMAL]) fs.mkdirSync(d, { recursive: true });
fs.symlinkSync(PROD, LINK, "dir");
test.after(() => fs.rmSync(BASE, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

test("the checkout itself and a directory nested below it are refused", () => {
  assert.equal(prodApplyHit({ cwd: PROD, argv: [] }), PROD);
  assert.equal(prodApplyHit({ cwd: NESTED, argv: [] }), NESTED);
  assert.equal(isUnderProdApply(path.join(PROD, "not-created-yet", "x")), true);
});

test("a symlink into it, and a `..` walk into it, are refused at the physical path", () => {
  assert.equal(prodApplyHit({ cwd: LINK, argv: [] }), PROD);
  assert.equal(prodApplyHit({ cwd: path.join(LINK, "sub", "deeper"), argv: [] }), NESTED);
  assert.equal(prodApplyHit({ cwd: path.join(NORMAL, "..", PROD_APPLY_SEGMENT, "sub"), argv: [] }), path.join(PROD, "sub"));
});

test("a sibling whose name only starts with it, an ordinary directory and this repository are not refused", () => {
  assert.equal(prodApplyHit({ cwd: OTHER, argv: [] }), null);
  assert.equal(prodApplyHit({ cwd: path.join(OTHER, "x"), argv: [] }), null);
  assert.equal(prodApplyHit({ cwd: NORMAL, argv: [] }), null);
  assert.equal(prodApplyHit({ cwd: ROOT, script: import.meta.url, argv: [] }), null);
  assert.equal(isUnderProdApply(path.join(BASE, `x${PROD_APPLY_SEGMENT}`)), false);
});

test("letter case is compared on the path the file system holds", () => {
  const typed = path.join(BASE, PROD_APPLY_SEGMENT.toUpperCase());
  // On a case-insensitive volume (the Mac) the typed path IS the checkout and
  // must be refused; where it does not exist it is a different directory.
  const sameDir = fs.existsSync(typed);
  assert.equal(prodApplyHit({ cwd: typed, argv: [] }), sameDir ? PROD : null);
  if (sameDir) assert.equal(physicalPath(typed), PROD);
});

test("the script's own location and a --cwd, --root or --repo-root argument are checked too", () => {
  assert.equal(prodApplyHit({ cwd: NORMAL, script: path.join(PROD, "scripts", "x.mjs"), argv: [] }), path.join(PROD, "scripts", "x.mjs"));
  assert.equal(prodApplyHit({ cwd: NORMAL, script: new URL(`file://${path.join(LINK, "y.mjs")}`).href, argv: [] }), path.join(PROD, "y.mjs"));
  assert.equal(prodApplyHit({ cwd: NORMAL, argv: ["--cwd", NESTED] }), NESTED);
  assert.equal(prodApplyHit({ cwd: NORMAL, argv: [`--repo-root=${LINK}`] }), PROD);
  assert.equal(prodApplyHit({ cwd: NORMAL, argv: ["--root", PROD] }), PROD);
  assert.equal(prodApplyHit({ cwd: NORMAL, argv: [], paths: [NESTED] }), NESTED);
  assert.equal(prodApplyHit({ cwd: NORMAL, argv: ["--cwd", OTHER, "--rooted", PROD] }), null);
  assert.deepEqual(pathArguments(["--cwd", "a", "--root=b", "--repo-root", "c", "--cwdx", "d", "--cwd"]), ["a", "b", "c"]);
});

test("a refusal is one stderr line and the refusal code; a pass is silent", () => {
  const calls = [];
  const io = { write: (s) => calls.push(["write", s]), exit: (c) => calls.push(["exit", c]) };
  refuseProdApplyCwd(path.join(ROOT, "scripts", "lane-stack.mjs"), { cwd: NESTED, argv: [], ...io });
  assert.deepEqual(calls, [
    ["write", `REFUSE: scripts/lane-stack.mjs does not run in the production apply checkout (${NESTED}).\n`],
    ["exit", REFUSE_EXIT_CODE],
  ]);
  calls.length = 0;
  refuseProdApplyCwd(path.join(ROOT, "scripts", "lane-stack.mjs"), { cwd: PROD, argv: [], code: 1, ...io });
  assert.deepEqual(calls.at(-1), ["exit", 1]);
  calls.length = 0;
  refuseProdApplyCwd(path.join(ROOT, "scripts", "lane-stack.mjs"), { cwd: OTHER, argv: [], ...io });
  assert.deepEqual(calls, []);
  assert.equal(REFUSE_EXIT_CODE, 86);
});

// ---------------------------------------------------------------------------
// Every guarded script, spawned inside the fake checkout
// ---------------------------------------------------------------------------

// [repo path, exit code]. rehearsal-import.ts passes 1: the import tooling's
// exit codes are fixed at 0, 1, 2 by CLAUDE.md, and 1 is its "refused".
const GUARDED = [
  ["scripts/lane-stack.mjs", 86],
  ["scripts/perf-name-search.mjs", 86],
  ["scripts/perf-note-previews.mjs", 86],
  ["scripts/perf-seed-admin-stats.mjs", 86],
  ["scripts/perf-seed-agenda-week.mjs", 86],
  ["scripts/perf-seed-loadtest.mjs", 86],
  ["scripts/twilio-smoke.mjs", 86],
  ["scripts/ingestion-sign.mjs", 86],
  ["scripts/generate-pwa-icons.mjs", 86],
  ["scripts/merge-on-green.sh", 86],
  ["packages/db/scripts/clinic-batch-20260910-simulation.mjs", 86],
  ["packages/db/scripts/rehearsal-import.ts", 1],
  ["packages/db/seed/appointments-dev.ts", 86],
  ["packages/db/seed/availability-dev.ts", 86],
  ["packages/db/seed/dev-reference.ts", 86],
  ["packages/db/seed/episodes-dev.ts", 86],
  ["packages/db/seed/patients-dev.ts", 86],
  ["packages/db/seed/location-cleanup.ts", 86],
  ["packages/db/seed/working-hours-real.ts", 86],
  ["packages/db/seed/wave08-catalog-dryrun.ts", 86],
];

// The programs the apply lane runs IN that checkout, the libraries they import,
// and the owner-run production tools: none of them may carry the guard.
const PRODUCTION_PROGRAMS = [
  "packages/db/scripts/verified-migrate.mjs",
  "packages/db/scripts/read-applied-migrations.mjs",
  "packages/db/scripts/check-pending-migrations.mjs",
  "packages/db/scripts/check-migration-tables.mjs",
  "packages/db/scripts/check-migration-columns.mjs",
  "packages/db/scripts/check-migration-functions.mjs",
  "packages/db/scripts/check-guest-requests-grant.mjs",
  "packages/db/scripts/check-security-definer-owner.mjs",
  "packages/db/scripts/staff-11-jp-one-clinic-check.mjs",
  "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs",
  "packages/db/scripts/obs-05-backfill-emit.mjs",
  "packages/db/scripts/w13-04-set-patient-bookable.mjs",
  "packages/db/scripts/prod-import.ts",
  "packages/db/scripts/import-core.ts",
  "packages/db/seed/seed-guard.ts",
  "scripts/assert-production-target.mjs",
  "scripts/production-target.mjs",
  "scripts/check-journal.mjs",
  "scripts/sync-supabase-migrations.mjs",
];

/** Spawn a script by its kind, with an environment that reaches nothing. */
function spawnScript(rel, cwd, file = path.join(ROOT, rel)) {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: BASE, NO_COLOR: "1" };
  const [cmd, args] = rel.endsWith(".sh")
    ? ["bash", ["--noprofile", "--norc", file]]
    : rel.endsWith(".ts")
      ? [TSX, [file]]
      : [process.execPath, [file]];
  return spawnSync(cmd, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
}

const show = (r) => `\n  status ${r.status} signal ${r.signal}\n  stdout: ${JSON.stringify(r.stdout)}\n  stderr: ${JSON.stringify(r.stderr)}`;

for (const [rel, code] of GUARDED) {
  test(`${rel} refuses first when started inside the apply checkout`, () => {
    const cwd = fs.mkdtempSync(path.join(NESTED, "run-"));
    const r = spawnScript(rel, cwd);
    const line = `REFUSE: ${rel} does not run in the production apply checkout (${cwd}).\n`;
    assert.equal(r.stderr, line, "stderr is not exactly the REFUSE line" + show(r));
    assert.equal(r.stdout, "", "something ran before the guard" + show(r));
    assert.equal(r.status, code, show(r));
    assert.deepEqual(fs.readdirSync(cwd), [], "the script left something in the directory");
  });
}

test("a guarded script started from elsewhere, but living in the apply checkout, is refused", () => {
  const scripts = path.join(PROD, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  for (const f of ["lane-stack.mjs", "refuse-prod-apply-cwd.mjs", "merge-on-green.sh"]) {
    fs.copyFileSync(path.join(ROOT, "scripts", f), path.join(scripts, f));
  }
  const node = spawnScript("scripts/lane-stack.mjs", NORMAL, path.join(LINK, "scripts", "lane-stack.mjs"));
  assert.equal(node.status, REFUSE_EXIT_CODE, show(node));
  assert.equal(node.stderr, `REFUSE: scripts/lane-stack.mjs does not run in the production apply checkout (${path.join(scripts, "lane-stack.mjs")}).\n`, show(node));
  const sh = spawnScript("scripts/merge-on-green.sh", NORMAL, path.join(LINK, "scripts", "merge-on-green.sh"));
  assert.equal(sh.status, REFUSE_EXIT_CODE, show(sh));
  assert.equal(sh.stderr, `REFUSE: scripts/merge-on-green.sh does not run in the production apply checkout (${scripts}).\n`, show(sh));
});

test("a symlinked working directory into the checkout is refused, by node and by the shell check", () => {
  const node = spawnScript("scripts/lane-stack.mjs", LINK);
  assert.equal(node.status, REFUSE_EXIT_CODE, show(node));
  assert.match(node.stderr, new RegExp(`\\(${PROD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\.\\n$`));
  const sh = spawnScript("scripts/merge-on-green.sh", path.join(LINK, "sub"));
  assert.equal(sh.status, REFUSE_EXIT_CODE, show(sh));
  assert.equal(sh.stderr, `REFUSE: scripts/merge-on-green.sh does not run in the production apply checkout (${path.join(PROD, "sub")}).\n`, show(sh));
});

test("NEGATIVE ARM: started in a sibling or an ordinary directory, a guarded script is not refused", () => {
  for (const cwd of [OTHER, NORMAL]) {
    // No arguments: lane-stack prints its usage, merge-on-green its usage (exit 3).
    for (const rel of ["scripts/lane-stack.mjs", "scripts/merge-on-green.sh"]) {
      const r = spawnScript(rel, cwd);
      assert.notEqual(r.status, REFUSE_EXIT_CODE, `${rel} in ${cwd}` + show(r));
      assert.doesNotMatch(r.stderr, /^REFUSE:/m, `${rel} in ${cwd}` + show(r));
    }
  }
});

test("the list above is every file that carries the guard, and no apply lane program carries it", () => {
  const carriers = spawnSync("git", ["grep", "-l", "-E", "refuseProdApplyCwd\\(import\\.meta\\.url|production apply checkout \\(\\$\\{r17_dir\\}\\)", "--", "scripts", "packages", "apps", "docs"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(carriers.status, 0, carriers.stderr);
  const found = carriers.stdout.split("\n").filter(Boolean).filter((f) => !f.endsWith(".test.mjs")).sort();
  assert.deepEqual(found, GUARDED.map(([rel]) => rel).sort());
  for (const rel of PRODUCTION_PROGRAMS) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is gone: update this list`);
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, rel), "utf8"), /refuse-prod-apply-cwd|osteojp-prod-apply\/\*/, `${rel} runs in the apply checkout and must not carry the guard`);
  }
});
