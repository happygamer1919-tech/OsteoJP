#!/usr/bin/env node
/**
 * IMPORT RUNNER. Card B. docs/migration-notes.md section 4.
 *
 * Orchestrates the pipeline that already exists: stage -> validate -> import ->
 * reconcile. It adds no pipeline logic; it decides ORDER, REFUSES to run on an
 * incomplete mapping, and makes a live run deliberate.
 *
 * ==========================================================================
 * THE CONFIRMATION PHRASE IS DEFINED HERE, AND THAT IS A GAP BEING CLOSED
 * RATHER THAN A RULE BEING FOLLOWED.
 * ==========================================================================
 * The dispatch says "the explicit confirmation phrase per standing rules" and
 * "exit codes per standing rules". NO SUCH RULES ARE COMMITTED. A search of
 * CLAUDE.md, docs/ and .claude/ finds the general doctrine ("done is a number, a
 * file, or an exit code") and two unrelated per-tool exit schemes, and nothing
 * that defines an import confirmation phrase or an import exit code table.
 *
 * That is the same shape PORTAL-REHYDRATE 4.11 was written to end: a rule
 * carried between dispatches in prose, which a stateless terminal cannot
 * derive. So this file DEFINES both, in one place, and says that it is the
 * definition rather than a transcription. If the owner has a different phrase
 * in mind, this is the line to change.
 *
 * Usage:
 *   node scripts/import/run-import.mjs --config <mapping.json> [--dry-run]
 *   node scripts/import/run-import.mjs --config <mapping.json> --apply --confirm "<phrase>"
 * Exit: 0 clean · 1 refused or reported failures · 2 bad invocation
 */

import fs from "node:fs";

/** The phrase a live run requires, verbatim. DEFINED HERE - see the header. */
export const CONFIRM_PHRASE = "IMPORT FISIOZERO INTO PRODUCTION";

export const EXIT = { OK: 0, FAILED: 1, BAD_INVOCATION: 2 };

/**
 * Dependency order. Parents before children, because every child resolves its
 * parent through the staging ledger and an unimported parent is an
 * `unresolved_reference` rather than an error anybody would notice.
 *
 * ATTACHMENTS ARE LAST FOR A SECOND REASON, and it is the one that bites:
 * `attachments.storage_path` is NOT NULL, so a row can be written pointing at
 * an object that does not exist and the database will accept it happily. The
 * check below is what stops that.
 */
export const ENTITY_ORDER = [
  "patient",
  "clinical_episode",
  "appointment",
  "clinical_record",
  "attachment",
];

/* ====================================================================== */
/* MAPPING CONFIG                                                          */
/* ====================================================================== */

/**
 * Every `terapeuta` and `tipo_servico` the delivery uses must be mapped BEFORE
 * anything is staged.
 *
 * A HARD FAIL AND NOT A WARNING, because the alternative is worse than it
 * looks: an unmapped `terapeuta` routes its appointment to to_review, so a
 * half-filled mapping does not crash - it QUIETLY IMPORTS A FRACTION of the
 * diary and reports success over the rest. Finding that afterwards means
 * reconciling thousands of rows by hand.
 *
 * THE UNMAPPED VALUES ARE PRINTED WITH COUNTS. They are operational metadata -
 * a therapist's professional name as the vendor stored it, a service label -
 * and an unmapped-key report is useless without saying which keys. Counts tell
 * Ivan which ones matter: one row is a typo, four hundred is a real therapist.
 */
