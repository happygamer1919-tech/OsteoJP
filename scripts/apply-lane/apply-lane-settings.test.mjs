// PROVES THE GREEN APPLY LANE'S SETTINGS FILE AND ITS TWO OWNER-RUN COMMANDS (SR-62 P-S2,
// P-S3, P-S4) DO WHAT THEIR REPORTS SAY, without zsh, so it runs in the required CI job.
//
// The zsh rehearsal of the pasted blocks is a separate, recorded run. This file holds
// the parts a machine can hold forever:
//   - the reviewed settings file passes every required check, and EACH check fires;
//   - the installer's arms: clean install, second run, malformed target, differing
//     target, wrong sha256, a required key missing, a serialiser that breaks the JSON
//     or drops a key, and a CLI reached through a symlinked directory;
//   - the removal block's arms, run from the exact bytes inside its .zsh file;
//   - the sha256 values pinned in install-apply-settings.zsh match the files;
//   - neither .zsh block carries a comment line, an exclamation mark or an unbraced
//     `$NAME:`. Interactive zsh does not treat `#` as a comment by default, expands
//     `!` as history, and reads `$NAME:x` as a modifier.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GREEN_APPLIES, GREEN_READS, NEVER_CLAUSES, install, requiredProblems, serialize } from "./install-apply-settings.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANONICAL = join(HERE, "osteojp-apply-settings.json");
const INSTALLER = join(HERE, "install-apply-settings.mjs");
const INSTALL_ZSH = join(HERE, "install-apply-settings.zsh");
const REMOVE_ZSH = join(HERE, "remove-user-psql-allow.zsh");

const shaOf = (bytes) => createHash("sha256").update(bytes).digest("hex");
const reviewed = () => JSON.parse(readFileSync(CANONICAL, "utf8"));

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "apply-lane-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function capture() {
  const out = { log: [], err: [] };
  return { out, io: { log: (m) => out.log.push(m), err: (m) => out.err.push(m) } };
}

function writeCanonical(dir, obj) {
  const path = join(dir, "canonical.json");
  const text = serialize(obj);
  writeFileSync(path, text);
  return { path, sha: shaOf(text) };
}

const leftovers = (dir) => readdirSync(dir).filter((f) => f.includes(".tmp-"));

// ---------------------------------------------------------------------------
// THE REVIEWED FILE
// ---------------------------------------------------------------------------

test("the reviewed settings file passes every required check and is in 2-space form", () => {
  assert.deepEqual(requiredProblems(reviewed()), []);
  assert.equal(serialize(reviewed()), readFileSync(CANONICAL, "utf8"));
});

test("GREEN's two entries are carried verbatim, and all five never-clauses are in the applies entry", () => {
  const allow = reviewed().autoMode.allow;
  assert.equal(allow[1], GREEN_READS);
  assert.ok(allow[2].startsWith(GREEN_APPLIES));
  assert.equal(NEVER_CLAUSES.length, 5);
  for (const clause of NEVER_CLAUSES) assert.ok(allow[2].includes(clause), clause);
});

