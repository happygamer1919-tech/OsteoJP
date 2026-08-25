// The PRODUCTION runbook is executable, states the ruling the code implements,
// and cannot tell anyone to delete the production ledger.
//
// The dangerous failure for this file is not a typo. It is DRIFT: the runbook
// keeps describing a rule the code no longer has, and nobody notices until the
// one night the extraction cannot be repeated.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNBOOK = path.join(REPO, "docs/import/PROD-RUN.md");
const text = fs.readFileSync(RUNBOOK, "utf8");
const codeBlocks = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

test("the runbook exists and is not a stub", () => {
  assert.ok(fs.existsSync(RUNBOOK));
  assert.ok(text.length > 8000);
});

test("every section it names exists on disk", () => {
  for (const rel of [
    "scripts/import/legacy-staff-accounts.sql",
    "scripts/import/preflight-patient-numbers.sql",
    "scripts/import/rehearsal-uuids.sql",
    "scripts/import/check-delivery.mjs",
    "scripts/import/copy-attachments.mjs",
    "scripts/import/mapping-config.template.json",
    "packages/db/scripts/prod-import.ts",
    "packages/db/scripts/assert-not-prod.ts",
    "docs/import/REHEARSAL.md",
  ]) {
    assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is referenced but missing`);
    assert.ok(text.includes(rel.split("/").pop()), `${rel} exists but is never mentioned`);
  }
});

/* ---------------- it must never say "delete the ledger" ---------------- */

test("it NEVER instructs a delete from migration_staging_rows", () => {
  // The rehearsal permits this on a scratch project. On production the ledger is
  // the only record of what was imported, on an extraction that cannot be
  // repeated - and it is also what makes a re-run resume rather than duplicate.
  assert.ok(!/delete\s+from\s+migration_staging_rows/i.test(text));
  assert.ok(!/delete\s+from\s+patients/i.test(text));
  assert.ok(!/delete\s+from\s+appointments/i.test(text));
});

test("it says so explicitly, rather than merely omitting it", () => {
  // An omission is not an instruction. Someone who has just run the rehearsal
  // has its cleanup section in their head.
  assert.match(text, /There is no cleanup section/i);
  assert.match(text, /never.{0,40}deleted?.{0,60}production|not delete from\s+`?migration_staging_rows/is);
});

/* ---------------- OWNER RULING B, and it must match the code ---------------- */

test("the estado table states ruling B: past-dated marcada is CANCELLED", () => {
  assert.match(text, /owner ruling B/i);
  assert.match(text, /`cancelled`/);
  assert.match(text, /pastMarcadaCancelled/);
});

test("the runbook's ruling matches what the ADAPTER actually does", () => {
  // THE ASSERTION THAT MATTERS. A runbook describing a rule the code does not
  // have is worse than no runbook: it makes a correct run look wrong.
  const adapter = fs.readFileSync(
    path.join(REPO, "packages/db/src/migration/sources/fisiozero.ts"),
    "utf8",
  );
  assert.match(adapter, /status: "cancelled", pastDatedMarcada: true/);
  assert.ok(
    !/reason: "marcada_in_the_past"/.test(adapter),
    "the adapter still routes past marcada to review - the runbook and the code disagree",
  );
  // The runbook MAY name the superseded reason - explaining what changed is the
  // point of a ruling - but only in the past tense. What it must never do is
  // present it as a current outcome, so the ESTADO TABLE itself must be clean.
  const table = text.slice(text.indexOf("| `estado` |"), text.indexOf("**Owner ruling B is live"));
  assert.ok(table.length > 0, "the estado table must exist");
  assert.ok(
    !/marcada_in_the_past/.test(table),
    "the estado table still lists the superseded review reason as an outcome",
  );
  assert.match(table, /\*\*`cancelled`\*\*/);
  // And every mention elsewhere must be marked as superseded.
  for (const m of text.matchAll(/.{0,120}marcada_in_the_past.{0,120}/gs)) {
    assert.match(
      m[0],
      /no longer exists|superseded|Before the ruling/i,
      `marcada_in_the_past is named without saying it is superseded: ${m[0].slice(0, 80)}`,
    );
  }
});

