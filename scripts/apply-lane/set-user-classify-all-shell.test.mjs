// PROVES THE SR-62 PU-1 OWNER-RUN BLOCK, set-user-classify-all-shell.zsh, DOES WHAT ITS
// REPORT SAYS, without zsh, so it runs in the required CI job.
//
// The block turns on autoMode.classifyAllShell in ~/.claude/settings.json and changes
// nothing else. With it on, Claude Code suspends every Bash allow rule while auto mode is
// on, so a rule like Bash(gh pr *) or Bash(git push *) can no longer skip the classifier.
//
// It has the same self-verifying shape as install-apply-settings.zsh (SR-62 PU-0): a pin
// heredoc, a body heredoc, one run line; the body's first act is `shasum -a 256 -c`, the
// run line is `zsh -f -e -u`, and the check sets V, which the settings path needs.
// This file holds that shape and runs the node body, from the exact bytes inside the .zsh
// file, against fixture settings files. The zsh deletion sweeps are a recorded rehearsal.
//
// Run: pnpm test:scripts

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BLOCK_PATH = join(HERE, "set-user-classify-all-shell.zsh");
const shaOf = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ser = (v) => JSON.stringify(v, null, 2) + "\n";

function parts() {
  const block = readFileSync(BLOCK_PATH, "utf8");
  const m = block.match(
    /^cat > "\$\{HOME\}\/\.osteojp-pu1\.s" <<'PU1_PIN_END'\n([0-9a-f]{64})  \.osteojp-pu1\.z\nPU1_PIN_END\ncat > "\$\{HOME\}\/\.osteojp-pu1\.z" <<'PU1_END'\n([\s\S]*?\n)PU1_END\nzsh -f -e -u "\$\{HOME\}\/\.osteojp-pu1\.z"\n$/,
  );
  assert.ok(m, "set-user-classify-all-shell.zsh is not in the pin + body + run shape");
  const js = m[2].match(/<<'JS_END'\n([\s\S]*?)\nJS_END\n/);
  assert.ok(js, "no quoted JS_END heredoc in the body");
  return { block, pin: m[1], body: m[2], js: js[1] };
}

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "pu1-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const run = (js, target) => spawnSync("node", ["--input-type=module", "-", target], { input: js, encoding: "utf8" });
const backups = (dir) => readdirSync(dir).filter((f) => f.includes(".bak-"));
const leftovers = (dir) => readdirSync(dir).filter((f) => f.includes(".tmp-"));

const WITH_ENV = {
  permissions: { allow: ["Bash(gh pr)"], defaultMode: "auto" },
  model: "opus[1m]",
  autoMode: { environment: ["an entry", "another"] },
};
const WITHOUT_AUTOMODE = { permissions: { allow: ["Bash(gh pr)"], defaultMode: "auto" }, model: "opus[1m]" };

function fixture(t, text) {
  const dir = scratch(t);
  const target = join(dir, "settings.json");
  writeFileSync(target, text, { mode: 0o600 });
  return { dir, target };
}

// ---------------------------------------------------------------------------
// SHAPE
// ---------------------------------------------------------------------------

