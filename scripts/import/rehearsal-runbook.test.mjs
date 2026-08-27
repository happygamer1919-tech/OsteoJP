// MIG-04's acceptance, made machine-checkable.
//
// The card closes on Ivan's pasted transcript - a document cannot assert that a
// rehearsal happened. What CAN be asserted is that the runbook is executable:
// that every command it gives names a file that exists, that the guard is
// present, that the counts are stated literally rather than left as "the
// expected number", and that no command in it can reach production.
//
// THE POINT OF THE FILE-EXISTENCE ASSERTIONS: a runbook is the one artefact
// whose rot is invisible. A renamed script leaves it looking complete and fails
// only when somebody is halfway through a migration sitting.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIRM_PHRASE, EXIT } from "./run-import.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNBOOK = path.join(REPO, "docs/import/REHEARSAL.md");

const text = fs.readFileSync(RUNBOOK, "utf8");

/** Every fenced block in the runbook - i.e. everything Ivan actually types. */
const codeBlocks = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

/* ---------------- the runbook exists and is a runbook ---------------- */

test("docs/import/REHEARSAL.md exists and is not a stub", () => {
  assert.ok(fs.existsSync(RUNBOOK));
  assert.ok(text.length > 8000, "a runbook this thin cannot carry per-step STOP conditions");
});

