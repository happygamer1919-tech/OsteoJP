// A PRE-PUSH SECRET SCAN THAT FAILS CLOSED. Exit 0 means every added line was
// read and nothing matched. ANY other exit blocks the push: 1 is a finding, 2 is
// a scan that could not run.
//
// ===========================================================================
// WHY THIS FILE EXISTS: A SCAN THAT REPORTED SAFETY IT NEVER CHECKED
// ===========================================================================
// 2026-09-13 17:23:16Z, PURPLE, the push behind PR #1322. The lane's pre-push
// check was one shell line:
//
//   git grep -n -I -E '(sk_live|eyJhbGci|postgresql://[^@ ]+:[^@ ]+@(?!127\.0\.0\.1))' -- <files>; git push ...
//
// `(?!` is a Perl lookahead. POSIX ERE has no such thing, so git refused the
// pattern ("repetition-operator operand invalid", exit 128) and read no line at
// all. The `;` then ran the push anyway. Nineteen seconds later a second scan,
// run AFTER the push, did match (a sha256 inside a board card, caught by a
// generic 40-character class) and printed "scan exit 0 (1 = no match)" while
// auto-merge was being armed in the same batch.
//
// Two shapes, one failure: an errored scan and a positive scan, and neither
// stopped anything. The owner classes it as fails-and-reports-success, the
// seventh instance. Card: LE-pre-push-secret-scan-fails-open.
//
// THREE PROPERTIES, EACH ENFORCED HERE AND PROVEN IN secret-scan.test.mjs:
//
//   1. EVERY PATTERN PROVES ITSELF BEFORE ANY LINE IS READ. Each carries one
//      sample it must match and one it must not. A pattern that does not
//      compile, or compiles and matches nothing, is exit 2 - never a quiet 0.
//   2. EVERY ERROR IS EXIT 2. A git that fails, a base that cannot be found, an
//      unreadable stdin. No path through main() reaches 0 without the scan
//      having read the diff.
//   3. GIT STOPS THE PUSH, NOT WHOEVER READS THE OUTPUT. scripts/git-hooks/pre-push
//      runs this, and git refuses a push whose pre-push hook exits non-zero.
//      Nothing is chained with `;` or `&&`, so nothing can be chained wrongly.
//
// A FINDING NEVER PRINTS THE VALUE. File, line, pattern name and length only. A
// scanner that echoes a secret into a terminal log has leaked it.
//
// WHAT IT DOES NOT CATCH, stated so nobody reads more into a pass: a secret with
// no recognisable shape (a bare 32-hex Twilio auth token on a line that does not
// name it), anything inside a binary file (counted and reported, never read),
// and anything already on the base. It reads ADDED lines only.
//
// Usage:
//   node scripts/secret-scan.mjs                 # origin/main...HEAD
//   node scripts/secret-scan.mjs --range A..B    # an explicit range
//   node scripts/secret-scan.mjs --pre-push      # what the hook runs; reads git's stdin
//
// Activate the hook in a clone (config shared by all its worktrees):
//   git config core.hooksPath scripts/git-hooks
//
// Run the proofs: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Joined at run time, so this file never contains the shapes it hunts for. */
const j = (...parts) => parts.join("");

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** The issuer inside a JWT's payload, or null when it cannot be read. */
function jwtIssuer(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).iss ?? null;
  } catch {
    return null;
  }
}

/**
 * A value that is obviously a stand-in: `[YOUR-PASSWORD]`, `<password>`,
 * `${DB_PASSWORD}`, `****`, `changeme`. Documentation is full of these, and a
 * gate that blocks on them gets bypassed, which is worse than no gate.
 */
const PLACEHOLDER =
  /^(?:\[[^\]]*\]|<[^>]*>|\{[^}]*\}|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\*+|x+|\.{3}|password|postgres|secret|redacted|changeme|your[-_a-z]*)$/i;

/**
 * A value that SAYS it is a fixture. CALIBRATED 2026-09-13 against 583 commits
 * of origin/main (c8f00ccf..39762d98): the first cut of this scanner raised 32
 * findings there and every one was a test fixture - `test-only-hs256-secret-
 * value-not-a-real-credential`, `ci-fixture-not-a-secret-at-least-32-chars`,
 * passwords like `p` and `pw`, hosts under example.com and .invalid. A gate that
 * noisy is bypassed with --no-verify, which is failing open by a longer road.
 * The price, stated: a real secret that happens to contain one of these words
 * is not caught.
 */
const SELF_DECLARED_FIXTURE = /not-a-(?:real-)?(?:secret|credential)|test-only|fixture|dummy|fake|placeholder|redacted|do-not-print/i;

