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

/* ==========================================================================
 * THE VALIDATED ORDER, 2026-08-27. Two sittings, twenty-three blocks.
 * ==========================================================================
 * These guards exist because the ORDER is now the document's main claim. It is
 * no longer numeric - the sections read 1.1, 1.3c, 2.2, 1.3b, 1.3c-bis, 2.3,
 * 1.3d - so a reader cannot check the sequence by eye the way they could when
 * the numbers ran upward. The BLOCK numbers are what they follow instead, and
 * nothing but a test can keep those honest across an edit.
 *
 * EVERY ORDERING ASSERTION BELOW MEASURES THE EXECUTABLE BODY, NOT THE WHOLE
 * FILE. The editor's note near the top names `cleanup-test-patients.sql`,
 * `copy-attachments.mjs` and "Take a backup now" in one sentence, in an order
 * that has nothing to do with execution. Comparing raw first-occurrences would
 * measure that sentence.
 */

const BODY_AT = text.indexOf("## SITTING 1");
const body = text.slice(BODY_AT);
/** First occurrence inside the executable body, as a whole-file offset. */
const bodyAt = (needle) => {
  const i = body.indexOf(needle);
  assert.ok(i > -1, `"${needle}" is missing from the executable body`);
  return BODY_AT + i;
};

test("the two new artifacts exist on disk and are named", () => {
  for (const rel of [
    "scripts/import/cross-delivery.mjs",
    "scripts/import/backfill-patient-locations.sql",
  ]) {
    assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is referenced but missing`);
    assert.ok(text.includes(rel.split("/").pop()), `${rel} exists but is never mentioned`);
  }
});

/* ---------------- the sittings ------------------------------------------- */

test("there are exactly two sittings, Saturday then Sunday", () => {
  const one = text.indexOf("## SITTING 1");
  const two = text.indexOf("## SITTING 2");
  assert.ok(one > -1 && two > one, "SITTING 1 must exist and precede SITTING 2");
  assert.match(text.slice(one, one + 200), /SATURDAY/);
  assert.match(text.slice(two, two + 200), /SUNDAY/);
  assert.equal((text.match(/^## SITTING /gm) || []).length, 2, "exactly two sittings");
});

test("the file says out loud that it is not in numeric order", () => {
  // The single most likely misread of this document is that the section numbers
  // are damaged. It has to be answered above the fold.
  const head = text.slice(0, text.indexOf("## SITTING 1"));
  assert.match(head, /EXECUTION ORDER, NOT IN NUMERIC ORDER/i);
  assert.match(head, /BLOCK numbers/i);
});

test("SITTING 1 needs no delivery, and says so", () => {
  const s = text.slice(text.indexOf("## SITTING 1"), text.indexOf("## SITTING 2"));
  assert.match(s, /Nothing in this sitting needs the delivery/i);
  // The delivery variables must not be dereferenced anywhere in sitting 1.
  for (const b of [...s.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1])) {
    assert.ok(!/\$LV\b|\$CB\b|\$LVZIP|\$CBZIP|\$LVCFG|\$CBCFG/.test(b),
      `a SITTING 1 command uses a delivery variable:\n${b}`);
  }
});

/* ---------------- the block numbering ------------------------------------ */

/** Every `**BLOCK n ...**` label, in document order. */
const blockLabels = [...text.matchAll(/^\*\*BLOCKS? (\d+)(?:-(\d+))? — ([^*]+)\*\*$/gm)];

test("the blocks run 1 to 23, once each, in the order they appear", () => {
  const seen = [];
  for (const m of blockLabels) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    for (let n = from; n <= to; n += 1) seen.push(n);
  }
  assert.deepEqual(
    seen,
    Array.from({ length: 23 }, (_, i) => i + 1),
    "block numbers must be 1..23, each once, in document order",
  );
});

test("SITTING 1 holds blocks 1-12 and SITTING 2 holds 13-23", () => {
  const split = text.indexOf("## SITTING 2");
  for (const m of blockLabels) {
    const from = Number(m[1]);
    const inSittingTwo = m.index > split;
    assert.equal(inSittingTwo, from >= 13, `BLOCK ${from} is in the wrong sitting`);
  }
  assert.match(text, /BLOCKS 1-12/);
  assert.match(text, /BLOCKS 13-23/);
});

test("every block states where it is pasted", () => {
  for (const m of blockLabels) {
    assert.match(
      m[3],
      /PASTE INTO: plain Terminal\.app|PASTE INTO: Supabase SQL editor|dashboard, by hand|by hand\. No command/,
      `BLOCK ${m[1]} does not say where it is pasted: ${m[3]}`,
    );
  }
});

test("BLOCK 13 is the cross-delivery check and BLOCK 22 is the backfill", () => {
  // Named explicitly because the packet and this runbook are transcriptions of
  // each other, and a silent renumber is how they stop agreeing.
  const block = (n) => {
    const m = blockLabels.find((x) => Number(x[1]) === n);
    assert.ok(m, `BLOCK ${n} is missing`);
    return text.slice(m.index, m.index + 1400);
  };
  assert.match(block(13), /cross-delivery\.mjs/);
  assert.match(block(22), /backfill-patient-locations\.sql/);
});

/* ---------------- NEVER Claude Code, from 1.3e onward -------------------- */

test("the paste destinations are stated once, and Claude Code is excluded", () => {
  const s = text.slice(text.indexOf("### 0.15"), text.indexOf("### 0.2 "));
  assert.ok(s.length > 0, "0.15 must exist");
  assert.match(s, /plain Terminal\.app/);
  assert.match(s, /Supabase SQL editor/);
  assert.match(s, /PASTED INTO CLAUDE CODE/i);
  assert.match(s, /1\.3e/, "the stronger reason from 1.3e onward must be stated");
  assert.match(s, /RGPD/);
});

test("every SITTING 2 shell block carries NEVER Claude Code on its own line", () => {
  // The delivery is real patient data and is never covered by the amostra
  // exemption. The block that gets pasted somewhere it should not be is the one
  // whose warning was three screens up, so it is repeated per block.
  const split = text.indexOf("## SITTING 2");
  for (const m of blockLabels) {
    if (m.index < split) continue;
    if (!m[3].includes("plain Terminal.app")) continue;
    assert.match(m[3], /NEVER Claude Code/, `BLOCK ${m[1]} is a SITTING 2 shell block without the warning`);
  }
  const sunday = text.slice(split);
  assert.match(sunday, /NEVER CLAUDE CODE/i);
});

/* ---------------- the ordering the sittings are FOR ---------------------- */

test("the backup precedes the cleanup, which precedes the preflight", () => {
  // THE *RUN* INSTRUCTIONS, not every mention. BLOCK 2 legitimately names
  // `cleanup-test-patients.sql` STEP 2 as the place the count it just read is
  // written to, four blocks before that file is run.
  const backup = bodyAt("Take a backup now");
  const cleanup = bodyAt("Run [`scripts/import/cleanup-test-patients.sql`]");
  const preflight = bodyAt("Run [`scripts/import/preflight-patient-numbers.sql`]");
  assert.ok(backup < cleanup, "the only undo must exist before the delete");
  assert.ok(cleanup < preflight, "the preflight that decides the flag reads the EMPTIED tenant");
});

test("the environment is sourced before the bucket precheck", () => {
  // The precheck reads $SUPABASE_URL. Run first it either fails for want of a
  // variable or, far worse, answers from whatever a previous shell left behind.
  const env = bodyAt("source /Users/ivan/osteojp-secrets/new-prod.env");
  const bucket = bodyAt("storage/v1/bucket");
  assert.ok(env < bucket, "2.3 must precede 1.3d");
});

test("BOTH byte copies precede ANY preview", () => {
  const copies = [...body.matchAll(/copy-attachments\.mjs/g)].map((m) => BODY_AT + m.index);
  assert.ok(copies.length >= 2, "both clinics must have a byte copy");
  const preview = text.indexOf("### 3.3 Preview");
  for (const c of copies) {
    assert.ok(c < preview, "every byte copy must be complete before the first preview");
  }
  // And the section says why, so a later edit does not re-interleave them.
  const step = text.slice(text.indexOf("### 3.2 Byte copy"), preview);
  assert.match(step, /BOTH COPIES FINISH BEFORE ANY PREVIEW/i);
});

test("the preview precedes the apply, and both cover both clinics", () => {
  const preview = text.indexOf("### 3.3 Preview");
  const apply = text.indexOf("### 3.4 Apply");
  assert.ok(preview > -1 && apply > preview);
  for (const s of [text.slice(preview, text.indexOf("### 3.3b")), text.slice(apply, text.indexOf("## 4."))]) {
    assert.match(s, /\$LV\b/);
    assert.match(s, /\$CB\b/);
  }
});

test("the backfill runs after both applies and before the final reconciliation", () => {
  const apply = text.indexOf("### 3.4 Apply");
  const backfill = text.indexOf("### 5.1 Backfill");
  const final = text.indexOf("### 5.2 Final reconciliation");
  assert.ok(apply < backfill, "nothing to backfill until both clinics are imported");
  assert.ok(backfill < final, "the platform check is only meaningful once locations are right");
  const s = text.slice(backfill, final);
  assert.match(s, /ONLY IF BLOCK 13/i, "it is conditional on the cross-delivery count");
  assert.match(s, /PL-09/);
});

/* ---------------- what the reorder REMOVED ------------------------------- */

test("no digit in this file is a patient count", () => {
  // It said 33 in six places, from 2026-08-25. Production held 35 two days
  // later. A stale expectation reads as a verified fact right up to the moment
  // it authorises deleting a row nobody meant to delete.
  assert.ok(!/\b33\b/.test(text), "a hardcoded patient count is back in the runbook");
  const s = text.slice(text.indexOf("### 1.3b Remove"), text.indexOf("### 1.3b-storage"));
  assert.match(s, /THE COUNT IS NOT WRITTEN IN THIS DOCUMENT/i);
  assert.match(s, /BLOCK 2/, "the cleanup must send the reader to the block that reads the live count");
  // And BLOCK 2 is where the number goes into the setting with no default.
  const two = text.slice(text.indexOf("### 1.3c Count"), text.indexOf("### 2.2 Backup"));
  assert.match(two, /app\.expected_patients/);
  assert.match(two, /no default/i);
});

test("the pre-cleanup preflight is gone, and its removal is explained", () => {
  // It ran twice, once each side of the cleanup, and the first reading was
  // stale within minutes. Two readings of one query, one known-obsolete, is a
  // document inviting the wrong one to be believed.
  const preflight = bodyAt("Run [`scripts/import/preflight-patient-numbers.sql`]");
  const cleanup = bodyAt("Run [`scripts/import/cleanup-test-patients.sql`]");
  assert.ok(preflight > cleanup, "the surviving preflight must be the one AFTER the cleanup");
  assert.equal(
    (text.match(/Run \[`scripts\/import\/preflight-patient-numbers\.sql`\]/g) || []).length,
    1,
    "the preflight must be run ONCE - it ran twice and the first reading was stale on arrival",
  );
  assert.match(text, /THERE IS NO LONGER A PREFLIGHT BEFORE THE CLEANUP/i);
});

test("1.2 is marked done and carries no block", () => {
  const h = text.indexOf("### 1.2 The legacy staff accounts");
  assert.ok(h > -1);
  const s = text.slice(h, h + 2500);
  assert.match(s, /DONE 2026-08-27/);
  assert.match(s, /SKIP/);
  assert.match(s, /NO BLOCK/i);
  // PART B is the half that CANNOT be done in advance, and it must say so.
  assert.match(s, /PART B[\s\S]{0,200}NOT DONE/i);
});

test("2.1 confirms the freeze rather than declaring it", () => {
  const s = text.slice(text.indexOf("### 2.1 "), text.indexOf("### 3.1 Delivery conformance"));
  assert.ok(s.length > 0, "2.1 must exist");
  assert.match(s, /Confirm the freeze held/i);
  assert.match(s, /does not\s+declare it/i);
  assert.match(s, /go message/i);
  // And the declaration lives in SITTING 1, before the count.
  const one = text.slice(text.indexOf("## SITTING 1"), text.indexOf("### 1.1 "));
  assert.match(one, /THE FREEZE STARTS NOW, BEFORE BLOCK 2/i);
});

/* ---------------- the archive filename is a FILL ------------------------- */

test("no command block names documentos.zip - the archive filename is a FILL", () => {
  // Every rehearsal used STANDIN-attachments.zip. `documentos.zip` was this
  // document's guess and nothing has confirmed it; a guessed filename in a
  // command is a run that fails on its first byte copy.
  for (const b of codeBlocks) {
    assert.ok(!/documentos\.zip/.test(b), `a command block still names documentos.zip:\n${b}`);
  }
  assert.match(text, /\$LVZIP/);
  assert.match(text, /\$CBZIP/);
  assert.match(text, /FILL/);
  // The two archive commands read the FILL variables, not a literal.
  const copy = text.slice(text.indexOf("### 3.2 Byte copy"), text.indexOf("### 3.3 Preview"));
  assert.match(copy, /--source "\$LVZIP"/);
  assert.match(copy, /--source "\$CBZIP"/);
});

test("the delivery paths are FILLs too, and there are four of them", () => {
  const s = text.slice(text.indexOf("### 0.5 Shell variables"), text.indexOf("## SITTING 1"));
  for (const v of ["$LV", "$CB", "$LVZIP", "$CBZIP"]) assert.ok(s.includes(v.slice(1)), v);
  assert.match(s, /FOUR OF THOSE SIX ARE FILLS/i);
});

/* ---------------- the cross-delivery block states its rule --------------- */

test("BLOCK 13 states the continue case and the stop case", () => {
  const s = text.slice(text.indexOf("### 3.1b"), text.indexOf("### 1.3e"));
  assert.ok(s.length > 0, "3.1b must exist and precede 1.3e");
  assert.match(s, /same id, same number/i);
  assert.match(s, /CONTINUE/);
  assert.match(s, /same number, different ids/i);
  assert.match(s, /STOP/);
  assert.match(s, /OWNER DECISION/i);
  assert.match(s, /patients_tenant_number_uq/);
  assert.match(s, /BLOCK 22/);
  assert.match(s, /EXIT `1` IS THE STOP/i);
});

test("the paste-back table is keyed by block and covers every one of them", () => {
  const t = text.slice(text.indexOf("## 7. What to paste back"));
  const covered = new Set();
  for (const m of t.matchAll(/^\|\s*(\d+)(?:-(\d+))?\s*\|/gm)) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    for (let n = from; n <= to; n += 1) covered.add(n);
  }
  for (let n = 1; n <= 23; n += 1) {
    assert.ok(covered.has(n), `BLOCK ${n} is missing from the paste-back table`);
  }
  assert.match(t, /never paste any of it into Claude Code/i);
});
