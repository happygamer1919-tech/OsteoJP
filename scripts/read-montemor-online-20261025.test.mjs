// MN-READ (2026-10-25): the read-only Montemor read, its document and its one block agree with each
// other, the read writes nothing, and every halt in the block is explicit, proven by fault injection.
//
// WHAT THIS PROVES, with no database:
//   * the document pins the real read, guard and module, and the sidecar pins the document;
//   * the read writes nothing: no INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP, ALTER, CREATE, GRANT,
//     REVOKE, COPY, CALL, DO, SET or transaction control of its own; it runs inside the block's
//     `begin read only` and its verdict 0 reads the transaction's setting;
//   * the read prints no column that holds a person: it never selects a name, phone, email, address,
//     note, patient id or user id;
//   * the block: line 2 is `set -o pipefail`, no `set -e`, no `#` line, no backslash continuation; its
//     only psql call is `begin read only` ... `rollback`; it carries exactly its two PENDING value lines
//     and STOPs on them before anything runs;
//   * EVERY HALT IS EXPLICIT: the block runs in GREEN's tool shape (`true && eval '<block>' < /dev/null
//     && echo TOOL-CHAIN-CONTINUED`), every external command a stub, and each call is made to fail in
//     turn: each run ends with exit 1, exactly one STOP line, no pass line, and the tool chain stopped;
//   * the block passes only on the profile 3 OK / 0 VACUOUS / 0 FAIL with an MN_ONLINE row, and STOPs
//     on a VACUOUS, a FAIL, a missing MN_ONLINE row, a transaction that is not read only, a pinned file
//     that differs, a dirty worktree, and a merge commit that is not on origin/main.
// Under bash always; under zsh wherever zsh is installed (it is not on the GitHub runner).
//
// WHAT IT DOES NOT PROVE: that the read runs against a database. That is the rehearsal in the document.
//
// Run: node --test scripts/read-montemor-online-20261025.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const DOC_PATH = "docs/read-montemor-online-20261025.md";
const SIDECAR = "docs/read-montemor-online-20261025.sha256";
const READ_PATH = "scripts/db/read-montemor-online-20261025.sql";
const GUARD = "scripts/assert-production-target.mjs";
const MODULE = "scripts/production-target.mjs";
const APPLY_DIR = "/Users/ivan/Projects/GitHub/osteojp-prod-apply";
const ENV_FILE = "/Users/ivan/osteojp-secrets/new-prod.env";
const MERGED = "a".repeat(40);

const doc = read(DOC_PATH);
const sql = read(READ_PATH);

/** The one fenced block under "## THE BLOCK". */
function theBlock(md) {
  const at = md.indexOf("## THE BLOCK");
  assert.ok(at >= 0, "the document has no THE BLOCK section");
  const m = md.slice(at).match(/```\n([\s\S]*?)\n```/);
  assert.ok(m, "THE BLOCK section has no fenced block");
  return m[1];
}
const block = theBlock(doc);

test("the sidecar pins the document", () => {
  const line = read(SIDECAR).trim();
  assert.equal(line, `${sha256(doc)}  ${DOC_PATH}`);
});

test("the document pins the real read, guard and module, in its table and in the block", () => {
  for (const [path, varName] of [[READ_PATH, "SHAREAD"], [GUARD, "SHAGUARD"], [MODULE, "SHAPTM"]]) {
    const s = sha256(read(path));
    assert.ok(block.includes(`${varName}=${s}\n`), `the block's ${varName} is not ${path}'s sha256`);
    assert.ok(doc.slice(0, doc.indexOf("## THE BLOCK")).includes(s), `the pins table does not carry ${path}'s sha256`);
  }
});

test("the read writes nothing and controls no transaction of its own", () => {
  const code = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
  const forbidden = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|set|begin|commit|rollback|savepoint|lock|vacuum|analyze|refresh|notify|listen|prepare|execute)\b/i;
  const hit = code.match(forbidden);
  assert.equal(hit, null, `the read carries a statement word it must not: ${hit && hit[0]}`);
  assert.match(code, /current_setting\(''\)|current_setting\('transaction_read_only'\)/);
  assert.ok(sql.includes("current_setting('transaction_read_only')"), "verdict 0 must read the transaction's own setting");
});

