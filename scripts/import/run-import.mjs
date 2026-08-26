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
/** The template's deliberately-invalid uuid. Every slot ships holding this. */
export const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";
/** Slots the template marks as needing a decision before any run. */
export const PENDING_MARKERS = ["PENDING_OWNER_RULING", "TO_NORMALIZE"];

/**
 * Find every slot still holding a template placeholder.
 *
 * THE RUNNER DID NOT DO THIS UNTIL 2026-08-25, and the gap mattered more than
 * it looks. `checkMappingCoverage` checked that the maps EXISTED and that
 * `location.kind` was one of two strings - a config filled entirely with
 * `00000000-...` passed every check, staged the whole delivery, and then failed
 * at import time on a foreign key, halfway through, with rows already written.
 *
 * A PLACEHOLDER IS NOT A MISSING KEY. It is worse: a missing key routes its rows
 * to to_review and the run continues honestly, while a placeholder uuid is a
 * confident answer that happens to be false.
 *
 * `TO_NORMALIZE` IS TREATED SEPARATELY, and not as fatal - see stripToNormalize.
 */
export function findPlaceholders(config) {
  const found = [];
  const scan = (obj, label) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_") || typeof v !== "string") continue;
      if (v === PLACEHOLDER_UUID) found.push({ where: label, key: k, value: "placeholder uuid" });
      else if (v === "PENDING_OWNER_RULING") found.push({ where: label, key: k, value: "PENDING_OWNER_RULING" });
    }
  };
  scan(config?.practitionerKeyByName, "practitionerKeyByName");
  scan(config?.serviceKeyByType, "serviceKeyByType");
  scan(config?.location?.knownLocations, "location.knownLocations");
  scan(config?.location?.locationKeyByValue, "location.locationKeyByValue");
  // THE ROOT IS SCANNED TOO, added 2026-08-25 with `tenantId`. A slot added to
  // the template but not to this list is a slot with NO placeholder check, and
  // `tenantId` is the worst possible one to miss: an all-zero tenant uuid does
  // not fail a foreign key, it writes a full delivery into a tenant that does
  // not exist, under RLS policies that will then hide every row.
  scan(config, "config");
  return found;
}

/**
 * Remove `TO_NORMALIZE` service entries, and say which were removed.
 *
 * NOT FATAL, BECAUSE `appointments.service_id` IS NULLABLE and an unmapped type
 * already imports without a service. Blocking the whole run on an undecided
 * catalogue label would stop the import for a field the schema itself treats as
 * optional.
 *
 * BUT IT CANNOT BE PASSED THROUGH EITHER, and that is the reason this function
 * exists rather than the value simply being ignored: upsert.ts:320 THROWS
 * `unresolved("serviceKey")` when a serviceKey has no resolver entry. Handing
 * "TO_NORMALIZE" to the adapter as if it were a real key would turn an
 * undecided label into a mid-import crash.
 */
/**
 * B5, ruled 2026-08-26: WITHIN THE PATIENT GROUP, ROWS CARRYING A VENDOR
 * `numero_paciente` IMPORT FIRST.
 *
 * The 2026-08-26 rehearsal lost 12 patients to a collision the import created
 * itself. 0029's `assign_patient_number` fills a NULL with
 * `COALESCE(MAX(patient_number), 0) + 1`, so an unnumbered row imported early
 * takes a low number - and a LATER row whose vendor number happens to be that
 * value is then rejected by `patients_tenant_number_uq`. The vendor set had no
 * internal duplicates at all; every one of those collisions was manufactured by
 * ordering.
 *
 * Numbered first means the trigger only ever sees a MAX that already includes
 * every vendor number, so what it assigns cannot collide with one. STABLE
 * within each half, so a re-run stages and imports in the identical order.
 *
 * OTHER ENTITIES ARE RETURNED UNTOUCHED. This is a patient-number property and
 * nothing else depends on intra-group order.
 */
export function orderForImport(entityType, batch) {
  if (entityType !== "patient") return batch;
  const numbered = [];
  const unnumbered = [];
  for (const r of batch) {
    if (typeof r.record?.data?.patientNumber === "number") numbered.push(r);
    else unnumbered.push(r);
  }
  return [...numbered, ...unnumbered];
}