test("each required check fires on its own mutation", () => {
  const cases = [
    ["an extra top-level key", (s) => (s.permissions = { allow: ["Bash(ls)"] }), /top-level keys/],
    ["classifyAllShell missing", (s) => delete s.autoMode.classifyAllShell, /classifyAllShell must be true/],
    ["classifyAllShell false", (s) => (s.autoMode.classifyAllShell = false), /classifyAllShell must be true/],
    ["a soft_deny list", (s) => (s.autoMode.soft_deny = ["x"]), /autoMode keys must be exactly/],
    ["allow without $defaults", (s) => s.autoMode.allow.shift(), /allow must start with "\$defaults"/],
    ["the reads entry edited", (s) => (s.autoMode.allow[1] = s.autoMode.allow[1].replace("READ ONLY", "read")), /reads entry, verbatim/],
    ["a never-clause removed", (s) => (s.autoMode.allow[2] = s.autoMode.allow[2].replace(NEVER_CLAUSES[4], "")), /missing the clause "never runs DELETE/],
    ["a duplicate allow entry", (s) => s.autoMode.allow.push(s.autoMode.allow[1]), /exactly two OsteoJP entries|duplicate/],
    ["environment without $defaults", (s) => s.autoMode.environment.shift(), /environment must start with "\$defaults"/],
    [
      "the prod ref missing from the environment",
      (s) => (s.autoMode.environment = s.autoMode.environment.map((e) => e.replaceAll("dfotoodqvmjhbdcxyaxf", "REF"))),
      /does not name dfotoodqvmjhbdcxyaxf/,
    ],
    [
      "the stale user-level environment copied in",
      (s) => s.autoMode.environment.push("**Trusted repo**: The git repository at /Users/ivan - however this directory has zero tracked files"),
      /stale user-level text/,
    ],
  ];
  for (const [label, mutate, expected] of cases) {
    const s = reviewed();
    mutate(s);
    const problems = requiredProblems(s);
    assert.ok(problems.some((p) => expected.test(p)), `${label}: ${JSON.stringify(problems)}`);
  }
});

// ---------------------------------------------------------------------------
// THE INSTALLER
// ---------------------------------------------------------------------------

test("clean install writes the reviewed bytes, mode 600; a second run changes nothing", (t) => {
  const dir = scratch(t);
  const target = join(dir, "osteojp-apply-settings.json");
  const expectSha256 = shaOf(readFileSync(CANONICAL));
  const first = capture();
  assert.equal(install({ canonicalPath: CANONICAL, targetPath: target, expectSha256, ...first.io }), 0, first.out.err.join("\n"));
  assert.equal(readFileSync(target, "utf8"), readFileSync(CANONICAL, "utf8"));
  assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.ok(first.out.log.some((l) => l.includes("claude --settings")));

  const before = readFileSync(target);
  const mtime = statSync(target).mtimeMs;
  const second = capture();
  assert.equal(install({ canonicalPath: CANONICAL, targetPath: target, expectSha256, ...second.io }), 0);
  assert.ok(second.out.log.some((l) => l.startsWith("ALREADY INSTALLED")));
  assert.deepEqual(readFileSync(target), before);
  assert.equal(statSync(target).mtimeMs, mtime);
  const parsed = JSON.parse(readFileSync(target, "utf8"));
  assert.equal(new Set(parsed.autoMode.allow).size, parsed.autoMode.allow.length);
  assert.deepEqual(leftovers(dir), []);
});

test("a malformed target is a STOP and is left byte-for-byte as it was", (t) => {
  const dir = scratch(t);
  const target = join(dir, "osteojp-apply-settings.json");
  writeFileSync(target, "{ not json");
  const run = capture();
  assert.equal(install({ canonicalPath: CANONICAL, targetPath: target, expectSha256: shaOf(readFileSync(CANONICAL)), ...run.io }), 1);
  assert.equal(readFileSync(target, "utf8"), "{ not json");
  assert.match(run.out.err.join("\n"), /is not valid JSON/);
  assert.deepEqual(leftovers(dir), []);
});

test("a valid target that differs is a STOP, never a merge or an overwrite", (t) => {
  const dir = scratch(t);
  const target = join(dir, "osteojp-apply-settings.json");
  writeFileSync(target, serialize({ autoMode: { allow: ["$defaults", "something nobody reviewed"] } }));
  const before = readFileSync(target);
  assert.equal(install({ canonicalPath: CANONICAL, targetPath: target, expectSha256: shaOf(readFileSync(CANONICAL)), ...capture().io }), 1);
  assert.deepEqual(readFileSync(target), before);
});

test("a reviewed file whose sha256 does not match is a STOP, and nothing is created", (t) => {
  const dir = scratch(t);
  const target = join(dir, "osteojp-apply-settings.json");
  assert.equal(install({ canonicalPath: CANONICAL, targetPath: target, expectSha256: "0".repeat(64), ...capture().io }), 1);
  assert.equal(existsSync(target), false);
});

test("a required key missing from the file to be installed is a STOP, even with a matching sha256", (t) => {
  const dir = scratch(t);
  const target = join(dir, "osteojp-apply-settings.json");
  for (const mutate of [(s) => delete s.autoMode.classifyAllShell, (s) => (s.autoMode.allow[2] = GREEN_APPLIES)]) {
    const s = reviewed();
    mutate(s);
    const { path, sha } = writeCanonical(dir, s);
    const run = capture();
    assert.equal(install({ canonicalPath: path, targetPath: target, expectSha256: sha, ...run.io }), 1);
    assert.match(run.out.err.join("\n"), /fails \d+ required check/);
    assert.equal(existsSync(target), false);
  }
});

test("THE RE-PARSE CHECK FIRES: a serialiser that breaks the JSON, or loses a key, writes nothing", (t) => {
  const dir = scratch(t);
  const target = join(dir, "osteojp-apply-settings.json");
  const expectSha256 = shaOf(readFileSync(CANONICAL));

  const broken = capture();
  const brokenCode = install({
    canonicalPath: CANONICAL,
    targetPath: target,
    expectSha256,
    serializeFn: (v) => serialize(v).slice(0, -3),
    ...broken.io,
  });
  assert.equal(brokenCode, 1);
  assert.match(broken.out.err.join("\n"), /produced JSON does not parse/);

  const lossy = capture();
  const lossyCode = install({
    canonicalPath: CANONICAL,
    targetPath: target,
    expectSha256,
    serializeFn: (v) => {
      const copy = structuredClone(v);
      delete copy.autoMode.classifyAllShell;
      return serialize(copy);
    },
    ...lossy.io,
  });
  assert.equal(lossyCode, 1);
  assert.match(lossy.out.err.join("\n"), /does not equal the reviewed settings/);

  assert.equal(existsSync(target), false);
  assert.deepEqual(leftovers(dir), []);
});

test("the CLI refuses a bad invocation and a Claude Code settings path, and runs through a symlinked directory", (t) => {
  const dir = scratch(t);
  const real = join(dir, "real");
  mkdirSync(real);
  writeFileSync(join(real, "install-apply-settings.mjs"), readFileSync(INSTALLER));
  symlinkSync(real, join(dir, "link"));
  const viaLink = join(dir, "link", "install-apply-settings.mjs");
  const sha = shaOf(readFileSync(CANONICAL));

  // Exit 2 proves main() ran. A skipped main() would exit 0 having done nothing.
  assert.equal(spawnSync("node", [viaLink], { encoding: "utf8" }).status, 2);
  for (const target of ["relative.json", join(dir, ".claude", "settings.json"), join(dir, "settings.json")]) {
    const r = spawnSync("node", [viaLink, "--canonical", CANONICAL, "--target", target, "--expect-sha256", sha], { encoding: "utf8" });
    assert.equal(r.status, 2, `${target}: ${r.stderr}`);
  }
  const target = join(dir, "osteojp-apply-settings.json");
  const ok = spawnSync("node", [viaLink, "--canonical", CANONICAL, "--target", target, "--expect-sha256", sha], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^INSTALLED: /);
});

// SR-62 PU-0: the install block as first printed was intact, but a paste path lost a
// stretch of its 262- and 597-character lines. The block is now built so that a lost
// line or stretch STOPs it instead of changing what it does:
//   - it writes its body, and "<sha256>  .osteojp-ps3.z", through two quoted heredocs;
//   - the body's first act, from ~, is `shasum -a 256 -c`, so a damaged body never runs
//     past its first line;
//   - the run line is `zsh -f -e -u`, so a damaged body whose subshell closes early
//     cannot fall through to top-level lines (a first design did exactly that);
//   - the check sets V, which the repo path needs under -u, so losing the check line
//     itself also stops the run.
// These tests hold that shape; the deletion sweeps that prove it are a recorded zsh
// rehearsal (zsh is not on the CI runner).
function installBlockParts() {
  const block = readFileSync(INSTALL_ZSH, "utf8");
  const m = block.match(
    /^cat > "\$\{HOME\}\/\.osteojp-ps3\.s" <<'P_S3_PIN_END'\n([0-9a-f]{64})  \.osteojp-ps3\.z\nP_S3_PIN_END\ncat > "\$\{HOME\}\/\.osteojp-ps3\.z" <<'P_S3_END'\n([\s\S]*?\n)P_S3_END\nzsh -f -e -u "\$\{HOME\}\/\.osteojp-ps3\.z"\n$/,
  );
  assert.ok(m, "install-apply-settings.zsh is not in the pin + body + run shape");
  return { block, pin: m[1], body: m[2] };
}

test("install-apply-settings.zsh: the pinned sha256 is the body's, and checking it is the body's first act", () => {
  const { pin, body } = installBlockParts();
  assert.equal(pin, shaOf(body), `the body pin is stale: the body's sha256 is ${shaOf(body)}`);
  const lines = body.split("\n");
  assert.deepEqual(lines.slice(0, 3), ["(", "cd ~", "shasum -a 256 -c .osteojp-ps3.s && V= || exit 9"]);
  assert.equal(lines.filter((l) => /(^|[^{])\bV=/.test(l)).length, 1, "V may be set only by the check line");
  assert.ok(lines.some((l) => /^R=\/Users\/ivan\/Documents\/Projects\/GitHub\/OsteoJP\$\{V\}$/.test(l)), "the repo path must need V");
  const firstWork = lines.findIndex((l) => /\b(git|node|claude)\b/.test(l));
  const needsV = lines.findIndex((l) => l.includes("${V}"));
  assert.ok(needsV > 2 && needsV < firstWork, "V must be needed before the first git, node or claude call");
});

test("install-apply-settings.zsh: its own sha256 gate on BOTH fetched files, the installer called, the result re-checked", () => {
  const { body } = installBlockParts();
  const SJ = body.match(/^SJ=([0-9a-f]{64})$/m)?.[1];
  const SI = body.match(/^SI=([0-9a-f]{64})$/m)?.[1];
  assert.equal(SJ, shaOf(readFileSync(CANONICAL)), "the settings file's pinned sha256 is stale");
  assert.equal(SI, shaOf(readFileSync(INSTALLER)), "the installer's pinned sha256 is stale");
  assert.match(body, /^git -C "\$\{R\}" show "origin\/main:scripts\/apply-lane\/\$\{J\}" > "\$\{T\}\/\$\{J\}"$/m);
  assert.match(body, /^git -C "\$\{R\}" show "origin\/main:scripts\/apply-lane\/\$\{I\}" > "\$\{T\}\/\$\{I\}"$/m);
  assert.match(body, /^J=osteojp-apply-settings\.json$/m);
  assert.match(body, /^I=install-apply-settings\.mjs$/m);
  assert.match(body, /^test "\$\{HJ\}" = "\$\{SJ\}" \|\| stop /m, "no block-level sha256 gate on the settings file");
  assert.match(body, /^test "\$\{HI\}" = "\$\{SI\}" \|\| stop /m, "no block-level sha256 gate on the installer");
  const lines = body.split("\n");
  const gates = Math.max(lines.findIndex((l) => l.startsWith('test "${HJ}"')), lines.findIndex((l) => l.startsWith('test "${HI}"')));
  const call = lines.findIndex((l) => l.startsWith('node "${T}/${I}" --canonical "${T}/${J}" --target "${G}" --expect-sha256 "${SJ}"'));
  assert.ok(call > gates, "the installer must be called, after both gates");
  const recheck = lines.findIndex((l) => l.startsWith('test "${HG}" = "${SJ}" || stop'));
  assert.ok(recheck > call, "the installed file's sha256 must be re-checked after the installer runs");
  assert.ok(lines.findIndex((l) => l.startsWith("echo \"P-S3 COMPLETE")) > recheck);
});

test("both blocks survive a paste into interactive zsh: no comment lines, no exclamation marks, no unbraced $NAME:", () => {
  for (const file of [INSTALL_ZSH, REMOVE_ZSH]) {
    const block = readFileSync(file, "utf8");
    const lines = block.split("\n");
    assert.deepEqual(lines.filter((l) => /^\s*#/.test(l)), [], `${file}: comment line`);
    assert.equal(block.includes("!"), false, `${file}: exclamation mark`);
    assert.deepEqual(lines.filter((l) => /\$[A-Za-z_][A-Za-z0-9_]*:/.test(l)), [], `${file}: unbraced $NAME:`);
  }
  const removal = readFileSync(REMOVE_ZSH, "utf8");
  assert.equal(removal.split("\n")[0], "(");
  assert.equal(removal.trimEnd().endsWith(")"), true);
});

test("the install block keeps every line to 80 characters, with no tab, trailing space or backslash continuation", () => {
  const lines = readFileSync(INSTALL_ZSH, "utf8").replace(/\n$/, "").split("\n");
  assert.deepEqual(lines.filter((l) => l.length > 80), [], "a line over 80 characters");
  assert.deepEqual(lines.filter((l) => /\t|\s$|\\$/.test(l)), [], "a tab, trailing whitespace or backslash continuation");
});

// ---------------------------------------------------------------------------
// THE REMOVAL BLOCK, RUN FROM THE BYTES INSIDE ITS .zsh FILE
// ---------------------------------------------------------------------------

function removalBody() {
  const m = readFileSync(REMOVE_ZSH, "utf8").match(/<<'EOF'\n([\s\S]*?)\nEOF\n/);
  assert.ok(m, "no quoted heredoc in remove-user-psql-allow.zsh");
  return m[1];
}

const runRemoval = (body, target) =>
  spawnSync("node", ["--input-type=module", "-", target], { input: body, encoding: "utf8" });

const USER_SETTINGS = {
  permissions: { allow: ["Bash(gh pr)", "Bash(psql:*)"], defaultMode: "auto" },
  model: "opus[1m]",
  enabledPlugins: { "code-review@claude-plugins-official": true },
  autoMode: { environment: ["an entry"] },
};

function userFixture(t, value = USER_SETTINGS, text = serialize(value)) {
  const dir = scratch(t);
  const target = join(dir, "settings.json");
  writeFileSync(target, text, { mode: 0o600 });
  return { dir, target };
}

const backups = (dir) => readdirSync(dir).filter((f) => f.includes(".bak-"));

test("removal: the rule goes, nothing else changes, a mode-600 backup holds the old bytes; a second run is a no-op", (t) => {
  const { dir, target } = userFixture(t);
  const original = readFileSync(target);
  const r = runRemoval(removalBody(), target);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^REMOVED: Bash\(psql:\*\)/);

  const after = JSON.parse(readFileSync(target, "utf8"));
  assert.deepEqual(after.permissions.allow, ["Bash(gh pr)"]);
  const expected = structuredClone(USER_SETTINGS);
  expected.permissions.allow = ["Bash(gh pr)"];
  assert.deepEqual(after, expected);
  assert.equal(readFileSync(target, "utf8"), serialize(expected));
  assert.equal(statSync(target).mode & 0o777, 0o600);

  const [backup] = backups(dir);
  assert.ok(backup, "no backup written");
  assert.deepEqual(readFileSync(join(dir, backup)), original);
  assert.equal(statSync(join(dir, backup)).mode & 0o777, 0o600);

  const bytes = readFileSync(target);
  const again = runRemoval(removalBody(), target);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /^ABSENT: /);
  assert.deepEqual(readFileSync(target), bytes);
  assert.equal(backups(dir).length, 1);
});

test("removal STOPs, changing nothing, on: malformed JSON, a reformatted file, another psql rule, a missing file", (t) => {
  const cases = [
    ["malformed", undefined, "{ nope", /not valid JSON/],
    ["not 2-space", USER_SETTINGS, JSON.stringify(USER_SETTINGS), /2-space JSON form/],
    [
      "another psql rule",
      { ...USER_SETTINGS, permissions: { allow: ["Bash(psql:*)", "Bash(psql *)"], defaultMode: "auto" } },
      undefined,
      /also holds \["Bash\(psql \*\)"\]/,
    ],
  ];
  for (const [label, value, text, expected] of cases) {
    const { dir, target } = userFixture(t, value, text ?? serialize(value));
    const before = readFileSync(target);
    const r = runRemoval(removalBody(), target);
    assert.equal(r.status, 1, `${label}: ${r.stdout}`);
    assert.match(r.stderr, expected, label);
    assert.match(r.stderr, /was not changed/, label);
    assert.deepEqual(readFileSync(target), before, label);
    assert.deepEqual(backups(dir), [], label);
  }
  const dir = scratch(t);
  assert.equal(runRemoval(removalBody(), join(dir, "absent.json")).status, 1);
});

test("removal: THE RE-PARSE CHECK FIRES on a deliberately broken serialiser, and nothing is written", (t) => {
  const { dir, target } = userFixture(t);
  const before = readFileSync(target);
  const body = removalBody();
  assert.equal(body.split("const serOut = ser;").length, 2, "the mutation anchor moved");
  const broken = body.replace("const serOut = ser;", "const serOut = (x) => ser(x).slice(0, -3);");
  const r = runRemoval(broken, target);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /produced JSON does not parse/);
  assert.deepEqual(readFileSync(target), before);
  assert.deepEqual(backups(dir), []);
  assert.deepEqual(leftovers(dir), []);
});