test("PU-1 block: the pin is the body's sha256, and checking it is the body's first act", () => {
  const { pin, body } = parts();
  assert.equal(pin, shaOf(body), `the body pin is stale: the body's sha256 is ${shaOf(body)}`);
  const lines = body.split("\n");
  assert.deepEqual(lines.slice(0, 3), ["(", "cd ~", "shasum -a 256 -c .osteojp-pu1.s && V= || exit 9"]);
  assert.equal(lines.filter((l) => /(^|[^{])\bV=/.test(l)).length, 1, "V may be set only by the check line");
  const needsV = lines.findIndex((l) => l === 'S="${HOME}/.claude/settings.json${V}"');
  const firstNode = lines.findIndex((l) => l.startsWith("node "));
  assert.ok(needsV > 2 && needsV < firstNode, "the settings path must need V, before node runs");
});

test("PU-1 block survives a paste: 80-character lines, no comment line, no exclamation mark, no unbraced $NAME:", () => {
  const { block } = parts();
  const lines = block.replace(/\n$/, "").split("\n");
  assert.deepEqual(lines.filter((l) => l.length > 80), []);
  assert.deepEqual(lines.filter((l) => /\t|\s$|\\$/.test(l)), []);
  assert.deepEqual(lines.filter((l) => /^\s*#/.test(l)), []);
  assert.equal(block.includes("!"), false);
  assert.deepEqual(lines.filter((l) => /\$[A-Za-z_][A-Za-z0-9_]*:/.test(l)), []);
});

// ---------------------------------------------------------------------------
// THE NODE BODY, RUN FROM THE BYTES INSIDE THE .zsh FILE
// ---------------------------------------------------------------------------

test("sets classifyAllShell and nothing else; mode-600 backup holds the old bytes; a second run is a no-op", (t) => {
  const { js } = parts();
  const { dir, target } = fixture(t, ser(WITH_ENV));
  const original = readFileSync(target);
  const r = run(js, target);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^NOTE: autoMode\.environment still holds 2 entries\./m);
  assert.match(r.stdout, /Reset BEFORE this\./);
  assert.match(r.stdout, /^SET: autoMode\.classifyAllShell = true/m);
  const expected = structuredClone(WITH_ENV);
  expected.autoMode.classifyAllShell = true;
  assert.equal(readFileSync(target, "utf8"), ser(expected));
  assert.equal(statSync(target).mode & 0o777, 0o600);
  const [backup] = backups(dir);
  assert.ok(backup);
  assert.deepEqual(readFileSync(join(dir, backup)), original);
  assert.equal(statSync(join(dir, backup)).mode & 0o777, 0o600);
  assert.deepEqual(leftovers(dir), []);

  const bytes = readFileSync(target);
  const again = run(js, target);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /^ALREADY SET/m);
  assert.deepEqual(readFileSync(target), bytes);
  assert.equal(backups(dir).length, 1);
});

test("with no autoMode section (the shape after claude auto-mode reset) it adds exactly autoMode.classifyAllShell", (t) => {
  const { js } = parts();
  const { target } = fixture(t, ser(WITHOUT_AUTOMODE));
  const r = run(js, target);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /NOTE:/);
  assert.equal(readFileSync(target, "utf8"), ser({ ...WITHOUT_AUTOMODE, autoMode: { classifyAllShell: true } }));
});

test("STOPs and changes nothing on: malformed JSON, a reformatted file, the key present but not true, autoMode not an object, no file", (t) => {
  const { js } = parts();
  const cases = [
    ["malformed", "{ nope", /not valid JSON/],
    ["not 2-space", JSON.stringify(WITH_ENV), /2-space JSON form/],
    ["present false", ser({ ...WITH_ENV, autoMode: { ...WITH_ENV.autoMode, classifyAllShell: false } }), /present and not true/],
    ["autoMode array", ser({ ...WITH_ENV, autoMode: [] }), /autoMode is not an object/],
    ["top-level array", ser([1]), /not a JSON object/],
  ];
  for (const [label, text, expected] of cases) {
    const { dir, target } = fixture(t, text);
    const before = readFileSync(target);
    const r = run(js, target);
    assert.equal(r.status, 1, `${label}: ${r.stdout}`);
    assert.match(r.stderr, expected, label);
    assert.match(r.stderr, /was not changed/, label);
    assert.deepEqual(readFileSync(target), before, label);
    assert.deepEqual(backups(dir), [], label);
  }
  const dir = scratch(t);
  const missing = run(js, join(dir, "absent.json"));
  assert.equal(missing.status, 1);
  assert.equal(existsSync(join(dir, "absent.json")), false);
});

test("THE RE-PARSE CHECK FIRES: a serialiser that breaks the JSON writes nothing", (t) => {
  const { js } = parts();
  const { dir, target } = fixture(t, ser(WITH_ENV));
  const before = readFileSync(target);
  assert.equal(js.split("const serOut = ser;").length, 2, "the mutation anchor moved");
  const r = run(js.replace("const serOut = ser;", "const serOut = (x) => ser(x).slice(0, -3);"), target);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /produced JSON does not parse/);
  assert.deepEqual(readFileSync(target), before);
  assert.deepEqual(backups(dir), []);
  assert.deepEqual(leftovers(dir), []);
});

test("THE ONE-KEY CHECK FIRES: an output that also drops another key writes nothing", (t) => {
  const { js } = parts();
  const { dir, target } = fixture(t, ser(WITH_ENV));
  const before = readFileSync(target);
  const anchor = "after.autoMode = { ...(auto || {}), classifyAllShell: true };";
  assert.equal(js.split(anchor).length, 2, "the mutation anchor moved");
  const r = run(js.replace(anchor, `${anchor} delete after.model;`), target);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /more than autoMode\.classifyAllShell would change/);
  assert.deepEqual(readFileSync(target), before);
  assert.deepEqual(backups(dir), []);
});