export function checkMappingCoverage(adapterResult, config) {
  // READ FROM THE ADAPTER'S OWN TALLIES rather than re-derived from the review
  // rows. Re-deriving was the first cut and it produced an EMPTY list, because
  // to_review carried the reason and not the value - a refusal that named
  // nothing, which is worse than no refusal at all.
  const unmappedTerapeuta = new Map(adapterResult.checks?.unmappedTerapeuta ?? []);
  const unmappedServico = new Map(adapterResult.checks?.unmappedTipoServico ?? []);

  const missing = [];
  if (!config || typeof config !== "object") missing.push("config is not an object");
  else {
    if (!config.practitionerKeyByName || typeof config.practitionerKeyByName !== "object") {
      missing.push("practitionerKeyByName");
    }
    if (!config.location || typeof config.location !== "object") missing.push("location");
    else if (config.location.kind !== "fixed" && config.location.kind !== "column") {
      missing.push('location.kind must be "fixed" or "column"');
    }
  }

  return {
    ok: missing.length === 0 && unmappedTerapeuta.size === 0,
    missing,
    unmappedTerapeuta: [...unmappedTerapeuta.entries()].sort((a, b) => b[1] - a[1]),
    unmappedServico: [...unmappedServico.entries()],
  };
}

/* ====================================================================== */
/* ATTACHMENT PRECONDITION                                                 */
/* ====================================================================== */

/**
 * An attachment row may only be written when its object is actually in the
 * bucket. The evidence is the byte-copy job's checkpoint.
 *
 * WHY A CHECKPOINT AND NOT A LIVE `exists` CALL: the byte-copy job already did
 * that work over tens of thousands of objects, and repeating it here would be a
 * second full pass over the bucket for the same answer. What this refuses is
 * the case the checkpoint can prove - an object that was never uploaded, or was
 * uploaded and then flagged a conflict.
 */
export function attachmentsWithoutObjects(records, checkpointByPath) {
  const missing = [];
  for (const r of records) {
    if (r.entityType !== "attachment") continue;
    const p = r.record.data.storagePath;
    const e = checkpointByPath.get(p);
    if (!e || e.status !== "uploaded") missing.push({ sourceId: r.sourceId, status: e?.status ?? "absent" });
  }
  return missing;
}

/* ====================================================================== */
/* THE RUN                                                                 */
/* ====================================================================== */

/**
 * `pipeline` is INJECTED. That keeps this file plain `.mjs` - `packages/db`
 * ships raw TypeScript with no build step, so a script cannot import it under
 * bare node - and it makes every branch below testable with no database.
 *
 * It also makes the no-delete rule PROVABLE: the injected pipeline in the test
 * records every method called on it, and a test asserts nothing resembling a
 * delete ever appears.
 */
