// SR-62 P-S2 / P-S3: install the GREEN apply lane's own settings file,
// ~/osteojp-apply-settings.json, from the reviewed copy beside this script.
// Owner-run, through scripts/apply-lane/install-apply-settings.zsh, which fetches both
// files from origin/main and pins their sha256.
//
// ===========================================================================
// THE RULING (owner, 2026-09-13)
// ===========================================================================
// The auto mode widening that lets GREEN reach production does NOT go into
// ~/.claude/settings.json, which every session on this Mac inherits, other clients'
// projects included. It goes into a standalone file that only the apply lane loads:
//
//   cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && claude --settings /Users/ivan/osteojp-apply-settings.json
//
// Revoking it is deleting that file.
//
// ===========================================================================
// WHAT --settings DOES, FROM THE DOCS (code.claude.com, read 2026-09-14, Claude Code 2.1.270)
// ===========================================================================
// - The auto mode classifier reads `autoMode` from `--settings` (auto-mode-config,
//   "Where the classifier reads configuration").
// - `--settings` MERGES with the settings files. It does not replace them: "it takes a
//   key you set here over the same key in local, project, or user settings, and keeps
//   the lower-level value for a key you omit", and lists combine (settings, "Lists
//   merge instead of overriding").
//
// So this file carries ONLY `autoMode`. model, effortLevel, enabledPlugins,
// skillOverrides and permissions reach the lane from ~/.claude/settings.json as they
// reach any session. A key added here would change the lane in a way nobody reviewed,
// and a list here can only ADD to the user's list, never remove from it.
//
// ===========================================================================
// WHY classifyAllShell IS HERE, AND IT IS LOAD-BEARING
// ===========================================================================
// Narrow Bash allow rules resolve BEFORE the classifier in auto mode. By the merge
// above this lane inherits the user file's `Bash(psql:*)`, and because a worktree
// reads the MAIN CHECKOUT's .claude/settings.local.json (settings docs), it also
// inherits the OsteoJP clone's `Bash(supabase *)`, `Bash(git *)`, `Bash(gh pr *)` and
// `Bash(vercel *)`. Without classifyAllShell, a psql write or `supabase db push` runs
// in this lane with no classifier review, whatever the allow entries below say.
//
// ===========================================================================
// THE CHECKS, AND WHAT EACH ONE STOPS
// ===========================================================================
// - The reviewed file's sha256 must equal --expect-sha256.
// - requiredProblems(): exactly the keys above; "$defaults" first in both lists;
//   GREEN's two entries verbatim; the five never-clauses in the applies entry; the
//   environment names the repo, the worktree, the prod ref and the secrets path, and
//   carries none of the stale user-level environment text.
// - An existing target is never merged into or overwritten. Identical: nothing to do,
//   exit 0. Malformed or different: STOP.
// - The produced JSON is re-parsed and compared BEFORE anything is written, and the
//   written temp file is read back before it is linked into place. Linking refuses to
//   replace a file that appeared in between.
//
// Exit codes: 0 installed or already installed; 1 STOP, nothing written; 2 bad invocation.
//
// Proofs: scripts/apply-lane/apply-lane-settings.test.mjs (pnpm test:scripts).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const LANE_WORKTREE = "/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply";

/** GREEN's reads entry, verbatim from its 2026-09-13 E0 report. */
export const GREEN_READS =
  "OsteoJP production database reads (Supabase project ref dfotoodqvmjhbdcxyaxf, named by the owner as the prod target): the agent may run READ ONLY queries against it from /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply, connecting with the env file /Users/ivan/osteojp-secrets/new-prod.env loaded by node --env-file or set -o allexport, inside a READ ONLY transaction, after the ref guard runs. The credential values must never be printed, echoed, logged or quoted. Results may carry counts, ids and dates, but never patient names, phones or emails.";

/** GREEN's applies entry, verbatim. The reviewed entry starts with it and adds the never-clauses. */
export const GREEN_APPLIES =
  "OsteoJP production applies delegated to the GREEN lane by the owner (ruling 2026-09-13, Supabase project ref dfotoodqvmjhbdcxyaxf): the agent may run a production migration or write script only when ALL of these hold. The owner's dispatch names that exact migration or script. The file is checked out from origin/main in /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply and its sha256 is asserted on disk earlier in the same transcript. Its pre-check output from this run is visible earlier in the transcript. Every --expect value comes from that pre-check. The agent did not author the artifact. Any failed assertion stops the chain with no retry and no changed expectation. Credential values are never printed.";