test("the read never names a column that holds a person", () => {
  const code = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(code, /\b(full_name|phone|email|address|notes|nif|patient_id|practitioner_id|created_by)\b/i, "the read names a personal column");
  assert.doesNotMatch(code, /select[^;]*\bu\.id\s+as\b/i, "the read outputs a user id");
  assert.match(code, /count\(distinct av\.user_id\)/, "holders are counted, never listed");
});

test("the block's shape: pipefail on line 2, no set -e, no # line, no continuation, one read-only psql", () => {
  const lines = block.split("\n");
  assert.equal(lines[0], "(");
  assert.equal(lines[1], "set -o pipefail");
  assert.equal(lines.at(-1), ")");
  assert.doesNotMatch(block, /set -e|errexit/);
  assert.ok(!lines.some((l) => l.trimStart().startsWith("#")), "a # line in the block");
  assert.ok(!lines.some((l) => l.endsWith("\\")), "a backslash continuation in the block");
  const psql = lines.filter((l) => /^psql /.test(l));
  assert.ok(!lines.some((l) => /(^|[;|&] *)psql /.test(l) && !/^psql /.test(l)), "a psql call that does not start its line");
  assert.equal(psql.length, 1);
  assert.match(psql[0], /-c "begin read only" -c "set local statement_timeout = '120s'"/);
  assert.match(psql[0], /-f \$\{READFILE\} -c "rollback"/);
  assert.equal((block.match(/=PENDING$/gm) || []).length, 2, "exactly two PENDING value lines");
  assert.ok(lines[2] === "MERGED=PENDING" && lines[3] === "DOCSHA=PENDING");
  for (const l of lines) {
    if (/\|\| \{/.test(l)) assert.match(l, /\|\| \{ echo "STOP: [^"]+"; exit 1; \}$/, `a halt that is not one STOP and exit 1: ${l}`);
  }
});

// ---- The fault-injection harness. ----

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const realOf = (name) => {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${name}`], { env: { PATH: SYSTEM_PATH }, encoding: "utf8" });
  const p = r.stdout.trim();
  if (r.status !== 0 || !p.startsWith("/")) throw new Error(`the harness needs ${name} on ${SYSTEM_PATH}`);
  return p;
};
const STUBBED = ["git", "node", "psql", "tee", "grep", "awk", "cut", "shasum", "rm"];

const TABLE_OK = [
  "BEGIN", "SET",
  " mn_read_transaction ", "---------------------", " read only: on", "(1 row)", "",
  " n  | check | observed | expected | verdict ",
  "----+-------+----------+----------+---------",
  "  0 | 0. this transaction is READ ONLY | on | on | OK",
  "  1 | 1. exactly one Montemor row | 1; control 1, 1 | 1; control 1, 1 | OK",
  "  2 | 2. the measure works | 2 of 2 | 2 of 2 | OK",
  " 10 | MN: location id | 00000000-0000-4000-8000-0000000000a3 | is_active=true | listed=false | information | INFO",
  " 20 | MN_ONLINE | portal_listed=false portal_online=false guest_listed=false | a hold is needed if | INFO",
  "(6 rows)", "", "ROLLBACK",
].join("\n");
const FIXTURES = {
  ok: TABLE_OK,
  vacuous: TABLE_OK.replace("2 of 2 | 2 of 2 | OK", "1 of 2 | 2 of 2 | VACUOUS"),
  fail: TABLE_OK.replace("1; control 1, 1 | 1; control 1, 1 | OK", "2; control 1, 1 | 1; control 1, 1 | FAIL"),
  noline: TABLE_OK.replace(/^ 20 \| MN_ONLINE[^\n]*\n/m, ""),
  notreadonly: TABLE_OK.replace(" read only: on", " read only: off"),
};

function stubText(name, real) {
  return `#!/bin/sh
d="$HARNESS_DIR"
n=$(( $(cat "$d/count.${name}" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$d/count.${name}"
printf '%s:%s %s\\n' "${name}" "$n" "$*" >> "$d/calls"
if [ "$HARNESS_FAIL" = "${name}:$n" ]; then
  echo "${name}: harness fault" >&2
  ${name === "tee" || name === "grep" || name === "awk" || name === "cut" || name === "shasum" ? `"${real}" "$@" > /dev/null 2>&1 < /dev/null` : ":"}
  exit ${name === "grep" ? 2 : 1}
fi
case "${name}" in
  git)
    case "$1" in
      status) [ "$HARNESS_DIRTY" = yes ] && echo " M somefile"; exit 0;;
      fetch) exit 0;;
      merge-base) [ "$HARNESS_ANCESTOR" = no ] && exit 1; exit 0;;
      checkout) exit 0;;
      rev-parse) echo "$HARNESS_HEAD"; exit 0;;
      *) echo "harness: unexpected git $*" >&2; exit 97;;
    esac;;
  node)
    [ "$1" = "scripts/assert-production-target.mjs" ] || { echo "harness: unexpected node $*" >&2; exit 97; }
    [ "$DATABASE_URL_DIRECT" = "$HARNESS_DBURL" ] || { echo "harness: the guard ran without the env file's URL" >&2; exit 97; }
    printf 'host: harness.invalid\\nport: 5432\\nref:  harness\\ntarget verified: production, session pooler.\\n'; exit 0;;
  psql)
    [ "$1" = "$HARNESS_DBURL" ] || { echo "harness: psql got a URL that is not the harness's" >&2; exit 97; }
    cat "$d/fix.$HARNESS_TABLE"; exit 0;;
  *) exec "${real}" "$@";;