/** RFC 2606 / 6761 names that never resolve to a real database. */
const RESERVED_HOST = /^(?:[^@/:]*\.)?(?:example\.(?:com|net|org)|[^@/:]+\.(?:example|invalid|test|localhost))(?:[:/]|$)/i;

/**
 * THE PATTERNS. Each `positive()` must match and each `negative()` must not, or
 * the scan refuses to run (exit 2). `ignore(match)` removes a match that has the
 * shape but is not a secret; every ignore rule has a negative sample exercising it.
 */
export const PATTERNS = [
  {
    // Supabase service-role and anon keys, any JWT. The Supabase CLI's local
    // demo keys (iss "supabase-demo") are published in its source and are not
    // secrets; everything else with this shape is treated as one.
    name: "jwt",
    source: "\\beyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}",
    ignore: (m) => jwtIssuer(m[0]) === "supabase-demo",
    positive: () =>
      [b64url({ alg: "HS256", typ: "JWT" }), b64url({ iss: "supabase", role: "service_role" }), "s".repeat(24)].join("."),
    negative: () =>
      [b64url({ alg: "HS256", typ: "JWT" }), b64url({ iss: "supabase-demo", role: "anon" }), "s".repeat(24)].join("."),
  },
  {
    // A connection string with a password, to anything but this machine. The
    // lookahead is a JavaScript one - the exact construct the 2026-09-13 grep
    // could not express. A password shorter than 8 characters, with no letter
    // in it, a placeholder, or pointed at a reserved test host is a fixture
    // (calibration note on SELF_DECLARED_FIXTURE above).
    name: "postgres-url-with-password",
    source:
      "\\bpostgres(?:ql)?://[^\\s:@/]+:([^\\s@/]+)@(?!(?:127\\.0\\.0\\.1|localhost|0\\.0\\.0\\.0|host\\.docker\\.internal)[:/])([^\\s\"'`]*)",
    ignore: (m) =>
      m[1].length < 8 ||
      !/[A-Za-z]/.test(m[1]) ||
      PLACEHOLDER.test(m[1]) ||
      SELF_DECLARED_FIXTURE.test(m[1]) ||
      m[1].includes("${") ||
      RESERVED_HOST.test(m[2]),
    positive: () => j("postgres", "ql://postgres.abcdefgh:", "Tr0ub4dor", "Horse9@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"),
    negative: () =>
      [
        j("postgres", "ql://postgres:postgres@127.0.0.1:54322/postgres"),
        j("postgres", "ql://u:[YOUR-PASSWORD]@db.example.com/x"),
        j("postgres", "ql://postgres.abc:p@ss/w0rd@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"),
        j("postgres", "ql://postgres.x:redacted@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"),
        j("postgres", "://postgres.x:s3cr3t-do-not-print@db.example.invalid:5432/postgres"),
        j("postgres", "ql://postgres.x:sekrit-value@db.example.invalid:5432/postgres"),
        j("postgres", "ql://postgres.x:127.0.0.1@aws-0-eu-central-1.pooler.supabase.com:6543/db"),
      ].join(" "),
  },
  {
    name: "private-key-block",
    source: "-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----",
    positive: () => j("-----BEGIN ", "RSA PRIVATE", " KEY-----"),
    negative: () => j("-----BEGIN ", "PUBLIC", " KEY-----"),
  },
  {
    name: "stripe-key",
    source: "\\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}",
    positive: () => j("sk", "_live_", "a1B2c3D4e5F6g7H8i9"),
    negative: () => j("pk", "_live_", "a1B2c3D4e5F6g7H8i9"),
  },
  {
    name: "resend-key",
    source: "\\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}",
    positive: () => j("re", "_Ab12Cd34_", "Ef56Gh78Ij90Kl12Mn34"),
    negative: () => "re_render_count",
  },
  {
    name: "aws-access-key-id",
    source: "\\bAKIA[0-9A-Z]{16}\\b",
    positive: () => j("AK", "IA", "ABCDEFGHIJ234567"),
    negative: () => "AKIA_IS_A_PREFIX",
  },
  {
    name: "github-token",
    source: "\\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})",
    positive: () => j("gh", "p_", "A".repeat(18), "b1".repeat(9)),
    negative: () => "ghp_short",
  },
  {
    name: "supabase-access-token",
    source: "\\b(?:sbp_[a-f0-9]{40}|sb_secret_[A-Za-z0-9_-]{20,})",
    positive: () => j("sb", "p_", "0123456789abcdef".repeat(2), "01234567"),
    negative: () => "sbp_notahexvalue",
  },
  {
    name: "llm-api-key",
    source: "\\bsk-(?:ant|proj)-[A-Za-z0-9_-]{20,}",
    positive: () => j("sk", "-ant-", "api03-", "Q".repeat(24)),
    negative: () => "sk-ant-short",
  },
  {
    name: "google-api-key",
    source: "\\bAIza[0-9A-Za-z_-]{35}\\b",
    positive: () => j("AI", "za", "Sy", "B".repeat(33)),
    negative: () => "AIzaTooShort",
  },
  {
    name: "slack-token",
    source: "\\bxox[baprs]-[A-Za-z0-9-]{10,}",
    positive: () => j("xo", "xb-", "1234567890-abcdefghij"),
    negative: () => "xoxo-hugs",
  },
  {
    // An env-style assignment of a secret-NAMED variable to a literal value -
    // the shape a pasted .env file takes inside a doc or a script. The value
    // must mix letters and digits and must not be code (`s.SERVICE_ROLE_KEY`,
    // `readKey()`), a placeholder, or an interpolation.
    name: "secret-named-assignment",
    source:
      "\\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|AUTH_KEY|SERVICE_ROLE_KEY)[A-Z0-9_]*[\"']?\\s*[=:]\\s*[\"']?([^\\s\"'`,;]{16,})",
    ignore: (m) => {
      const v = m[1];
      if (PLACEHOLDER.test(v) || SELF_DECLARED_FIXTURE.test(v) || v.startsWith("$") || /[(){}]/.test(v)) return true;
      if (/^[A-Za-z_$][\w$]*(?:\.[\w$]+)+$/.test(v)) return true; // a member expression
      return !(/[A-Za-z]/.test(v) && /[0-9]/.test(v));
    },
    positive: () => j("TWILIO_AUTH", "_TOKEN=", "9f8e7d6c5b4a39281706f5e4d3c2b1a0"),
    negative: () =>
      [
        "SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY_FROM_STATUS, TOKEN_TTL_SECONDS = 1234567890123456",
        'TEST_SECRET = "test-only-hs256-secret-value-not-a-real-credential"',
        "PATIENT_SESSION_SECRET: ci-fixture-not-a-secret-at-least-32-chars",
      ].join("\n"),
  },
];