/** The five clauses the SR-62 P-S2 dispatch adds to the applies entry. */
export const NEVER_CLAUSES = [
  "never disables, drops, alters or works around any trigger, and clinical_records_enforce_immutability specifically",
  "never runs a migration or script the owner's dispatch did not name by filename",
  "never prints, logs or writes patient names, phone numbers or email addresses",
  "never re-runs a block whose audit row already exists",
  "never runs DELETE, DROP or TRUNCATE outside a named migration file",
];

export const ENVIRONMENT_MUST_NAME = [
  "happygamer1919-tech/OsteoJP",
  LANE_WORKTREE,
  "dfotoodqvmjhbdcxyaxf",
  "/Users/ivan/osteojp-secrets/",
];

/** Text of the stale user-level environment (a /Users/ivan "trusted repo" with no files), which must not be copied. */
export const STALE_ENVIRONMENT_MARKERS = ["zero tracked files", "this repo (/Users/ivan) has no remotes"];

export const serialize = (value) => JSON.stringify(value, null, 2) + "\n";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Every way `settings` differs from what the apply lane may be launched with. Empty means it passes. */
export function requiredProblems(settings) {
  if (!isObject(settings)) return ["the file is not a JSON object"];
  const problems = [];
  const top = Object.keys(settings);
  if (!isDeepStrictEqual(top, ["autoMode"])) {
    problems.push(`top-level keys must be exactly ["autoMode"], found ${JSON.stringify(top)}: --settings merges, so any other key changes the lane`);
  }
  const auto = settings.autoMode;
  if (!isObject(auto)) return [...problems, "autoMode is missing or not an object"];

  const keys = Object.keys(auto).sort();
  if (!isDeepStrictEqual(keys, ["allow", "classifyAllShell", "environment"])) {
    problems.push(
      `autoMode keys must be exactly allow, classifyAllShell and environment, found ${JSON.stringify(keys)} (a soft_deny or hard_deny list here would change or discard the built-in rules)`,
    );
  }
  if (auto.classifyAllShell !== true) problems.push("autoMode.classifyAllShell must be true");

  const allow = auto.allow;
  if (!Array.isArray(allow) || allow.some((e) => typeof e !== "string")) {
    problems.push("autoMode.allow is missing or is not a list of strings");
  } else {
    if (allow[0] !== "$defaults") problems.push('autoMode.allow must start with "$defaults"');
    if (allow.length !== 3) problems.push(`autoMode.allow must hold "$defaults" and exactly two OsteoJP entries, found ${allow.length} entries`);
    if (allow[1] !== GREEN_READS) problems.push("autoMode.allow[1] is not GREEN's reads entry, verbatim");
    const applies = allow[2] ?? "";
    if (!applies.startsWith(GREEN_APPLIES)) problems.push("autoMode.allow[2] does not start with GREEN's applies entry, verbatim");
    for (const clause of NEVER_CLAUSES) {
      if (!applies.includes(clause)) problems.push(`the applies entry is missing the clause "${clause}"`);
    }
    if (new Set(allow).size !== allow.length) problems.push("autoMode.allow has duplicate entries");
  }

  const env = auto.environment;
  if (!Array.isArray(env) || env.some((e) => typeof e !== "string" || e.trim() === "")) {
    problems.push("autoMode.environment is missing, or holds an empty or non-string entry");
  } else {
    if (env[0] !== "$defaults") problems.push('autoMode.environment must start with "$defaults"');
    const text = env.join("\n");
    for (const name of ENVIRONMENT_MUST_NAME) {
      if (!text.includes(name)) problems.push(`autoMode.environment does not name ${name}`);
    }
    for (const marker of STALE_ENVIRONMENT_MARKERS) {
      if (text.includes(marker)) problems.push(`autoMode.environment carries the stale user-level text "${marker}"`);
    }
    if (new Set(env).size !== env.length) problems.push("autoMode.environment has duplicate entries");
  }
  return problems;
}

