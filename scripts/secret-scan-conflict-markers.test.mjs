// R3 (strategy, 2026-10-25): A PUSH CARRYING A CONFLICT MARKER IS REFUSED.
//
// Two layers. The rules are tested on added lines directly: git's marker lines
// are findings, a marker quoted inside a line is not (docs/DECISIONS.md does
// that in its prose), and a lone ======= line is not (a Markdown heading
// underline) unless the same file also carries a real marker.
//
// The check lives in scripts/secret-scan.mjs, which every clone's pre-push hook
// already runs and CI runs on every PR's added lines.
//
// Then THE REAL THING: a throwaway repository with a local bare remote, this
// repository's own scripts/git-hooks/pre-push and scripts/secret-scan.mjs
// copied in, and `git push` run for real. Git must refuse the push that adds a
// marker and accept the clean one. A scanner copy with the marker check taken
// out is shown to let the marker through, so a green run here is not a harness
// that cannot tell. Nothing leaves the machine: the remote is a directory.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markerFindings } from "./secret-scan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const L = (file, line, text) => ({ file, line, text });

test("git's marker lines are findings", () => {
  const f = markerFindings([
    L("a.md", 1, "<<<<<<< HEAD"),
    L("a.md", 2, "ours"),
    L("a.md", 3, "======="),
    L("a.md", 4, "theirs"),
    L("a.md", 5, ">>>>>>> origin/main"),
  ]);
  assert.deepEqual(f.map((x) => x.line), [1, 3, 5]);
});

test("bare markers and the diff3 base marker are findings", () => {
  const f = markerFindings([L("b.ts", 1, "<<<<<<<"), L("b.ts", 2, "||||||| base"), L("b.ts", 3, ">>>>>>>")]);
  assert.equal(f.length, 3);
});

test("a marker QUOTED inside a line is not a finding (the DECISIONS.md prose)", () => {
  const f = markerFindings([
    L("docs/DECISIONS.md", 1, "behind when the `<<<<<<<`/`=======`/`>>>>>>>` markers were stripped."),
    L("docs/DECISIONS.md", 2, "  <<<<<<< indented is not git's marker"),
    L("docs/DECISIONS.md", 3, "<<<<<<<< eight is not git's marker"),
  ]);
  assert.deepEqual(f, []);
});

test("a lone ======= line is a heading underline, not a finding", () => {
  assert.deepEqual(markerFindings([L("c.md", 1, "Heading"), L("c.md", 2, "=======")]), []);
});

test("a ======= line counts when the same file carries a real marker, and only that file", () => {
  const f = markerFindings([L("d.md", 1, "======="), L("d.md", 2, ">>>>>>> b"), L("e.md", 1, "=======")]);
  assert.deepEqual(f.map((x) => `${x.file}:${x.line}`), ["d.md:1", "d.md:2"]);
});

// ---------------------------------------------------------------------------
// The real push.
// ---------------------------------------------------------------------------