/** A committed env file. `.env.example` is the one that is meant to be committed. */
const ENV_FILE = /(?:^|\/)\.env(?:\.[^/]+)?$/;
const isEnvFile = (path) => ENV_FILE.test(path) && !path.endsWith(".env.example");

/** Compiles every pattern. Throws, naming the pattern, on any that does not compile. */
export function compilePatterns(defs) {
  return defs.map((d) => {
    try {
      return { ...d, re: new RegExp(d.source, d.flags ?? "g") };
    } catch (e) {
      throw new Error(`pattern "${d.name}" does not compile: ${e.message}`);
    }
  });
}

function matchesIn(text, p) {
  const out = [];
  p.re.lastIndex = 0;
  for (const m of text.matchAll(p.re)) if (!(p.ignore && p.ignore(m))) out.push(m);
  return out;
}

/** Throws unless every pattern matches its positive sample and not its negative one. */
export function selfTest(compiled) {
  if (compiled.length === 0) throw new Error("no patterns: a scan with nothing to look for is not a scan");
  for (const p of compiled) {
    if (matchesIn(p.positive(), p).length === 0) {
      throw new Error(`pattern "${p.name}" does not match its own positive sample, so it would match nothing`);
    }
    if (matchesIn(p.negative(), p).length !== 0) {
      throw new Error(`pattern "${p.name}" matches its own negative sample`);
    }
  }
}

/**
 * The ADDED lines of a `git diff --unified=0` output, with their new line
 * numbers. File headers are only read between `diff --git` and the first hunk,
 * so an added line whose text starts with "++ " is content, not a header.
 */
export function addedLines(diff) {
  const lines = [];
  let binary = 0;
  let file = null;
  let inHeader = false;
  let n = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inHeader = true;
      file = null;
      continue;
    }
    if (inHeader) {
      if (raw.startsWith("+++ ")) file = raw === "+++ /dev/null" ? null : raw.slice(4).replace(/^b\//, "");
      else if (raw.startsWith("Binary files ")) binary += 1;
      const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        inHeader = false;
        n = Number(hunk[1]);
      }
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      n = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && file !== null) {
      lines.push({ file, line: n, text: raw.slice(1) });
      n += 1;
    }
  }
  return { lines, binary };
}

