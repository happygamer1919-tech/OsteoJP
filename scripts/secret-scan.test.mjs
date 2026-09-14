// PROVES THE PRE-PUSH SECRET SCAN FAILS CLOSED, BY PUSHING.
//
// The incident this answers (scripts/secret-scan.mjs, header): a scan whose
// pattern did not compile exited 128, and a `;` ran the push anyway. So the
// proofs below are not "the function returns 2". They build a real repository
// with a real bare remote, activate the real hook, run `git push`, and then ask
// the REMOTE whether the branch arrived. A scan that reports failure while the
// push lands is the exact defect, and only the remote can tell the two apart.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PATTERNS, addedLines, compilePatterns, main, scanLines, selfTest } from "./secret-scan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNER = join(ROOT, "scripts/secret-scan.mjs");
const HOOK = join(ROOT, "scripts/git-hooks/pre-push");

const sample = (name) => PATTERNS.find((p) => p.name === name).positive();

/** git with an identity and no signing, whatever the machine's global config says. */
function git(cwd, ...args) {
  return spawnSync(
    "git",
    ["-c", "user.name=scan-test", "-c", "user.email=scan-test@example.test", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
}

function ok(r, what) {
  assert.equal(r.status, 0, `${what} failed: ${r.stderr}`);
  return r;
}

/**
 * A work clone with a bare remote. main carries the scanner and the hook and is
 * already pushed; the hook is then activated and a `feature` branch checked out.
 * `scannerSource` replaces the scanner the clone carries, for the broken-pattern arm.
 */
function fixture(t, { scannerSource } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "secret-scan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = join(dir, "remote.git");
  const work = join(dir, "work");
  ok(git(dir, "init", "-q", "--bare", "-b", "main", remote), "init bare");
  ok(git(dir, "init", "-q", "-b", "main", work), "init work");
  ok(git(work, "remote", "add", "origin", remote), "remote add");
  mkdirSync(join(work, "scripts/git-hooks"), { recursive: true });
  writeFileSync(join(work, "scripts/secret-scan.mjs"), scannerSource ?? readFileSync(SCANNER, "utf8"));
  copyFileSync(HOOK, join(work, "scripts/git-hooks/pre-push"));
  chmodSync(join(work, "scripts/git-hooks/pre-push"), 0o755);
  writeFileSync(join(work, "README.md"), "base\n");
  ok(git(work, "add", "-A"), "add base");
  ok(git(work, "commit", "-q", "-m", "base"), "commit base");
  ok(git(work, "push", "-q", "origin", "main"), "push base");
  ok(git(work, "config", "core.hooksPath", "scripts/git-hooks"), "activate hook");
  ok(git(work, "checkout", "-q", "-b", "feature"), "branch");
  return { work, remote };
}

function commitFile(work, path, content) {
  mkdirSync(dirname(join(work, path)), { recursive: true });
  writeFileSync(join(work, path), content);
  ok(git(work, "add", "-A"), "add");
  ok(git(work, "commit", "-q", "-m", `add ${path}`), "commit");
}

const pushFeature = (work) => git(work, "push", "origin", "feature");
const remoteHasFeature = (remote) => git(remote, "rev-parse", "--verify", "-q", "refs/heads/feature").status === 0;

// ---------------------------------------------------------------------------
// THE PUSH ARMS. Each one ends by asking the remote.
// ---------------------------------------------------------------------------

test("a clean branch pushes, and the scan says what it read", (t) => {
  const { work, remote } = fixture(t);
  commitFile(work, "docs/note.md", "An ordinary line.\nsha256 fdfe843574f128c0f6ee6732a5543f13ec6e35f793455bf7e0c857f18eb14744\n");
  const r = pushFeature(work);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout + r.stderr, /secret-scan: clean\. 2 added line\(s\) in 1 file\(s\)/);
  assert.equal(remoteHasFeature(remote), true);
});

test("a branch adding a secret-shaped line is refused, and the remote never receives it", (t) => {
  const { work, remote } = fixture(t);
  const secret = sample("jwt");
  commitFile(work, "apps/web/.env.local.example.md", `SUPABASE_SERVICE_ROLE_KEY=${secret}\n`);
  const r = pushFeature(work);
  assert.notEqual(r.status, 0, "the push must fail");
  assert.equal(remoteHasFeature(remote), false, "THE BRANCH REACHED THE REMOTE");
  assert.match(r.stderr, /apps\/web\/\.env\.local\.example\.md:1 {2}jwt/);
  assert.equal(r.stderr.includes(secret), false, "the scan printed the value it found");
});

test("A PATTERN THAT DOES NOT COMPILE BLOCKS THE PUSH - the 2026-09-13 incident, replayed", (t) => {
  const anchor = "export const PATTERNS = [";
  const source = readFileSync(SCANNER, "utf8");
  assert.ok(source.includes(anchor), "anchor moved; this arm would no longer inject anything");
  const broken = source.replace(
    anchor,
    `${anchor}\n  { name: "perl-lookahead-in-a-broken-engine", source: "(?<", positive: () => "x", negative: () => "y" },`,
  );
  const { work, remote } = fixture(t, { scannerSource: broken });
  commitFile(work, "docs/note.md", "nothing secret here\n");
  const r = pushFeature(work);
  assert.notEqual(r.status, 0, "an errored scan let the push through");
  assert.equal(remoteHasFeature(remote), false, "THE BRANCH REACHED THE REMOTE");
  assert.match(r.stderr, /pattern "perl-lookahead-in-a-broken-engine" does not compile/);
  assert.match(r.stderr, /THE PUSH IS BLOCKED/);
});

test("a scan that cannot find its base blocks the push instead of scanning nothing", (t) => {
  const { work, remote } = fixture(t);
  commitFile(work, "docs/note.md", "nothing secret here\n");
  ok(git(work, "update-ref", "-d", "refs/remotes/origin/main"), "drop origin/main");
  const r = pushFeature(work);
  assert.notEqual(r.status, 0);
  assert.equal(remoteHasFeature(remote), false, "THE BRANCH REACHED THE REMOTE");
  assert.match(r.stderr, /the scan did not run: git merge-base/);
});

test("a committed .env file is refused; .env.example is not", (t) => {
  const { work, remote } = fixture(t);
  commitFile(work, ".env.example", "NEXT_PUBLIC_SUPABASE_URL=\n");
  assert.equal(pushFeature(work).status, 0);
  commitFile(work, "apps/web/.env.local", "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n");
  const r = pushFeature(work);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /apps\/web\/\.env\.local {2}committed-env-file/);
  const pushed = git(remote, "rev-parse", "refs/heads/feature").stdout.trim();
  const local = git(work, "rev-parse", "HEAD").stdout.trim();
  assert.notEqual(pushed, local, "the .env commit reached the remote");
});

