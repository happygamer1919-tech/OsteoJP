// RB-02. `patient_pack_instances.sessions_remaining` IS FROZEN AND THIS KEEPS IT FROZEN.
//
// WHAT THE COLUMN IS NOW. Before migration 0067 it WAS the pacote balance: the
// booking path decremented it and a "consumir" button on the patient profile
// decremented it again. RB-02 replaced that with a DERIVED balance -
// `sessions_total - legacy_consumed - linked appointments that are not
// cancelled` - and the column became the pre-0067 record.
//
// WHY IT WAS KEPT RATHER THAN DROPPED. It is the ONLY evidence 0067's backfill
// can ever be checked against. `legacy_consumed` was set to
// `sessions_total - sessions_remaining`, an arithmetic identity, and the apply
// proved it held on production with V3 returning zero. Drop the right-hand side
// and that proof stops being re-runnable: "every existing balance was preserved
// exactly" becomes a claim in a document rather than a query anybody can run.
//
// WHY A GUARD AND NOT A COMMENT. A vestigial column that something still writes
// is worse than one nothing reads, and it drifts SILENTLY - the write succeeds,
// the CHECK constraints still pass, and the number quietly stops matching the
// history it is supposed to be evidence of. The schema comment on the column
// names this file by path; a comment naming a guard that does not exist is the
// exact shape PORTAL-REHYDRATE 4.11 was committed to end.
//
// WHAT IS ALLOWED, and it is one thing: the INSERT of a BRAND-NEW instance, in
// bookPackSessionTx, which writes the purchase-time value once. The column is
// NOT NULL with no default, so a row cannot be created without it. What is
// forbidden is an UPDATE - the drift this exists to catch.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Comments stripped before every assertion. This column is described at length
 *  in prose - the schema, the migration, the apply receipt, the board - and a
 *  predicate over raw text matches those descriptions and goes red on correct
 *  code. Same class #962 and #965 removed from five other guards. */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*#.*$/gm, " ");

const SEARCHED = [join(ROOT, "apps"), join(ROOT, "packages")];

/** The one file permitted to name the column in a write, and the migrations,
 *  which are the historical record and must not be rewritten. */
const ALLOWED = new Set([
  // The column definition itself, with the reasoning for freezing it.
  "packages/db/src/schema.ts",
  // The ONE writer, and only on INSERT of a brand-new row. The second test
  // below narrows this entry so it cannot become a blanket exemption for the file.
  "apps/web/lib/packs/instances.ts",
  // ======================================================================
  // TESTS THAT ASSERT THE FROZEN VALUE ARE THE OPPOSITE OF DRIFT.
  // ======================================================================
  // These two prove 0067's backfill identity against a real Postgres:
  // legacy_consumed = sessions_total - sessions_remaining. They are the
  // re-runnable form of the proof the production apply produced once, which is
  // the entire reason the column was kept rather than dropped. A guard that
  // forbade them would delete its own justification.
  "packages/db/tests/followup-rls.test.ts",
  "packages/db/tests/pack-model-rls.test.ts",
]);

function sources() {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === ".next" || e === "dist" || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) {
        // Migrations are the historical record. 0037 and 0067 both name the
        // column and both must stay exactly as applied.
        if (e === "migrations") continue;
        walk(full);
      } else if (/\.(ts|tsx|mjs|js)$/.test(e)) files.push(full);
    }
  };
  for (const d of SEARCHED) walk(d);
  return files;
}

const rel = (f) => f.slice(ROOT.length + 1);

test("no application code UPDATEs sessions_remaining", () => {
  const offenders = [];
  for (const file of sources()) {
    const r = rel(file);
    if (ALLOWED.has(r)) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    if (!/sessionsRemaining|sessions_remaining/.test(src)) continue;
    offenders.push(r);
  }
  assert.deepEqual(
    offenders,
    [],
    `sessions_remaining is FROZEN (RB-02). These files name it:\n  ${offenders.join("\n  ")}\n` +
      `The balance is DERIVED - see packages/db/src/pack-balance.ts. If you need the ` +
      `balance, use packSessionsAvailable(); if you genuinely need the pre-0067 column, ` +
      `add the file to ALLOWED here with a reason.`,
  );
});

test("the ONE allowed writer only ever INSERTs it, never UPDATEs it", () => {
  // The allowance is narrow on purpose: bookPackSessionTx writes the
  // purchase-time value into a brand-new row. A `.set({ sessionsRemaining })`
  // anywhere in that file is the drift this whole guard exists to catch, and
  // an allow-list entry must not become a blanket exemption for its file.
  const src = stripComments(
    readFileSync(join(ROOT, "apps/web/lib/packs/instances.ts"), "utf8"),
  );
  assert.equal(
    /\.set\(\s*\{[^}]*sessionsRemaining/.test(src),
    false,
    "apps/web/lib/packs/instances.ts UPDATEs sessions_remaining. It may only INSERT it.",
  );
});

test("the schema comment naming this file is still true", () => {
  // A guard whose subject renames itself is a guard nobody runs. The schema
  // points here by path; if that path changes, this fails rather than the
  // pointer silently going stale - which is the failure mode
  // LE-apply-block-expectation-drift was carded for.
  const schema = readFileSync(join(ROOT, "packages/db/src/schema.ts"), "utf8");
  assert.ok(
    schema.includes("scripts/pack-sessions-remaining-is-frozen.test.mjs"),
    "packages/db/src/schema.ts no longer names this guard by path.",
  );
});