esac
`;
}

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), "mnread-harness-"));
  mkdirSync(join(base, "bin"));
  for (const n of STUBBED) {
    writeFileSync(join(base, "bin", n), stubText(n, ["git", "node", "psql"].includes(n) ? "" : realOf(n)));
    chmodSync(join(base, "bin", n), 0o755);
  }
  const wt = join(base, "apply");
  for (const p of [DOC_PATH, SIDECAR, READ_PATH, GUARD, MODULE]) {
    mkdirSync(dirname(join(wt, p)), { recursive: true });
    cpSync(join(ROOT, p), join(wt, p));
  }
  writeFileSync(join(base, "prod.env"), "DATABASE_URL_DIRECT=postgresql://postgres.harness:x@harness.invalid:5432/postgres\n");
  for (const [k, v] of Object.entries(FIXTURES)) writeFileSync(join(base, `fix.${k}`), v + "\n");
  return base;
}

/** The block as GREEN pastes it from its dispatch: the two value lines filled, paths pointed at the harness. */
function filled(base, { docsha } = {}) {
  return block
    .replace("MERGED=PENDING", `MERGED=${MERGED}`)
    .replace("DOCSHA=PENDING", `DOCSHA=${docsha ?? sha256(doc)}`)
    .replaceAll(APPLY_DIR, join(base, "apply"))
    .replaceAll(ENV_FILE, join(base, "prod.env"))
    .replaceAll("/tmp/mn-read-20261025.out", join(base, "out.txt"));
}

function runOnce(shell, base, text, env = {}) {
  rmSync(join(base, "calls"), { force: true });
  for (const n of STUBBED) rmSync(join(base, `count.${n}`), { force: true });
  const tail = `true && eval '${text.replaceAll("'", `'\\''`)}' < /dev/null && echo TOOL-CHAIN-CONTINUED`;
  const args = shell === "zsh" ? ["-f", "-c", tail] : ["--noprofile", "--norc", "-c", tail];
  const r = spawnSync(shell, args, {
    cwd: base,
    encoding: "utf8",
    env: {
      PATH: `${join(base, "bin")}:${SYSTEM_PATH}`,
      HOME: base,
      HARNESS_DIR: base,
      HARNESS_HEAD: MERGED,
      HARNESS_DBURL: "postgresql://postgres.harness:x@harness.invalid:5432/postgres",
      HARNESS_TABLE: "ok",
      ...env,
    },
  });
  let calls = "";
  try { calls = readFileSync(join(base, "calls"), "utf8"); } catch { /* no call made */ }
  return { ...r, out: `${r.stdout}${r.stderr}`, calls };
}

function assertPass(r) {
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^MN-READ PASSED: 3 OK \/ 0 VACUOUS \/ 0 FAIL\. .*MN_ONLINE/m);
  assert.match(r.stdout, /TOOL-CHAIN-CONTINUED/);
  assert.doesNotMatch(r.out, /^STOP:/m);
  assert.doesNotMatch(r.out, /harness: unexpected/);
}