// ---------------------------------------------------------------------------
// THE PATTERNS, ONE BY ONE.
// ---------------------------------------------------------------------------

test("every shipped pattern compiles, matches its positive sample and not its negative one", () => {
  assert.doesNotThrow(() => selfTest(compilePatterns(PATTERNS)));
});

test("a pattern that compiles but matches nothing is refused before any line is read", () => {
  const dead = compilePatterns([{ name: "dead", source: "a^b", positive: () => "ab", negative: () => "c" }]);
  assert.throws(() => selfTest(dead), /does not match its own positive sample/);
  assert.throws(() => selfTest([]), /no patterns/);
});

test("the shapes that are not secrets stay clean", () => {
  const compiled = compilePatterns(PATTERNS);
  const lines = [
    // The 2026-09-13 post-push false positive: a sha256 in a board card.
    "sha256 fdfe843574f128c0f6ee6732a5543f13ec6e35f793455bf7e0c857f18eb14744",
    "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
    "      SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,",
    '      E2E_ADMIN_PASSWORD: "E2ePassw0rd!",',
    `ANON=${PATTERNS.find((p) => p.name === "jwt").negative()}`,
    // THE CALIBRATION SET: shapes the first cut flagged across 583 commits of
    // origin/main, every one a fixture. Verbatim from the files that carry them.
    'const CONFIRM_CODE_SECRET = "e2e-confirm-code-hmac-key-not-a-secret";',
    "postgresql://u:p@prod.example.com/db",
    "postgresql://postgres.${LIVE}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
    "postgresql://user:p@ss@prod.example.com:5432/db",
    "postgresql://postgres.abcdefghijklmnop:pa@ssw0rd@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
    "postgres://postgres.${PROD_REF}:s3cr3t-do-not-print@db.example.invalid:5432/postgres",
    "postgresql://postgres.abc:sekrit-value@db.example.invalid:5432/postgres",
    "postgresql://postgres.${ref}:redacted@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
  ].map((text, i) => ({ file: "x", line: i + 1, text }));
  assert.deepEqual(scanLines(lines, compiled), []);
});

test("each positive sample is found, on its own line, by its own pattern", () => {
  const compiled = compilePatterns(PATTERNS);
  for (const p of PATTERNS) {
    const found = scanLines([{ file: "f", line: 7, text: `value ${p.positive()} end` }], compiled);
    assert.ok(
      found.some((f) => f.pattern === p.name && f.line === 7),
      `${p.name} did not find its own sample`,
    );
  }
});

test("added lines carry their new line numbers, and a '++ ' line is content, not a header", () => {
  const diff = [
    "diff --git a/a.md b/a.md",
    "index 1..2 100644",
    "--- a/a.md",
    "+++ b/a.md",
    "@@ -3,0 +4,2 @@",
    "+first",
    "+++ still content",
    "diff --git a/img.png b/img.png",
    "Binary files /dev/null and b/img.png differ",
  ].join("\n");
  const { lines, binary } = addedLines(diff);
  assert.deepEqual(lines, [
    { file: "a.md", line: 4, text: "first" },
    { file: "a.md", line: 5, text: "++ still content" },
  ]);
  assert.equal(binary, 1);
});

test("unreadable pre-push input is an error, not an empty scan", () => {
  const errors = [];
  const code = main(["--pre-push"], { cwd: ROOT, readStdin: () => "garbage\n", log: () => {}, err: (m) => errors.push(m) });
  assert.equal(code, 2);
  assert.match(errors.join("\n"), /unreadable pre-push line/);
});