/* ---------------- the phrase ---------------- */

test("the confirmation phrase step is present and typed, not passed as a flag", () => {
  assert.ok(text.includes("IMPORT FISIOZERO INTO PRODUCTION"));
  assert.match(text, /not echoed/i);
  // It must never instruct --confirm on the command line for the prod entrypoint.
  for (const b of codeBlocks) {
    if (b.includes("prod-import.ts")) {
      assert.ok(!/--confirm/.test(b), "prod-import must never be invoked with --confirm");
    }
  }
});

test("it uses prod-import.ts, never rehearsal-import.ts, for the real run", () => {
  for (const b of codeBlocks) {
    assert.ok(!/rehearsal-import\.ts/.test(b), "the production runbook must not invoke the rehearsal entrypoint");
  }
});

/* ---------------- the guard inversion, which is the easiest thing to misread */

test("it warns that assert-not-prod is EXPECTED to refuse here", () => {
  // A `0` from that guard on production means the shell is pointed at the wrong
  // database. Reading it as "green = good" is the single most likely misread in
  // this document.
  const s = text.slice(text.indexOf("assert-not-prod"));
  assert.match(s, /EXPECTED:\s*`?REFUSED/i);
  assert.match(s, /STOP IF IT EXITS `0`/i);
});

/* ---------------- ordering: the things that must precede the import -------- */

test("legacy staff accounts and the number preflight come BEFORE any import", () => {
  const staff = text.indexOf("legacy-staff-accounts.sql");
  const preflight = text.indexOf("preflight-patient-numbers.sql");
  const apply = text.indexOf("--apply");
  assert.ok(staff > -1 && staff < apply, "staff accounts must precede --apply");
  assert.ok(preflight > -1 && preflight < apply, "the preflight must precede --apply");
});

test("the byte copy comes before the row import", () => {
  const copy = text.indexOf("copy-attachments.mjs");
  const apply = text.indexOf("--apply");
  assert.ok(copy > -1 && copy < apply, "attachments must be in the bucket before rows are written");
});

test("preview precedes apply, and the freeze between them is stated", () => {
  const preview = text.indexOf("### 3.3 Preview");
  const apply = text.indexOf("### 3.4 Apply");
  assert.ok(preview > -1 && apply > preview);
  assert.match(text, /freeze/i);
  assert.match(text, /Nothing has changed on the platform since the preview/i);
});

test("a backup step exists before the first write", () => {
  const backup = text.search(/Take a backup now/i);
  const apply = text.indexOf("--apply");
  assert.ok(backup > -1 && backup < apply, "the backup is the only undo and must precede the write");
});

/* ---------------- two clinics, one ledger ---------------- */

test("both clinics are sequenced, with separate configs and ONE ledger", () => {
  assert.match(text, /Linda-a-Velha/);
  assert.match(text, /Castelo Branco/);
  assert.match(text, /mapping-lv\.json/);
  assert.match(text, /mapping-cb\.json/);
  assert.match(text, /staging ledger is SHARED/i);
});

test("it warns the CB reconciliation is cumulative", () => {
  // Otherwise a correct CB run reads as having double-counted.
  assert.match(text, /cumulative/i);
});

/* ---------------- standing conventions ---------------- */

test("`set -a` never appears in a command; allexport is turned back off", () => {
  for (const b of codeBlocks) assert.ok(!/\bset -a\b/.test(b));
  assert.ok(codeBlocks.some((b) => b.includes("set -o allexport")));
  assert.ok(codeBlocks.some((b) => b.includes("set +o allexport")));
});

test("no tilde path in any command block", () => {
  for (const b of codeBlocks) assert.ok(!/(^|\s)~\//.test(b));
});

test("the paste-back list exists and excludes the three personal-data files", () => {
  const donot = text.slice(text.indexOf("Never paste:"));
  for (const f of ["mapping-lv.json", "attachment-mapping", "checkpoint-"]) {
    assert.ok(donot.includes(f), `${f} must be named as unpasteable`);
  }
  assert.match(text, /Every exit code, including the zeros/i);
});