test("every step from 1 to 8 is present, in order", () => {
  const headings = [...text.matchAll(/^## (\d)\. (.+)$/gm)].map((m) => Number(m[1]));
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.ok(headings.includes(n), `section ${n} is missing`);
  }
  assert.deepEqual([...headings], [...headings].sort((a, b) => a - b), "sections are out of order");
});

test("every numbered step carries at least one STOP condition", () => {
  // A step with a command and no STOP is a step whose failure mode is
  // "keep going and find out later".
  const sections = text.split(/^## (?=\d\. )/m).slice(1);
  for (const s of sections) {
    const title = s.split("\n")[0];
    const n = Number(title[0]);
    // §0 is preamble and §9/§10 are the close conditions and the caveats.
    // Only the EXECUTED steps need a STOP.
    if (n < 1 || n > 8) continue;
    assert.match(s, /STOP\b/, `section "${title}" has no STOP condition`);
  }
});

/* ---------------- the guard ---------------- */

test("the guard command is present and names the standalone guard script", () => {
  assert.match(text, /tsx scripts\/assert-not-prod\.ts/);
  assert.ok(
    fs.existsSync(path.join(REPO, "packages/db/scripts/assert-not-prod.ts")),
    "the runbook names a guard script that does not exist",
  );
});

test("the guard runs BEFORE the first command that opens anything", () => {
  // Order on the page is the only thing enforcing order in the sitting.
  assert.ok(
    text.indexOf("tsx scripts/assert-not-prod.ts") < text.indexOf("--emit-attachment-mapping"),
    "the guard must appear before the first pipeline command",
  );
});

test("the guard is re-asserted before the cleanup deletes", () => {
  const cleanup = text.slice(text.indexOf("## 8."));
  assert.match(cleanup, /tsx scripts\/assert-not-prod\.ts/);
  assert.ok(
    cleanup.indexOf("assert-not-prod") < cleanup.indexOf("delete from"),
    "the guard must be re-asserted before any delete statement",
  );
});

/* ---------------- NO COMMAND CAN REACH PRODUCTION ---------------- */

test("no prod ref appears in any command block", async () => {
  // The refs are NAMED in the safety prose deliberately - an operator has to
  // know which strings are forbidden. What must never happen is one appearing
  // in something typed.
  const { PROD_REFS } = await import("../../packages/db/seed/seed-guard.ts").catch(() => ({}));
  // seed-guard is TypeScript and cannot be imported under bare node; read it.
  const guardSrc = fs.readFileSync(path.join(REPO, "packages/db/seed/seed-guard.ts"), "utf8");
  const refs =
    PROD_REFS ??
    [...guardSrc.matchAll(/"([a-z0-9]{20})"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  assert.ok(refs.length >= 2, "expected at least the two known prod refs");
  for (const block of codeBlocks) {
    for (const ref of refs) {
      assert.ok(!block.includes(ref), `a command block contains production ref ${ref}`);
    }
  }
});

test("`set -a` never appears in a COMMAND - it errors in zsh", () => {
  // Checked over code blocks and not over the prose, because the prose states
  // the rule ("never `set -a`") and a whole-document scan would fail on the
  // sentence that enforces it.
  for (const block of codeBlocks) {
    assert.ok(!/\bset -a\b/.test(block), "standing rule: set -o allexport, never set -a");
  }
  assert.ok(codeBlocks.some((b) => b.includes("set -o allexport")));
  assert.ok(codeBlocks.some((b) => b.includes("set +o allexport")), "allexport must be turned back off");
});

test("no tilde path appears in any command block", () => {
  for (const block of codeBlocks) {
    assert.ok(!/(^|\s)~\//.test(block), "standing rule: absolute paths, never tilde");
  }
});

/* ---------------- THE COUNTS, STATED LITERALLY ---------------- */

test("the amostra's four counts are stated literally", () => {
  // The card's acceptance names these. "the expected number of patients" is not
  // a check anybody can perform at 22:00 on a migration night.
  assert.match(text, /\b1000 patients\b/);
  assert.match(text, /\b1000 marcacoes\b/);
  assert.match(text, /\b44 episodios\b/);
  assert.match(text, /\b22 documentos\b/);
});

test("the per-entity expectation is derived, not just restated", () => {
  // 44 episodios rows produce 44 episodes AND 44 records - the same rows twice.
  // A runbook that says "44 episodios -> 44 episodes" and stops would have the
  // operator reporting clinical_record 44 as a surprise.
  assert.match(text, /`clinical_episode` and `clinical_record` must be equal/);
  // 22 documentos is NOT the attachment count, and saying so is the point.
  assert.match(text, /\*\*`N` IS NOT 22\.\*\*/);
});

test("the to_review expectation is derived from the estado table", () => {
  for (const estado of ["realizada", "falta", "marcada"]) {
    assert.match(text, new RegExp(`\`${estado}\``), `the estado table omits ${estado}`);
  }
  // OWNER RULING B, 2026-08-25: a past-dated `marcada` is CANCELLED and imports.
  // The runbook must state the ruling, not the superseded review route - a
  // runbook still expecting these in to_review reads a correct run as a large
  // unexplained review queue.
  assert.match(text, /pastMarcadaCancelled/);
  assert.match(text, /owner ruling B/i);
  assert.match(text, /unknown_estado/);
  // The ruling that nothing maps to confirmed, carried into the runbook.
  assert.match(text, /Nothing maps to `confirmed`/);
});

/* ---------------- the commands name files that exist ---------------- */

test("every script and SQL file the runbook invokes exists", () => {
  const referenced = [
    "scripts/import/probe-amostra.mjs",
    "scripts/import/check-delivery.mjs",
    "scripts/import/copy-attachments.mjs",
    "scripts/import/mapping-config.template.json",
    "scripts/import/rehearsal-uuids.sql",
    "packages/db/scripts/rehearsal-import.ts",
    "packages/db/scripts/assert-not-prod.ts",
    "packages/db/scripts/check-pending-migrations.mjs",
    "packages/db/seed/seed-guard.ts",
  ];
  for (const rel of referenced) {
    assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is referenced but does not exist`);
    const base = rel.split("/").pop();
    assert.ok(text.includes(base), `${base} exists but the runbook never mentions it`);
  }
});

test("the confirmation phrase in the runbook is the one the runner enforces", () => {
  // Two copies of a phrase is one copy too many; this is the check that keeps
  // them equal. CLAUDE.md ratified it 2026-08-24.
  assert.equal(CONFIRM_PHRASE, "IMPORT FISIOZERO INTO PRODUCTION");
  assert.ok(text.includes(CONFIRM_PHRASE));
  const claudeMd = fs.readFileSync(path.join(REPO, "CLAUDE.md"), "utf8");
  assert.ok(claudeMd.includes(CONFIRM_PHRASE));
});

test("the exit code table matches the runner's own constants", () => {
  assert.deepEqual(EXIT, { OK: 0, FAILED: 1, BAD_INVOCATION: 2 });
  assert.match(text, /\|\s*`0`\s*\|\s*OK\s*\|/);
  assert.match(text, /\|\s*`2`\s*\|\s*BAD_INVOCATION/);
});

/* ---------------- the staging-delete permission ---------------- */

test("the staging-ledger delete is scoped to non-prod AND says never on prod", () => {
  // The dispatch requires both halves explicitly. Half of it - "you may delete
  // from migration_staging_rows" - read alone on a production night is the
  // worst sentence in this document.
  const cleanup = text.slice(text.indexOf("## 8."));
  assert.match(cleanup, /delete from\s+migration_staging_rows/i);
  // Both halves, asserted separately: the permission is worthless without the
  // prohibition, and the prohibition read alone would stop the rehearsal.
  // Blockquote markers and bold markers are stripped before matching: the
  // sentence is wrapped across lines inside a `>` quote, so a raw scan would
  // fail on the formatting rather than on the content.
  const flat = cleanup.replace(/[>*`]/g, "").replace(/\s+/g, " ");
  assert.match(flat, /permitted ONLY on a non-prod rehearsal target/i);
  assert.match(flat, /NEVER permitted on production/i);
  assert.match(flat, /There is no circumstance in which it is correct/i);
});

test("the cleanup DELEGATES its deletes and keeps NO list of its own", () => {
  // It used to carry five deletes. Eighteen tables have an FK path to
  // `patients`, so that list aborted on `patient_locations` on 2026-08-26 -
  // a second, shorter, untested copy of a delete graph the repository already
  // derives from the migrations. This asserts the copy is gone AND that the
  // delegation names the file, because a runbook that dropped the list without
  // naming a replacement would read as "the wipe is somebody else's problem".
  const cleanup = text.slice(text.indexOf("## 8."));
  assert.match(cleanup, /cleanup-test-patients\.sql/, "the delegation must name the file");
  assert.match(cleanup, /STEP 2/, "and the step within it");
  for (const t of ["attachments", "clinical_records", "clinical_episodes", "appointments", "patients"]) {
    assert.ok(
      !new RegExp(`delete from\\s+${t}\\b`, "i").test(cleanup),
      `§8 must not re-list \`delete from ${t}\` - cleanup-test-patients.sql owns the graph`,
    );
  }
  // The ONE delete it does keep, which that file is asserted never to contain.
  assert.match(cleanup, /delete from\s+migration_staging_rows/i);
});

test("the cleanup verifies BOTH triggers came back on", () => {
  // clinical_records_enforce_immutability blocks the delete of a finalized
  // record; patient_audit_log_append_only is FOR EACH STATEMENT and refused a
  // DELETE matching zero rows. Checking one of the two proves nothing about
  // the other, and a reset that left the audit trail writable would be silent.
  const cleanup = text.slice(text.indexOf("## 8."));
  assert.match(cleanup, /clinical_records_enforce_immutability/);
  assert.match(cleanup, /patient_audit_log_append_only/);
  assert.match(cleanup, /Expected `O` on BOTH rows/i);
});

/* ---------------- the blind rule ---------------- */

test("the runbook says which outputs are safe to paste and which are not", () => {
  assert.match(text, /safe to paste back in full/);
  assert.match(text, /\*\*Do not paste:\*\*/);
  // The three files that carry personal data are each named as unpasteable.
  const donot = text.slice(text.indexOf("**Do not paste:**"));
  for (const f of ["mapping-config.local.json", "attachment-mapping.json", "checkpoint.jsonl"]) {
    assert.ok(donot.includes(f), `${f} is not named in the do-not-paste list`);
  }
});