/** Findings for a set of added lines. Carries the match LENGTH, never the value. */
export function scanLines(lines, compiled) {
  const findings = [];
  for (const { file, line, text } of lines) {
    for (const p of compiled) {
      for (const m of matchesIn(text, p)) findings.push({ file, line, pattern: p.name, length: m[0].length });
    }
  }
  return findings;
}

function git(args, cwd) {
  const r = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  if (r.error) throw new Error(`git ${args[0]} could not be run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} exited ${r.status}: ${(r.stderr || "").trim()}`);
  return r.stdout;
}

const ZERO_SHA = /^0+$/;

function hasCommit(sha, cwd) {
  const r = spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd });
  return r.status === 0;
}

function mergeBaseWithMain(target, cwd) {
  return git(["merge-base", "refs/remotes/origin/main", target], cwd).trim();
}

/**
 * The ranges to scan. `--pre-push` reads git's own lines
 * `<local ref> <local sha> <remote ref> <remote sha>`: a deletion adds nothing;
 * an update scans from what the remote already has; a new branch scans from its
 * merge base with origin/main. No resolvable base is an ERROR, never a skip.
 */
export function resolveRanges(argv, cwd, readStdin) {
  if (argv.includes("--pre-push")) {
    const ranges = [];
    for (const row of readStdin().split("\n").filter((l) => l.trim() !== "")) {
      const [localRef, localSha, , remoteSha] = row.trim().split(/\s+/);
      if (!localSha || !remoteSha) throw new Error(`unreadable pre-push line: "${row}"`);
      if (ZERO_SHA.test(localSha)) continue;
      const base = !ZERO_SHA.test(remoteSha) && hasCommit(remoteSha, cwd) ? remoteSha : mergeBaseWithMain(localSha, cwd);
      ranges.push({ base, target: localSha, label: localRef });
    }
    return ranges;
  }
  const i = argv.indexOf("--range");
  if (i !== -1) {
    const spec = argv[i + 1] ?? "";
    const [a, b] = spec.split("..");
    if (!a || !b) throw new Error(`--range needs A..B, got "${spec}"`);
    return [{ base: git(["rev-parse", "--verify", a], cwd).trim(), target: git(["rev-parse", "--verify", b], cwd).trim(), label: spec }];
  }
  const target = git(["rev-parse", "--verify", "HEAD"], cwd).trim();
  return [{ base: mergeBaseWithMain(target, cwd), target, label: "HEAD" }];
}

export function main(argv, { cwd = process.cwd(), readStdin = () => readFileSync(0, "utf8"), log = console.log, err = console.error } = {}) {
  try {
    const compiled = compilePatterns(PATTERNS);
    selfTest(compiled);
    const ranges = resolveRanges(argv, cwd, readStdin);

    const findings = [];
    const files = new Set();
    let lineCount = 0;
    let binary = 0;
    for (const { base, target } of ranges) {
      const names = git(["diff", "--no-renames", "--name-only", "--diff-filter=ACMRT", base, target], cwd)
        .split("\n")
        .filter(Boolean);
      for (const name of names) {
        files.add(name);
        if (isEnvFile(name)) findings.push({ file: name, line: 0, pattern: "committed-env-file", length: 0 });
      }
      const diff = git(
        ["diff", "--no-color", "--no-ext-diff", "--no-renames", "--unified=0", "--diff-filter=ACMRT", base, target],
        cwd,
      );
      const added = addedLines(diff);
      lineCount += added.lines.length;
      binary += added.binary;
      findings.push(...scanLines(added.lines, compiled));
    }

    if (findings.length > 0) {
      err(`secret-scan: ${findings.length} finding(s). THE PUSH IS BLOCKED.`);
      for (const f of findings) {
        const where = f.line ? `${f.file}:${f.line}` : f.file;
        err(`  ${where}  ${f.pattern}${f.length ? `  (${f.length} chars, value not printed)` : ""}`);
      }
      err("A false positive is fixed in scripts/secret-scan.mjs with a negative sample that proves it.");
      err("Bypassing the hook (--no-verify) is owner-confirmable.");
      return 1;
    }
    log(
      `secret-scan: clean. ${lineCount} added line(s) in ${files.size} file(s) across ${ranges.length} ref(s), ` +
        `${compiled.length} patterns, each proven against its own samples` +
        (binary ? `; ${binary} binary file(s) NOT read` : ""),
    );
    return 0;
  } catch (e) {
    err(`secret-scan: ERROR, the scan did not run: ${e.message}`);
    err("secret-scan: exit 2. THE PUSH IS BLOCKED. An unscanned push is not a clean one.");
    return 2;
  }
}

if (process.argv[1] && process.argv[1].endsWith("secret-scan.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
