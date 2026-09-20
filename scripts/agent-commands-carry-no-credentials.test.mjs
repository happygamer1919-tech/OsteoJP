/**
 * No tracked file under `.claude/` may carry a credential VALUE.
 *
 * ==========================================================================
 * WHY THIS EXISTS
 * ==========================================================================
 * A tracked agent command carried a live-format password on a `Password:` line
 * from 2026-06-18 until 2026-09-20. Nothing caught it for three months, and the
 * reason is structural rather than careless:
 *
 *   scripts/secret-scan.mjs reads ADDED LINES ONLY (its header says so). A
 *   value that is already on the base branch is never looked at again. It is
 *   the right design for a pre-push hook - rescanning history on every push
 *   would be slow and would fail forever on anything already burned - and it
 *   means a secret that once landed is invisible to it from the next commit on.
 *
 * So this is the other half: a WHOLE-TREE assertion over the directory where
 * agent commands live, run by `pnpm test:scripts`, which the required CI job
 * already executes. It is scoped to `.claude/` deliberately: that is where a
 * human writes prose for a machine to follow, which is exactly where a
 * convenience credential gets pasted, and a whole-repo version would need an
 * allowlist of every fixture in the codebase and would rot into noise.
 *
 * ==========================================================================
 * IT NEVER PRINTS A VALUE
 * ==========================================================================
 * A failure names the file, the line number, the label that matched and the
 * LENGTH of the value. A guard that echoes a secret into a CI log has leaked
 * it to everyone who can read the run.
 *
 * ==========================================================================
 * IT PROVES ITSELF NON-VACUOUS
 * ==========================================================================
 * A guard that cannot fail is worse than no guard, because it reads as
 * protection. The second test feeds the detector a synthetic credential built
 * at run time (never a real one, and never a literal in this file) and asserts
 * it fires; the third feeds it the placeholder shapes that must NOT fire.
 *
 * ==========================================================================
 * WHAT IT DOES NOT CLAIM
 * ==========================================================================
 * It catches a LABELLED value - the shape a pasted credential actually takes in
 * prose. It does not catch an unlabelled high-entropy string, and it says
 * nothing about history: a value that was once committed stays in history, and
 * rewriting history is a force push, which is a standing never. A value found
 * here is burned and must be rotated at the provider, not merely deleted.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Joined at run time so this file never contains the shapes it hunts for. */
const j = (...parts) => parts.join("");

/**
 * The labels a pasted credential sits behind in prose, English and Portuguese.
 * `Email:` is deliberately NOT here - an address is not a secret, it appears in
 * 20 tracked files as a fixture name, and banning it would make this guard
 * noise. The password beside it is the part that authenticates.
 */
const LABELS = [
  "password",
  "passwd",
  "senha",
  "palavra-passe",
  "secret",
  "token",
  "api key",
  "api_key",
  "apikey",
  "service role key",
  "service_role_key",
  "private key",
];

const LABEL_LINE = new RegExp(
  String.raw`^\s*[-*>\s]*\*{0,2}(${LABELS.map((l) => l.replace(/[-_ ]/g, "[-_ ]")).join("|")})\*{0,2}\s*[:=]\s*(.+?)\s*$`,
  "i",
);

/**
 * Shapes that are NOT a credential even though they sit behind the label.
 * Kept deliberately tight: every entry here is a hole, so each one is a shape
 * that cannot be a working value rather than a convenience.
 */
