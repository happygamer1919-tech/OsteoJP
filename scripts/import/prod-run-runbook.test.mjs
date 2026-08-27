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
  assert.match(text, /mapping-config\.LV\.json/);
  assert.match(text, /mapping-config\.CB\.json/);
  // The two shell variables every later step uses, so a filename lives in ONE
  // place rather than in nine.
  assert.match(text, /\$LVCFG/);
  assert.match(text, /\$CBCFG/);
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
  for (const f of ["mapping-config.LV.json", "attachment-mapping", "checkpoint-"]) {
    assert.ok(donot.includes(f), `${f} must be named as unpasteable`);
  }
  assert.match(text, /Every exit code, including the zeros/i);
});

/* ---------------- the two guards added 2026-08-25 ---------------- */

test("the byte-copy step tells you it will ask for the phrase", () => {
  // The gate is new. A runbook that still shows an unprompted byte copy would
  // read the prompt as something having gone wrong.
  const step = text.slice(text.indexOf("### 3.2 Byte copy"), text.indexOf("### 3.3 Preview"));
  assert.match(step, /confirmation phrase/i);
  assert.ok(step.includes("IMPORT FISIOZERO INTO PRODUCTION"));
  assert.match(step, /non-prod target is not asked/i);
  assert.match(step, /exits `2`/i);
});

test("the blocklist-failure exit is documented, not just the wrong-phrase one", () => {
  // `prod blocklist is EMPTY` is a repository problem wearing a delivery
  // problem's exit code. Confusing the two costs the window.
  const step = text.slice(text.indexOf("### 3.2 Byte copy"), text.indexOf("### 3.3 Preview"));
  assert.match(step, /blocklist/i);
});

test("the collision contingency exists and is scoped to the preflight", () => {
  const s = text.slice(text.indexOf("### 3.3b"), text.indexOf("### 3.4 Apply"));
  assert.ok(s.length > 0, "the contingency subsection must exist");
  assert.match(s, /--reassign-conflicting-patient-numbers/);
  // WHEN it is used, stated as a condition rather than left to judgement.
  assert.match(s, /preflight/i);
  assert.match(s, /overlap/i);
  assert.match(s, /Skip this unless/i);
});

test("the contingency says the pairs go to reception on Monday", () => {
  const s = text.slice(text.indexOf("### 3.3b"), text.indexOf("### 3.4 Apply"));
  assert.match(s, /reception/i);
  assert.match(s, /Monday/i);
  assert.match(s, /numbers only/i);
});

test("the contingency says the flag goes on BOTH preview and apply", () => {
  // Applying with a flag the preview did not carry means authorising counts you
  // did not read.
  const s = text.slice(text.indexOf("### 3.3b"), text.indexOf("### 3.4 Apply"));
  assert.match(s, /both.{0,40}preview.{0,40}apply/is);
});

test("the flag name matches the runner's actual flag", () => {
  // Two spellings of a flag is one too many: a typo in the runbook is a silently
  // ignored flag and an import under the default behaviour.
  const runner = fs.readFileSync(path.join(REPO, "packages/db/scripts/import-core.ts"), "utf8");
  const m = runner.match(/has\("(--reassign-conflicting-patient-numbers)"\)/);
  assert.ok(m, "the entrypoint must read this flag");
  assert.ok(text.includes(m[1]), "the runbook must name the same flag");
});

test("the pairs list is in the paste-back table", () => {
  const t = text.slice(text.indexOf("## 7. What to paste back"));
  assert.match(t, /pairs/i);
});

/* ---------------- the test-patient cleanup, added 2026-08-25 ---------------- */

test("the cleanup step exists and comes BEFORE the import sequence", () => {
  const cleanup = text.indexOf("### 1.3b Remove the staff-training test patients");
  const apply = text.indexOf("--apply");
  assert.ok(cleanup > -1, "the cleanup step must exist");
  assert.ok(cleanup < apply, "cleanup must precede any import");
  assert.ok(text.includes("cleanup-test-patients.sql"));
  assert.ok(
    fs.existsSync(path.join(REPO, "scripts/import/cleanup-test-patients.sql")),
    "the runbook names a script that does not exist",
  );
});

test("it states the literal expected counts", () => {
  const s = text.slice(text.indexOf("### 1.3b"), text.indexOf("### 1.4"));
  // THE PATIENT COUNT IS NOT ONE OF THEM ANY MORE. It was 33, and 33 went
  // stale: production held 35 on 2026-08-27 with the newest row created the day
  // before. The runbook now RECORDS that reading and tells the owner to take a
  // fresh one on the day. What is still literal is what does not move.
  assert.match(s, /staff_rows.{0,40}30/s);
  assert.match(s, /every column 0/i);
});

test("the owner counts and CONFIRMS the patients on the day, before anything else", () => {
  // The only step that protects a real patient from 1.3b, and it has to be a
  // human question because a count cannot answer it.
  const s = text.slice(text.indexOf("### 1.3c"), text.indexOf("### 1.4"));
  assert.match(s, /app\.expected_patients/, "names the setting the count goes into");
  assert.match(s, /newest_created_at/, "prints how recent the newest row is");
  assert.match(s, /Rodica/i, "the confirmation is with a person, not a query");
  assert.match(s, /no default/i, "and there is no default to fall back on");
  // The 2026-08-27 reading is RECORDED and explicitly not the number to reuse.
  assert.match(s, /\b35\b/);
  assert.match(s, /2026-08-26/, "the newest row's date is the reason to re-ask");
});

test("1.4 points at the real config files and does not copy the template", () => {
  // Following the old `cp` lines would create a second, EMPTY pair beside the
  // filled ones, with nothing on a command line to say which pair a run used.
  const s = text.slice(text.indexOf("### 1.4"), text.indexOf("### 1.5"));
  assert.match(s, /mapping-config\.LV\.json/);
  assert.match(s, /mapping-config\.CB\.json/);
  assert.ok(!/cp\s+"\$REPO\/scripts\/import\/mapping-config\.template\.json"/.test(s),
    "the template cp lines must be gone");
  assert.match(s, /34c34/, "the diff's expected output is literal, not described");
});

test("it says the backup comes FIRST - earlier than the runbook otherwise says", () => {
  const s = text.slice(text.indexOf("### 1.3b"), text.indexOf("### 1.4"));
  assert.match(s, /backup/i);
  assert.match(s, /no\s+undo/i);  // the line wraps between the two words
});

test("the re-run preflight is what authorises running WITHOUT the flag", () => {
  const s = text.slice(text.indexOf("### 1.3c"), text.indexOf("### 1.4"));
  assert.ok(s.length > 0, "the re-preflight subsection must exist");
  assert.match(s, /preflight-patient-numbers\.sql/);
  assert.match(s, /zero/i);
  assert.match(s, /WITHOUT\s*\n?>?\s*`--reassign-conflicting-patient-numbers`/);
});

test("it records that there is NO auth cleanup, with the reason", () => {
  // An omission reads as forgetfulness. The finding has to be stated.
  const s = text.slice(text.indexOf("### 1.3b"), text.indexOf("### 1.4"));
  assert.match(s, /no `auth\.users` rows/i);
  assert.match(s, /login-less/i);
});

test("it warns that deleting the row does not delete the storage object", () => {
  const s = text.slice(text.indexOf("### 1.3b"), text.indexOf("### 1.4"));
  assert.match(s, /does not\s*\n?delete the object/i);
});

test("the cleanup outputs are in the paste-back table", () => {
  const t = text.slice(text.indexOf("## 7. What to paste back"));
  assert.match(t, /1\.3b/);
  assert.match(t, /1\.3c/);
});