function sh(cwd, args, env = {}) {
  const r = spawnSync("git", ["-c", "user.name=r3-test", "-c", "user.email=r3-test@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function must(r, what) {
  assert.equal(r.status, 0, `${what} failed:\n${r.out}`);
  return r;
}

/** A work repo whose origin is a local bare repo, main pushed, then the hook activated. */
function sandbox({ scanner = readFileSync(join(ROOT, "scripts/secret-scan.mjs"), "utf8") } = {}) {
  const top = mkdtempSync(join(tmpdir(), "r3-push-"));
  const bare = join(top, "remote.git");
  const work = join(top, "work");
  must(sh(top, ["init", "-q", "--bare", "-b", "main", bare]), "init bare");
  must(sh(top, ["init", "-q", "-b", "main", work]), "init work");
  mkdirSync(join(work, "scripts/git-hooks"), { recursive: true });
  writeFileSync(join(work, "scripts/secret-scan.mjs"), scanner);
  copyFileSync(join(ROOT, "scripts/git-hooks/pre-push"), join(work, "scripts/git-hooks/pre-push"));
  chmodSync(join(work, "scripts/git-hooks/pre-push"), 0o755);
  writeFileSync(join(work, "README.md"), "throwaway\n");
  must(sh(work, ["add", "-A"]), "add");
  must(sh(work, ["commit", "-q", "-m", "base"]), "commit base");
  must(sh(work, ["remote", "add", "origin", bare]), "remote");
  // The first push carries no hook: there is no origin/main yet to scan from.
  must(sh(work, ["push", "-q", "origin", "main"]), "first push");
  must(sh(work, ["fetch", "-q", "origin"]), "fetch");
  must(sh(work, ["config", "core.hooksPath", "scripts/git-hooks"]), "activate the hook in the throwaway repo");
  return { top, work };
}

function commitOnBranch(work, branch, file, body) {
  must(sh(work, ["switch", "-q", "-c", branch, "origin/main"]), "branch");
  mkdirSync(dirname(join(work, file)), { recursive: true });
  writeFileSync(join(work, file), body);
  must(sh(work, ["add", file]), "add");
  must(sh(work, ["commit", "-q", "-m", `change ${file}`]), "commit");
}

const CONFLICTED = "intro\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> origin/main\n";
const CLEAN_WITH_QUOTES = "Heading\n=======\n\nThe `<<<<<<<`/`=======`/`>>>>>>>` markers are quoted, not left behind.\n";

test("GATE: git REFUSES a push that adds a conflict marker", () => {
  const { top, work } = sandbox();
  try {
    commitOnBranch(work, "feat/conflicted", "docs/DECISIONS.md", CONFLICTED);
    const r = sh(work, ["push", "origin", "feat/conflicted"]);
    assert.notEqual(r.status, 0, `the push went through:\n${r.out}`);
    assert.match(r.out, /secret-scan: 3 finding\(s\)\. THE PUSH IS BLOCKED\./);
    assert.match(r.out, /docs\/DECISIONS\.md:2  conflict-marker/);
    assert.match(r.out, /docs\/DECISIONS\.md:4  conflict-marker/);
    assert.match(r.out, /docs\/DECISIONS\.md:6  conflict-marker/);
    assert.match(r.out, /disarm it before you push the repair \(R3\)/);
    assert.equal(sh(work, ["ls-remote", "--exit-code", "--heads", "origin", "feat/conflicted"]).status, 2, "the branch reached the remote");
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});

test("git REFUSES a marker added on top of a branch the remote already has", () => {
  const { top, work } = sandbox();
  try {
    commitOnBranch(work, "feat/later", "notes.md", "fine\n");
    must(sh(work, ["push", "-q", "origin", "feat/later"]), "clean first push");
    writeFileSync(join(work, "notes.md"), "fine\n>>>>>>> theirs\n");
    must(sh(work, ["commit", "-q", "-am", "oops"]), "commit");
    const r = sh(work, ["push", "origin", "feat/later"]);
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /notes\.md:2  conflict-marker/);
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});

test("git ACCEPTS a clean push, quoted markers and a heading underline included", () => {
  const { top, work } = sandbox();
  try {
    commitOnBranch(work, "feat/clean", "docs/DECISIONS.md", CLEAN_WITH_QUOTES);
    const r = sh(work, ["push", "origin", "feat/clean"]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /secret-scan: clean\./);
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});

test("SEEDED FAILURE: a scanner with the marker check removed lets the marker through", () => {
  const real = readFileSync(join(ROOT, "scripts/secret-scan.mjs"), "utf8");
  const disarmed = real.replace("findings.push(...markerFindings(added.lines));", "");
  assert.notEqual(disarmed, real, "the scanner's shape changed; the seeded mutation did not apply");
  const { top, work } = sandbox({ scanner: disarmed });
  try {
    commitOnBranch(work, "feat/conflicted", "a.md", CONFLICTED);
    const r = sh(work, ["push", "origin", "feat/conflicted"]);
    assert.equal(r.status, 0, `the disarmed hook still refused, so the test cannot tell:\n${r.out}`);
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});

test("CI runs the same scan on every PR's added lines, so the marker check is a required check too", () => {
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /node scripts\/secret-scan\.mjs --range \$\{\{ github\.event\.pull_request\.base\.sha \}\}\.\.\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  const hook = readFileSync(join(ROOT, "scripts/git-hooks/pre-push"), "utf8");
  assert.match(hook, /exec node scripts\/secret-scan\.mjs --pre-push/);
});