export function stripToNormalize(config) {
  const removed = [];
  const services = { ...(config?.serviceKeyByType ?? {}) };
  for (const [k, v] of Object.entries(services)) {
    if (k.startsWith("_") || v === "TO_NORMALIZE") {
      if (v === "TO_NORMALIZE") removed.push(k);
      delete services[k];
    }
  }
  return { config: { ...config, serviceKeyByType: services }, removed };
}

export function checkMappingCoverage(adapterResult, config) {
  // READ FROM THE ADAPTER'S OWN TALLIES rather than re-derived from the review
  // rows. Re-deriving was the first cut and it produced an EMPTY list, because
  // to_review carried the reason and not the value - a refusal that named
  // nothing, which is worse than no refusal at all.
  const unmappedTerapeuta = new Map(adapterResult.checks?.unmappedTerapeuta ?? []);
  const unmappedServico = new Map(adapterResult.checks?.unmappedTipoServico ?? []);

  const missing = [];
  const placeholders = findPlaceholders(config);
  for (const p of placeholders) missing.push(`${p.where}.${JSON.stringify(p.key)} still holds ${p.value}`);
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
/* PATIENT-NUMBER COLLISIONS                                               */
/* ====================================================================== */

/**
 * OWNER-PRE-RULED FALLBACK, 2026-08-25. Built now, used only if needed.
 *
 * ==========================================================================
 * THE PROBLEM IT SOLVES, AND WHY THE DEFAULT STAYS AS IT IS
 * ==========================================================================
 * `patients.patient_number` is per-tenant unique (`patients_tenant_number_uq`,
 * migration 0029) and the vendor's `numero_paciente` is AUTHORITATIVE by owner
 * ruling 2026-08-24 - so it is imported verbatim. The clinic's EXISTING
 * patients already hold numbers. A vendor number colliding with one of those is
 * REJECTED at insert, and no migration fixes it: those rows own those numbers.
 *
 * WITHOUT THE FLAG NOTHING CHANGES, deliberately. A collision still rejects, and
 * rejecting is the RIGHT default: silently renumbering a patient the clinic
 * identifies by that number is a data change nobody asked for. The flag exists
 * so the decision is made once, in advance, by the owner - not improvised at
 * 22:00 with rows already written.
 *
 * ==========================================================================
 * HOW A REASSIGNMENT ACTUALLY HAPPENS: BY OMITTING THE KEY
 * ==========================================================================
 * `upsert.ts` spreads `patientNumber` CONDITIONALLY, and 0029's
 * `assign_patient_number` only fills the column `IF NEW.patient_number IS NULL`.
 * So a patient whose key is ABSENT gets a trigger-assigned number, and one
 * whose key is present keeps it. Deleting the key is the entire mechanism -
 * there is no renumbering code, and passing `null` would be REJECTED because
 * the column is NOT NULL.
 */
export function planPatientNumberReassignment(records, existingNumbers) {
  const existing = existingNumbers instanceof Set ? existingNumbers : new Set(existingNumbers ?? []);
  const reassign = new Map(); // sourceId -> vendor number
  const planned = records.map((r) => {
    if (r.entityType !== "patient") return r;
    const n = r.record?.data?.patientNumber;
    if (typeof n !== "number" || !existing.has(n)) return r;
    // A COPY, never a mutation of the caller's record. The STAGED row keeps the
    // vendor's number in `raw` - that is the audit trail, and it must still say
    // what the vendor sent even though the target row will not.
    reassign.set(r.sourceId, n);
    const data = { ...r.record.data };
    delete data.patientNumber;
    return { ...r, record: { ...r.record, data } };
  });
  return { records: planned, reassign };
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
  reassignConflictingPatientNumbers = false,
  log = console.log,
}) {
  const counts = {};
  for (const e of ENTITY_ORDER) {
    counts[e] = adapterResult.records.filter((r) => r.entityType === e).length;
  }
  const reasons = new Map();
  for (const t of adapterResult.toReview) reasons.set(t.reason, (reasons.get(t.reason) ?? 0) + 1);

  /* -- 1. mapping coverage, BEFORE anything is staged -- */
  // TO_NORMALIZE entries are stripped BEFORE coverage, so they read as unmapped
  // rather than as a key upsert would later throw on.
  const stripped = stripToNormalize(config);
  for (const k of stripped.removed) {
    log(`  note  serviceKeyByType ${JSON.stringify(k)} is TO_NORMALIZE - imported WITHOUT a service`);
  }
  // RETURNED ON EVERY PATH so the WIRING is assertable, not just the helper.
  // `stripToNormalize` had a passing unit test while nothing proved runImport
  // called it - a negative control that passed TO_NORMALIZE straight through
  // left all 23 assertions green. The function working and the function being
  // used are different facts.
  const effectiveConfig = stripped.config;
  const coverage = checkMappingCoverage(adapterResult, effectiveConfig);
  if (!coverage.ok) {
    log("REFUSED - the mapping config does not cover this delivery.");
    for (const m of coverage.missing) log(`  missing   ${m}`);
    for (const [k, n] of coverage.unmappedTerapeuta) log(`  terapeuta unmapped  ${JSON.stringify(k)}  ${n} row(s)`);
    for (const [k, n] of coverage.unmappedServico) log(`  tipo_servico unmapped  ${JSON.stringify(k)}  ${n} row(s)`);
    log("");
    log("NOTHING WAS STAGED. A partial mapping does not crash - it imports a");
    log("fraction of the diary and reports success over the rest.");
    return { exit: EXIT.FAILED, staged: 0, imported: 0, counts, reasons, coverage, effectiveConfig };
  }

  /* -- 2. report what the adapter produced -- */
  log("ADAPTER OUTPUT");
  for (const e of ENTITY_ORDER) log(`  ${e.padEnd(18)} ${counts[e]}`);
  log(`  to_review          ${adapterResult.toReview.length}`);
  for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    log(`      ${r.padEnd(34)} ${n}`);
  }
  for (const w of adapterResult.warnings) log(`  warning  ${w}`);

  // THE DAY-ONE LOGIN CHECK. LAUNCH-03 names this as the count that decides
  // whether most of the patient base can log in: the portal authenticates BY
  // TELEPHONE, migration 0062 derives phone_e164 and yields NULL for a shape it
  // does not recognise, and that patient then simply cannot get in - with
  // nothing in any log to say so.
  //
  // A COUNT AND NEVER THE NUMBERS. A phone number is personal data; how many
  // patients are locked out is not.
  const blank = adapterResult.checks?.blankPhones ?? 0;
  const unparseable = adapterResult.checks?.unresolvablePhones ?? 0;
  // THE TOTAL, NOT THE UNPARSEABLE COUNT. A blank `telefone` locks a patient out
  // exactly as an unparseable one does - 0062 derives NULL for both - and
  // reporting only the second understated the amostra by 505.
  const noPhone = adapterResult.checks?.noPortalLogin ?? blank + unparseable;
  if (noPhone > 0) {
    log("");
    log(
      `  DAY-ONE LOGIN  ${noPhone} patient(s) will have no portal login: ` +
        `${blank} blank telefone, ${unparseable} unparseable`,
    );
    log("                 They will be imported and will NOT be able to log into the");
    log("                 portal. This is a data question for the clinic, not a bug.");
  } else {
    log("  DAY-ONE LOGIN  every patient has a resolvable telephone number.");
  }
  log("");

  if (dryRun) {
    log("DRY RUN - nothing was staged and no database was contacted.");
    return { exit: EXIT.OK, staged: 0, imported: 0, counts, reasons, coverage, effectiveConfig };
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
    return { exit: EXIT.OK, staged: staged.length, imported: 0, counts, reasons, coverage, effectiveConfig, validation };
  }

  /* -- 4. the live gate -- */
  if (confirm !== CONFIRM_PHRASE) {
    log("REFUSED - --apply requires the exact confirmation phrase.");
    log("Nothing was imported. The staging ledger is untouched and can be re-used.");
    return { exit: EXIT.FAILED, staged: staged.length, imported: 0, counts, reasons, coverage, effectiveConfig, validation };
  }

  /* -- 5. attachments must have their bytes already in the bucket -- */
  const orphanAttachments = attachmentsWithoutObjects(adapterResult.records, checkpointByPath);
  if (orphanAttachments.length > 0) {
    log(`REFUSED - ${orphanAttachments.length} attachment(s) have no uploaded object.`);
    log("storage_path is NOT NULL, so these rows would be written and would point");
    log("at nothing. Run copy-attachments.mjs to completion first.");
    return { exit: EXIT.FAILED, staged: staged.length, imported: 0, counts, reasons, coverage, effectiveConfig, validation, orphanAttachments };
  }

  /* -- 5b. patient-number collisions, ONLY when the flag is set -- */
  // READ ONCE, before any patient is imported. Re-reading per patient would be
  // thousands of round trips, and would also see numbers this very run had just
  // assigned - so a later vendor number could collide with an earlier
  // reassignment and be reassigned again, for no reason.
  let importRecords = adapterResult.records;
  let reassign = new Map();
  if (reassignConflictingPatientNumbers) {
    if (typeof pipeline.existingPatientNumbers !== "function") {
      log("REFUSED - --reassign-conflicting-patient-numbers needs a pipeline that can read");
      log("existing patient numbers, and this one cannot. Nothing was imported.");
      return { exit: EXIT.FAILED, staged: staged.length, imported: 0, counts, reasons, coverage, effectiveConfig, validation };
    }
    const existing = await pipeline.existingPatientNumbers();
    const plan = planPatientNumberReassignment(adapterResult.records, existing);
    importRecords = plan.records;
    reassign = plan.reassign;
    log(`PATIENT NUMBERS  ${existing.length ?? existing.size ?? 0} already in use for this tenant`);
    log(`                 ${reassign.size} vendor number(s) collide and will be REASSIGNED by the trigger`);
    log("");
  }

  /* -- 6. import, in dependency order -- */
  let imported = 0;
  let importSkipped = 0;
  let importFailed = 0;
  let importRetried = 0;
  const perEntity = {};
  const perEntitySkipped = {};
  const perEntityFailed = {};
  const perEntitySecs = {};
  for (const entityType of ENTITY_ORDER) {
    const batch = orderForImport(entityType, importRecords.filter((r) => r.entityType === entityType));
    if (batch.length === 0) {
      perEntity[entityType] = 0;
      perEntitySkipped[entityType] = 0;
      perEntityFailed[entityType] = 0;
      continue;
    }
    const t0 = Date.now();
    const res = await pipeline.importRecords(entityType, batch);
    const secs = (Date.now() - t0) / 1000;
    perEntity[entityType] = res.imported ?? 0;
    perEntitySkipped[entityType] = res.skipped ?? 0;
    perEntityFailed[entityType] = res.failed ?? 0;
    perEntitySecs[entityType] = secs;
    imported += res.imported ?? 0;
    importSkipped += res.skipped ?? 0;
    importFailed += res.failed ?? 0;
    importRetried += res.retried ?? 0;
    // B8: instrumentation only. The rate is the number that turns "the apply
    // took a while" into a window you can schedule.
    const rate = secs > 0 ? (batch.length / secs).toFixed(1) : "n/a";
    log(
      `IMPORTED  ${entityType.padEnd(18)} ${String(res.imported ?? 0).padStart(5)}` +
        `   skipped ${String(res.skipped ?? 0).padStart(5)}` +
        `   failed ${String(res.failed ?? 0).padStart(4)}` +
        `   ${secs.toFixed(1)}s   ${rate} rows/s`,
    );
  }
  // THE IDEMPOTENCY NUMBER. On a second --apply every IMPORTED reads 0 and this
  // carries the first run's count: nothing was written and nothing was lost.
  log(`SKIPPED   ${importSkipped}`);
  if (importRetried > 0) {
    log(`RETRIED   ${importRetried} row(s) that had failed on an earlier run`);
  }

  /* -- 6b. what the trigger actually assigned -- */
  // THE PAIR IS THE DELIVERABLE. A count of reassignments is useless to
  // reception: the patient walks in quoting the OLD number, and somebody has to
  // map it to the new one. NUMBERS ONLY - no name, no sourceId, no id. A pair
  // of integers is not personal data; a list of renamed patients would be.
  let numberPairs = [];
  if (reassign.size > 0) {
    if (typeof pipeline.assignedPatientNumbers === "function") {
      const assigned = await pipeline.assignedPatientNumbers([...reassign.keys()]);
      numberPairs = [...reassign.entries()]
        .map(([sourceId, vendor]) => [vendor, assigned.get(sourceId) ?? null])
        .sort((a, b) => a[0] - b[0]);
    } else {
      // NAMED, not swallowed. The rows imported correctly; what is missing is
      // the mapping reception needs, and silence would read as "no collisions".
      log("WARNING  the pipeline cannot read back assigned numbers - the");
      log(`         vendor-to-assigned pairs for ${reassign.size} patient(s) are NOT available.`);
    }
  }

  /* -- 7. reconcile -- */
  const report = await pipeline.reconcile();
  log("");
  log("RECONCILIATION");
  for (const e of ENTITY_ORDER) {
    log(
      `  ${e.padEnd(18)} staged=${report.staged?.[e] ?? 0}  imported=${report.imported?.[e] ?? 0}` +
        `  to_review=${report.toReview?.[e] ?? 0}  failed=${report.failed?.[e] ?? 0}`,
    );
  }
  if (report.referentialIntegrity) {
    log(`  referential integrity: ${report.referentialIntegrity.ok ? "OK" : `${report.referentialIntegrity.problems} problem(s)`}`);
  }
  if (report.patientNumberFidelity) {
    const f = report.patientNumberFidelity;
    log(`  patient number fidelity: ${f.ok ? "OK" : `${f.changed} changed`}   (${f.checked} vendor number(s) checked)`);
  }
  if (numberPairs.length > 0) {
    log("");
    log(`  PATIENT NUMBERS REASSIGNED  ${numberPairs.length}`);
    log("  vendor -> assigned   (numbers only; hand this list to reception)");
    for (const [vendor, assigned] of numberPairs) {
      log(`    ${String(vendor).padStart(8)} -> ${assigned === null ? "(not read back)" : assigned}`);
    }
  }

  /* -- 8. THE EXIT CODE, ruled 2026-08-26 -- *
   * It used to be `validation.failed === 0 && report.referentialIntegrity?.ok
   * !== false`, and both halves were blind. `validation.failed` is the VALIDATE
   * phase, which knows nothing about what the import did; `referentialIntegrity`
   * was never produced, so `undefined !== false` was permanently true. A run
   * that failed 162 of 2001 rows exited 0 and read as a clean import.
   *
   * FOUR INDEPENDENT CONDITIONS, all of which must hold. */
  const ledgerFailed = ENTITY_ORDER.reduce((n, e) => n + (report.failed?.[e] ?? 0), 0);
  const shortfall = ENTITY_ORDER.filter(
    (e) => (report.imported?.[e] ?? 0) < (report.staged?.[e] ?? 0) - (report.toReview?.[e] ?? 0),
  );
  const problems = [];
  if (validation.failed > 0) problems.push(`${validation.failed} row(s) failed validation`);
  if (importFailed > 0 || ledgerFailed > 0)
    problems.push(`${Math.max(importFailed, ledgerFailed)} ledger row(s) failed`);
  if (shortfall.length > 0)
    problems.push(`imported below staged for: ${shortfall.join(", ")}`);
  if (report.referentialIntegrity && !report.referentialIntegrity.ok)
    problems.push(`referential integrity: ${report.referentialIntegrity.problems} problem(s)`);
  if (report.patientNumberFidelity && !report.patientNumberFidelity.ok)
    problems.push(`${report.patientNumberFidelity.changed} vendor patient number(s) changed`);

  const failedCount = Math.max(importFailed, ledgerFailed, validation.failed);
  if (problems.length > 0) {
    log("");
    for (const p of problems) log(`  PROBLEM  ${p}`);
    // THE LAST LINE, so a transcript that is scrolled to the bottom says it.
    log(`IMPORT FAILED - ${failedCount} ledger row(s) failed`);
  }
  const clean = problems.length === 0;
  return { exit: clean ? EXIT.OK : EXIT.FAILED, staged: staged.length, imported, perEntity, perEntitySkipped, perEntityFailed, perEntitySecs, importSkipped, importFailed, importRetried, counts, reasons, coverage, effectiveConfig, validation, report, numberPairs };
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