export function install({
  canonicalPath,
  targetPath,
  expectSha256,
  serializeFn = serialize,
  log = console.log,
  err = console.error,
}) {
  const stop = (why) => {
    err(`STOP: ${why}`);
    err(`STOP: nothing was written to ${targetPath}.`);
    return 1;
  };

  let canonicalBytes;
  try {
    canonicalBytes = fs.readFileSync(canonicalPath);
  } catch (e) {
    return stop(`cannot read the reviewed file ${canonicalPath} (${e.code ?? e.message})`);
  }
  const actual = sha256(canonicalBytes);
  if (actual !== expectSha256) return stop(`the reviewed file's sha256 is ${actual}, expected ${expectSha256}`);

  let canonical;
  try {
    canonical = JSON.parse(canonicalBytes.toString("utf8"));
  } catch (e) {
    return stop(`the reviewed file is not valid JSON (${e.message})`);
  }
  const problems = requiredProblems(canonical);
  if (problems.length > 0) {
    for (const p of problems) err(`  - ${p}`);
    return stop(`the reviewed file fails ${problems.length} required check(s)`);
  }

  if (fs.existsSync(targetPath)) {
    let current;
    try {
      current = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    } catch (e) {
      return stop(`${targetPath} exists and is not valid JSON (${e.message}). Move it aside yourself if the reviewed file should replace it`);
    }
    if (isDeepStrictEqual(current, canonical)) {
      log(`ALREADY INSTALLED: ${targetPath} already holds the reviewed settings (sha256 ${sha256(fs.readFileSync(targetPath))}). Nothing changed.`);
      return 0;
    }
    return stop(
      `${targetPath} exists and differs from the reviewed file. This installer never merges into or overwrites a settings file. Compare the two, then move it aside yourself if the reviewed file should replace it`,
    );
  }

  let text;
  try {
    text = serializeFn(canonical);
  } catch (e) {
    return stop(`could not serialise the settings (${e.message})`);
  }
  let reparsed;
  try {
    reparsed = JSON.parse(text);
  } catch (e) {
    return stop(`the produced JSON does not parse (${e.message})`);
  }
  if (!isDeepStrictEqual(reparsed, canonical)) return stop("the produced JSON parses but does not equal the reviewed settings");
  const again = requiredProblems(reparsed);
  if (again.length > 0) return stop(`the produced JSON fails ${again.length} required check(s)`);

  const tmp = `${targetPath}.tmp-${process.pid}`;
  let created = false;
  try {
    fs.writeFileSync(tmp, text, { flag: "wx", mode: 0o600 });
    created = true;
    const back = fs.readFileSync(tmp, "utf8");
    if (back !== text || !isDeepStrictEqual(JSON.parse(back), canonical)) throw new Error("the temp file did not read back identically");
    // link, not rename: link refuses to replace a target that appeared since the check above.
    fs.linkSync(tmp, targetPath);
  } catch (e) {
    return stop(`writing failed (${e.code ?? e.message})`);
  } finally {
    if (created) fs.rmSync(tmp, { force: true });
  }

  log(`INSTALLED: ${targetPath}, mode 600, sha256 ${sha256(fs.readFileSync(targetPath))}.`);
  log("Start the apply lane in a NEW session. A session that is already running never reads this file:");
  log(`  cd ${LANE_WORKTREE} && claude --settings ${targetPath}`);
  log(`Revoke: delete ${targetPath}.`);
  return 0;
}

export function main(argv, io = {}) {
  const err = io.err ?? console.error;
  const value = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const canonicalPath = value("--canonical");
  const targetPath = value("--target");
  const expectSha256 = value("--expect-sha256");
  const usage = "usage: node install-apply-settings.mjs --canonical <reviewed json> --target <absolute path> --expect-sha256 <64 hex>";
  if (!canonicalPath || !targetPath || !/^[0-9a-f]{64}$/.test(expectSha256 ?? "")) {
    err(usage);
    return 2;
  }
  if (!path.isAbsolute(targetPath)) {
    err(`${usage}\n--target must be an absolute path`);
    return 2;
  }
  if (path.basename(targetPath) === "settings.json" || path.basename(path.dirname(targetPath)) === ".claude") {
    err(`refused: ${targetPath} is a Claude Code settings file that other sessions read. This installer writes only the apply lane's own file.`);
    return 2;
  }
  return install({ canonicalPath, targetPath, expectSha256, ...io });
}

// realpath on both sides: macOS mktemp paths live under /var, a symlink to /private/var,
// and node reports import.meta.url resolved. A plain comparison would skip main()
// there and exit 0 having done nothing.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