const NOT_A_VALUE = [
  /^[`'"]?\s*$/, //                     empty
  /^<.*>$/, //                          <your-password>
  /^\$\{?[A-Z_][A-Z0-9_]*\}?$/, //      $PASSWORD / ${PASSWORD}
  /^[A-Z_][A-Z0-9_]*$/, //              a bare env var NAME, not a value
  /\b(your|example|placeholder|redacted|removed|rotated|changeme|dummy|fake|sample|n\/a|none|tbd)\b/i,
  /^[.*x_-]+$/i, //                     ****, xxxx, ----
  /^see\b/i, //                         "see 1Password"
  /^\(/, //                             "(in the vault)"
  /^(in|from|via|ask|stored|lives)\b/i, // "in ~/osteojp-secrets/..."
  /^[`'"]?(the|a|an)\b/i, //            prose
];

/** A value short enough that it cannot authenticate anything. */
const TOO_SHORT = 8;

export function findLabelledCredentials(text, file = "<memory>") {
  const findings = [];
  const lines = text.split("\n");
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const m = LABEL_LINE.exec(line);
    if (!m) continue;
    const label = m[1];
    const value = m[2].replace(/^[`'"]|[`'"]$/g, "").trim();
    if (value.length < TOO_SHORT) continue;
    if (NOT_A_VALUE.some((re) => re.test(value))) continue;
    // Prose behind a label: "Password: the one in the vault, ask Ivan".
    if (/\s/.test(value)) continue;
    findings.push({ file, line: i + 1, label, length: value.length, fenced });
  }
  return findings;
}

function trackedUnderDotClaude() {
  const out = execFileSync("git", ["ls-files", "-z", ".claude/"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

test("no tracked file under .claude/ carries a labelled credential value", () => {
  const files = trackedUnderDotClaude();
  assert.ok(
    files.length > 0,
    "expected tracked files under .claude/ - if this is 0 the guard is scanning nothing",
  );

  const findings = [];
  for (const rel of files) {
    let text;
    try {
      text = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue; // binary or unreadable: nothing to read as prose
    }
    if (text.includes("\0")) continue;
    findings.push(...findLabelledCredentials(text, rel));
  }

  // THE VALUE IS NEVER PRINTED. File, line, label and length only.
  const report = findings
    .map((f) => `  ${f.file}:${f.line} - a ${f.label} value of ${f.length} characters`)
    .join("\n");

  assert.equal(
    findings.length,
    0,
    `A credential value is committed under .claude/:\n${report}\n\n` +
      "Remove the value from HEAD. Deleting it does NOT unburn it: it stays in history, " +
      "and rewriting history is a force push, which is a standing never. Rotate or delete " +
      "the credential at the provider as well.",
  );
});

test("THE GUARD CAN FAIL: a synthetic labelled credential is detected", () => {
  // Built at run time from fragments, so this file never contains a value that
  // looks like a secret to any other scanner, including scripts/secret-scan.mjs.
  const synthetic = [
    "# A command file",
    "",
    "## Target",
    "",
    "URL: https://example.invalid",
    `Email: someone@example.invalid`,
    j("Password: ", "Qx7", "!vT2", "mKp9"),
    "",
  ].join("\n");

  const found = findLabelledCredentials(synthetic, "fixture.md");
  assert.equal(found.length, 1, "the detector did not fire on a synthetic credential");
  assert.equal(found[0].label.toLowerCase(), "password");
  assert.equal(found[0].line, 7);
  assert.equal(found[0].length, 11);
});

test("and it does NOT fire on the shapes that are not credentials", () => {
  const benign = [
    "Password: <your-password>",
    "Password: $PORTAL_PASSWORD",
    "Password: PATIENT_SESSION_SECRET",
    "Password: (in ~/osteojp-secrets/new-prod.env)",
    "Password: see 1Password, entry OsteoJP portal",
    "Password: the one reception uses",
    "Password: ********",
    "Password: changeme",
    "Token: n/a",
    "Secret: redacted",
    "Password: abc", // shorter than TOO_SHORT
  ].join("\n");

  const found = findLabelledCredentials(benign, "benign.md");
  assert.deepEqual(
    found.map((f) => f.line),
    [],
    "the detector fired on a placeholder, which would make it noise and get it disabled",
  );
});

test("a credential inside a fenced code block is STILL detected", () => {
  // A value in ``` is still a value. The fence is tracked only so the finding
  // can say where it was; it is never a reason to skip the line. Pinned because
  // "it was only in an example block" is the obvious next exemption to ask for.
  const inFence = ["```", j("Password: ", "Zr4", "#nQ8", "wLd1"), "```"].join("\n");
  const found = findLabelledCredentials(inFence, "fenced.md");
  assert.equal(found.length, 1, "a fenced credential must not be exempt");
  assert.equal(found[0].fenced, true);
});