function assertStop(r, re, label) {
  assert.notEqual(r.status, 0, `${label}: the block went on\n${r.out}`);
  const stops = r.stdout.split("\n").filter((l) => l.startsWith("STOP:"));
  assert.equal(stops.length, 1, `${label}: expected exactly one STOP line\n${r.out}`);
  if (re) assert.match(stops[0], re, label);
  assert.doesNotMatch(r.stdout, /MN-READ PASSED/, `${label}: a pass line after a fault`);
  assert.doesNotMatch(r.stdout, /TOOL-CHAIN-CONTINUED/, `${label}: the tool chain went on`);
  assert.doesNotMatch(r.out, /harness: unexpected/, `${label}: an unexpected call`);
}

const shells = ["bash"];
if (spawnSync("/bin/sh", ["-c", "command -v zsh"], { env: { PATH: SYSTEM_PATH } }).status === 0) shells.push("zsh");
else if (!process.env.GITHUB_ACTIONS) test("zsh is installed here", () => assert.fail("zsh is not on this machine, and the zsh arm must run wherever it is not the GitHub runner"));

for (const shell of shells) {
  test(`${shell}: the document's own copy STOPs at its PENDING lines before anything runs`, () => {
    const base = makeBase();
    try {
      const text = block.replaceAll(APPLY_DIR, join(base, "apply"));
      const r = runOnce(shell, base, text);
      assertStop(r, /still reads PENDING, so it is NOT READY/, "PENDING");
      assert.ok(!/^(git|node|psql|shasum|rm|tee|awk|cut):/m.test(r.calls), `a command ran before the PENDING check: ${r.calls}`);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the filled block passes on the clean profile, and every external call failed in turn is a clean STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      const clean = runOnce(shell, base, text);
      assertPass(clean);
      const calls = clean.calls.trim().split("\n").map((l) => l.split(" ")[0]);
      assert.ok(calls.length >= 15, `too few calls were stubbed: ${calls.length}`);
      for (const n of ["git", "node", "psql", "tee", "grep", "awk", "cut", "shasum", "rm"]) {
        assert.ok(calls.some((c) => c.startsWith(`${n}:`)), `${n} was never called, so its failure is not proven`);
      }
      for (const id of calls) {
        const r = runOnce(shell, base, text, { HARNESS_FAIL: id });
        assertStop(r, null, `${shell} fail ${id}`);
      }
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test(`${shell}: the profile, the transaction, the pins, the worktree and the commit each STOP`, () => {
    const base = makeBase();
    try {
      const text = filled(base);
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "vacuous" }), /not 3 OK \/ 0 VACUOUS \/ 0 FAIL/, "vacuous");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "fail" }), /not 3 OK \/ 0 VACUOUS \/ 0 FAIL/, "fail");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "noline" }), /no MN_ONLINE row/, "no MN_ONLINE");
      assertStop(runOnce(shell, base, text, { HARNESS_TABLE: "notreadonly" }), /READ ONLY/, "not read only");
      assertStop(runOnce(shell, base, text, { HARNESS_DIRTY: "yes" }), /not clean/, "dirty");
      assertStop(runOnce(shell, base, text, { HARNESS_ANCESTOR: "no" }), /is not on origin\/main/, "not on main");
      assertStop(runOnce(shell, base, text, { HARNESS_HEAD: "b".repeat(40) }), /not on the merge commit/, "head");
      assertStop(runOnce(shell, base, filled(base, { docsha: "c".repeat(64) })), /not the one the dispatch names/, "docsha");
      for (const [p, re] of [[READ_PATH, /read on disk is not the reviewed file/], [GUARD, /target guard on disk/], [MODULE, /module on disk/]]) {
        const f = join(base, "apply", p);
        const keep = readFileSync(f);
        writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
        assertStop(runOnce(shell, base, text), re, `changed ${p}`);
        writeFileSync(f, keep);
      }
      const f = join(base, "apply", DOC_PATH);
      const keep = readFileSync(f);
      writeFileSync(f, Buffer.concat([keep, Buffer.from("\n")]));
      assertStop(runOnce(shell, base, text), /not the one the dispatch names/, "changed document");
      writeFileSync(f, keep);
      assertPass(runOnce(shell, base, text));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
}