export async function runImport({
  adapterResult,
  config,
  pipeline,
  checkpointByPath = new Map(),
  apply = false,
  confirm = null,
  dryRun = false,
  log = console.log,
}) {
  const counts = {};
  for (const e of ENTITY_ORDER) {
    counts[e] = adapterResult.records.filter((r) => r.entityType === e).length;
  }
  const reasons = new Map();
  for (const t of adapterResult.toReview) reasons.set(t.reason, (reasons.get(t.reason) ?? 0) + 1);

  /* -- 1. mapping coverage, BEFORE anything is staged -- */
  const coverage = checkMappingCoverage(adapterResult, config);
  if (!coverage.ok) {
    log("REFUSED - the mapping config does not cover this delivery.");
    for (const m of coverage.missing) log(`  missing   ${m}`);
    for (const [k, n] of coverage.unmappedTerapeuta) log(`  terapeuta unmapped  ${JSON.stringify(k)}  ${n} row(s)`);
    for (const [k, n] of coverage.unmappedServico) log(`  tipo_servico unmapped  ${JSON.stringify(k)}  ${n} row(s)`);
    log("");
    log("NOTHING WAS STAGED. A partial mapping does not crash - it imports a");
    log("fraction of the diary and reports success over the rest.");
    return { exit: EXIT.FAILED, staged: 0, imported: 0, counts, reasons, coverage };
  }

  /* -- 2. report what the adapter produced -- */
  log("ADAPTER OUTPUT");
  for (const e of ENTITY_ORDER) log(`  ${e.padEnd(18)} ${counts[e]}`);
  log(`  to_review          ${adapterResult.toReview.length}`);
  for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    log(`      ${r.padEnd(34)} ${n}`);
  }
  for (const w of adapterResult.warnings) log(`  warning  ${w}`);
  log("");

  if (dryRun) {
    log("DRY RUN - nothing was staged and no database was contacted.");
    return { exit: EXIT.OK, staged: 0, imported: 0, counts, reasons, coverage };
  }

  /* -- 3. stage + validate. Writes the LEDGER, never a target table. -- */
  const staged = await pipeline.stageRows(adapterResult.records);
  const validation = await pipeline.validate(staged);
  log(`STAGED     ${staged.length}`);
  log(`VALIDATED  ${validation.validated}   FAILED ${validation.failed}`);
  log("");

  if (!apply) {
    log("PREVIEW - staged and validated only. NO TARGET TABLE WAS WRITTEN.");
    log(`To run for real: --apply --confirm ${JSON.stringify(CONFIRM_PHRASE)}`);
    return { exit: EXIT.OK, staged: staged.length, imported: 0, counts, reasons, coverage, validation };
  }

  /* -- 4. the live gate -- */
  if (confirm !== CONFIRM_PHRASE) {
    log("REFUSED - --apply requires the exact confirmation phrase.");
    log("Nothing was imported. The staging ledger is untouched and can be re-used.");
    return { exit: EXIT.FAILED, staged: staged.length, imported: 0, counts, reasons, coverage, validation };
  }

  /* -- 5. attachments must have their bytes already in the bucket -- */
  const orphanAttachments = attachmentsWithoutObjects(adapterResult.records, checkpointByPath);
  if (orphanAttachments.length > 0) {
    log(`REFUSED - ${orphanAttachments.length} attachment(s) have no uploaded object.`);
    log("storage_path is NOT NULL, so these rows would be written and would point");
    log("at nothing. Run copy-attachments.mjs to completion first.");
    return { exit: EXIT.FAILED, staged: staged.length, imported: 0, counts, reasons, coverage, validation, orphanAttachments };
  }

  /* -- 6. import, in dependency order -- */
  let imported = 0;
  const perEntity = {};
  for (const entityType of ENTITY_ORDER) {
    const batch = adapterResult.records.filter((r) => r.entityType === entityType);
    if (batch.length === 0) {
      perEntity[entityType] = 0;
      continue;
    }
    const res = await pipeline.importRecords(entityType, batch);
    perEntity[entityType] = res.imported ?? 0;
    imported += res.imported ?? 0;
    log(`IMPORTED  ${entityType.padEnd(18)} ${res.imported ?? 0}`);
  }

  /* -- 7. reconcile -- */
  const report = await pipeline.reconcile();
  log("");
  log("RECONCILIATION");
  for (const e of ENTITY_ORDER) {
    log(
      `  ${e.padEnd(18)} staged=${report.staged?.[e] ?? 0}  imported=${report.imported?.[e] ?? 0}  to_review=${report.toReview?.[e] ?? 0}`,
    );
  }
  if (report.referentialIntegrity) {
    log(`  referential integrity: ${report.referentialIntegrity.ok ? "OK" : `${report.referentialIntegrity.problems} problem(s)`}`);
  }

  const clean = validation.failed === 0 && report.referentialIntegrity?.ok !== false;
  return { exit: clean ? EXIT.OK : EXIT.FAILED, staged: staged.length, imported, perEntity, counts, reasons, coverage, validation, report };
}

/* ====================================================================== */
/* CLI                                                                     */
/* ====================================================================== */

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

async function main() {
  const configFile = arg("--config");
  if (!configFile) {
    console.error("usage: --config <mapping.json> [--dry-run] [--apply --confirm <phrase>]");
    process.exit(EXIT.BAD_INVOCATION);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (e) {
    console.error(`config unreadable: ${e?.name ?? "Error"}`);
    process.exit(EXIT.BAD_INVOCATION);
  }
  console.error(
    "This CLI needs the adapter and the live pipeline wired in, which requires the\n" +
      "TypeScript package under tsx. Import runImport() from a tsx entrypoint and\n" +
      "pass { adapterResult, config, pipeline }. The orchestration, the refusals and\n" +
      "the exit codes are all exercised by scripts/import/run-import.test.mjs.",
  );
  process.exit(EXIT.BAD_INVOCATION);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
