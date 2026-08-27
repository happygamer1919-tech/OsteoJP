// The import runner, against generated fixtures and an INJECTED pipeline.
// No database, no adapter run against a real delivery.
//
// The injected pipeline RECORDS every call, which is what makes the
// never-delete rule provable rather than merely stated.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachmentsWithoutObjects,
  checkMappingCoverage,
  findPlaceholders,
  PLACEHOLDER_UUID,
  stripToNormalize,
  CONFIRM_PHRASE,
  ENTITY_ORDER,
  EXIT,
  orderForImport,
  runImport,
} from "./run-import.mjs";

const CONFIG = {
  practitionerKeyByName: { "Dr Sintetico": "jp" },
  serviceKeyByType: { Osteopatia: "osteopatia" },
  location: { kind: "fixed", locationKey: "linda-a-velha" },
};

const rec = (entityType, sourceId, data = {}) => ({
  entityType,
  sourceId,
  raw: {},
  record: { entityType, data: { sourceId, ...data } },
});

function adapterResult(over = {}) {
  return {
    records: over.records ?? [rec("patient", "P1"), rec("appointment", "A1")],
    toReview: over.toReview ?? [],
    warnings: over.warnings ?? [],
    checks: { unmappedTerapeuta: [], unmappedTipoServico: [], ...(over.checks ?? {}) },
  };
}

/** Records every call. Nothing here can delete, and the test proves it. */
function fakePipeline(over = {}) {
  const calls = [];
  return {
    calls,
    async stageRows(records) {
      calls.push(["stageRows", records.length]);
      return records.map((r) => ({ sourceId: r.sourceId }));
    },
    async validate(staged) {
      calls.push(["validate", staged.length]);
      return over.validation ?? { validated: staged.length, failed: 0 };
    },
    async importRecords(entityType, batch) {
      calls.push(["importRecords", entityType, batch.length, batch.map((r) => r.sourceId)]);
      return over.importResult?.(entityType, batch) ?? { imported: batch.length, failed: 0 };
    },
    async reconcile() {
      calls.push(["reconcile"]);
      // THE REAL SHAPE. This double used to return {staged:{}, imported:{},
      // toReview:{}, referentialIntegrity:{ok:true}}, which the producer never
      // returned - so the printer was asserted against a contract nothing
      // honoured and both sides stayed green while every RECONCILIATION line
      // printed zeros in production.
      return over.report ?? emptyReport();
    },
  };
}

const silent = () => {};

const ZERO = () => ({ patient: 0, appointment: 0, clinical_episode: 0, clinical_record: 0, attachment: 0 });
/** Mirrors generateReconciliationReport's return shape, all-clean. */
function emptyReport(over = {}) {
  return {
    batchId: "00000000-0000-0000-0000-000000000001",
    generatedAt: "2026-08-26T00:00:00.000Z",
    totalRows: 0,
    byEntityType: ZERO(),
    byStatus: { pending: 0, validated: 0, imported: 0, failed: 0 },
    failedRows: [],
    importedCount: 0,
    pendingCount: 0,
    staged: ZERO(),
    imported: ZERO(),
    toReview: ZERO(),
    failed: ZERO(),
    referentialIntegrity: { ok: true, problems: 0, byEntityType: ZERO() },
    patientNumberFidelity: { ok: true, checked: 0, changed: 0 },
    ...over,
  };
}

test("the dependency order is patient -> episode -> appointment -> record -> attachment", () => {
  assert.deepEqual(ENTITY_ORDER, [
    "patient",
    "clinical_episode",
    "appointment",
    "clinical_record",
    "attachment",
  ]);
});

test("--dry-run contacts no pipeline at all", async () => {
  const p = fakePipeline();
  const r = await runImport({ adapterResult: adapterResult(), config: CONFIG, pipeline: p, dryRun: true, log: silent });
  assert.equal(r.exit, EXIT.OK);
  assert.deepEqual(p.calls, []);
});

test("preview stages and validates and writes NO target table", async () => {
  const p = fakePipeline();
  const r = await runImport({ adapterResult: adapterResult(), config: CONFIG, pipeline: p, log: silent });
  assert.equal(r.exit, EXIT.OK);
  assert.equal(r.imported, 0);
  assert.ok(p.calls.some(([m]) => m === "stageRows"));
  assert.ok(p.calls.some(([m]) => m === "validate"));
  assert.ok(!p.calls.some(([m]) => m === "importRecords"), "preview must not import");
});

test("--apply WITHOUT the exact phrase is refused, and nothing is imported", async () => {
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult(), config: CONFIG, pipeline: p, apply: true, confirm: "yes please", log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.ok(!p.calls.some(([m]) => m === "importRecords"));
});

test("--apply WITH the exact phrase imports in dependency order", async () => {
  const records = [
    rec("attachment", "T1", { storagePath: "t/a.pdf" }),
    rec("clinical_record", "R1"),
    rec("appointment", "A1"),
    rec("clinical_episode", "E1"),
    rec("patient", "P1"),
  ];
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult({ records }),
    config: CONFIG,
    pipeline: p,
    apply: true,
    confirm: CONFIRM_PHRASE,
    checkpointByPath: new Map([["t/a.pdf", { status: "uploaded" }]]),
    log: silent,
  });
  assert.equal(r.exit, EXIT.OK);
  // The records were supplied in REVERSE order deliberately: the runner must
  // impose the order, not inherit it from however the adapter emitted.
  const order = p.calls.filter(([m]) => m === "importRecords").map(([, e]) => e);
  assert.deepEqual(order, ENTITY_ORDER);
});

test("an attachment with no uploaded object REFUSES the whole run", async () => {
  // storage_path is NOT NULL, so the row would be written and would point at
  // nothing - and the database would accept it happily.
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult({ records: [rec("attachment", "T1", { storagePath: "t/missing.pdf" })] }),
    config: CONFIG,
    pipeline: p,
    apply: true,
    confirm: CONFIRM_PHRASE,
    checkpointByPath: new Map(),
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.equal(r.orphanAttachments.length, 1);
  assert.ok(!p.calls.some(([m]) => m === "importRecords"));
});

test("an attachment whose upload ended in CONFLICT also refuses", () => {
  const missing = attachmentsWithoutObjects(
    [rec("attachment", "T1", { storagePath: "t/a.pdf" })],
    new Map([["t/a.pdf", { status: "conflict" }]]),
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0].status, "conflict");
});

test("an incomplete mapping HARD FAILS before anything is staged", async () => {
  // A partial mapping does not crash: it imports a fraction of the diary and
  // reports success over the rest.
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult({ checks: { unmappedTerapeuta: [["Dra Quem", 412]] } }),
    config: CONFIG,
    pipeline: p,
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.deepEqual(p.calls, [], "nothing may be staged");
  assert.deepEqual(r.coverage.unmappedTerapeuta, [["Dra Quem", 412]]);
});

test("the refusal NAMES the unmapped keys with counts", async () => {
  const lines = [];
  await runImport({
    adapterResult: adapterResult({
      checks: { unmappedTerapeuta: [["Dra Quem", 412], ["Typo", 1]], unmappedTipoServico: [["Pilates", 9]] },
    }),
    config: CONFIG,
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  const out = lines.join("\n");
  // Operational metadata, ruled safe to print, and a refusal that names nothing
  // is worse than no refusal - it cannot be acted on.
  assert.match(out, /"Dra Quem"\s+412 row\(s\)/);
  assert.match(out, /"Pilates"\s+9 row\(s\)/);
});

test("a missing location config is a hard fail", async () => {
  const r = await runImport({
    adapterResult: adapterResult(),
    config: { practitionerKeyByName: {} },
    pipeline: fakePipeline(),
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.ok(r.coverage.missing.includes("location"));
});

test("an unknown location.kind is a hard fail rather than a default", () => {
  const c = checkMappingCoverage(adapterResult(), { practitionerKeyByName: {}, location: { kind: "guess" } });
  assert.equal(c.ok, false);
  assert.match(c.missing.join(" "), /location.kind/);
});

test("NOTHING IS EVER DELETED FROM THE STAGING LEDGER", async () => {
  // The ledger is the audit trail and the idempotency key. A run that deletes
  // from it makes the next run re-import everything it already did.
  const p = fakePipeline();
  await runImport({
    adapterResult: adapterResult(),
    config: CONFIG,
    pipeline: p,
    apply: true,
    confirm: CONFIRM_PHRASE,
    log: silent,
  });
  const methods = p.calls.map(([m]) => m).join(" ");
  assert.ok(!/delete|remove|truncate|drop|clear/i.test(methods), `pipeline saw: ${methods}`);
  // And the runner exposes no such capability to inject in the first place.
  assert.equal(typeof p.deleteRows, "undefined");
});

test("a validation failure makes the exit code non-zero even when the import ran", async () => {
  const r = await runImport({
    adapterResult: adapterResult(),
    config: CONFIG,
    pipeline: fakePipeline({ validation: { validated: 1, failed: 1 } }),
    apply: true,
    confirm: CONFIRM_PHRASE,
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
});

test("a referential-integrity problem in the report fails the run", async () => {
  const r = await runImport({
    adapterResult: adapterResult(),
    config: CONFIG,
    pipeline: fakePipeline({
      report: emptyReport({ referentialIntegrity: { ok: false, problems: 3, byEntityType: ZERO() } }),
    }),
    apply: true,
    confirm: CONFIRM_PHRASE,
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
});

test("the preview reports the day-one login count, as a COUNT", async () => {
  // LAUNCH-03's check. The portal logs in by telephone; a patient whose number
  // does not resolve is imported and cannot get in, with nothing in any log.
  const lines = [];
  await runImport({
    adapterResult: adapterResult({
      checks: { blankPhones: 505, unresolvablePhones: 7, noPortalLogin: 512 },
    }),
    config: CONFIG,
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  const out = lines.join("\n");
  // THE TOTAL AND THE SPLIT. Reporting only the unparseable count understated
  // the August 2026 amostra by 505: a blank telefone derives phone_e164 NULL
  // exactly as an unparseable one does, and locks the patient out identically.
  assert.match(out, /DAY-ONE LOGIN\s+512 patient\(s\) will have no portal login: 505 blank telefone, 7 unparseable/);
});

test("the day-one count is the TOTAL, not the unparseable half", async () => {
  const lines = [];
  await runImport({
    adapterResult: adapterResult({
      checks: { blankPhones: 505, unresolvablePhones: 7, noPortalLogin: 512 },
    }),
    config: CONFIG,
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  const out = lines.join("\n");
  assert.ok(!/DAY-ONE LOGIN\s+7 /.test(out), out);
});

test("it says so affirmatively when every patient has a number", async () => {
  // Silence would read as "not checked". The absence of a warning and a
  // positive statement are different facts.
  const lines = [];
  await runImport({
    adapterResult: adapterResult({ checks: { blankPhones: 0, unresolvablePhones: 0, noPortalLogin: 0 } }),
    config: CONFIG,
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  assert.match(lines.join("\n"), /every patient has a resolvable telephone number/);
});

/* ---------------- the committed template and its placeholders ---------------- */

const TEMPLATE = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "mapping-config.template.json"),
    "utf8",
  ),
);

test("the committed TEMPLATE is refused as-is - every slot is a placeholder", async () => {
  // The whole point of the template: it must be impossible to run unfilled.
  // Before 2026-08-25 a config of all-zero uuids passed every check, staged the
  // delivery, and failed at import time on a foreign key with rows written.
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult(),
    config: TEMPLATE,
    pipeline: p,
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.deepEqual(p.calls, [], "nothing may be staged from a template");
});

test("a single placeholder uuid is enough to refuse the run", async () => {
  // A placeholder is worse than a MISSING key: a missing key routes its rows to
  // to_review and the run stays honest, while a placeholder uuid is a confident
  // answer that is false.
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult(),
    config: { ...CONFIG, practitionerKeyByName: { "Dr Sintetico": PLACEHOLDER_UUID } },
    pipeline: p,
    log: silent,
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.deepEqual(p.calls, []);
});

test("PENDING_OWNER_RULING refuses the run and NAMES the key", async () => {
  const lines = [];
  const r = await runImport({
    adapterResult: adapterResult(),
    config: { ...CONFIG, practitionerKeyByName: { "Clínica OsteoJP": "PENDING_OWNER_RULING" } },
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.match(lines.join("\n"), /Clínica OsteoJP.*PENDING_OWNER_RULING/);
});

test("findPlaceholders ignores _README keys, which are documentation", () => {
  const found = findPlaceholders(TEMPLATE);
  assert.ok(found.length > 0);
  assert.ok(!found.some((f) => f.key.startsWith("_")), "a _README must not read as a placeholder");
});

test("TO_NORMALIZE is STRIPPED, not passed through - upsert throws on an unresolved key", () => {
  // appointments.service_id is nullable so this is not fatal, but upsert.ts:320
  // throws unresolved("serviceKey") for a key with no resolver entry. Handing
  // "TO_NORMALIZE" to the adapter would turn an undecided catalogue label into a
  // mid-import crash.
  const { config, removed } = stripToNormalize({
    serviceKeyByType: { Tratamento: "svc-1", Diversos: "TO_NORMALIZE" },
  });
  assert.deepEqual(removed, ["Diversos"]);
  assert.deepEqual(config.serviceKeyByType, { Tratamento: "svc-1" });
});

test("a TO_NORMALIZE service does NOT block an otherwise complete run, AND IS STRIPPED", async () => {
  // THE SECOND HALF IS THE ONE THAT MATTERS. `stripToNormalize` had a passing
  // unit test while nothing proved runImport CALLED it: a negative control
  // passing TO_NORMALIZE straight through left every assertion green. The
  // function working and the function being used are different facts, and
  // upsert.ts:320 throws on an unresolved serviceKey - so an unstripped value
  // is a mid-import crash, not a harmless label.
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult(),
    config: { ...CONFIG, serviceKeyByType: { Tratamento: "svc-1", Diversos: "TO_NORMALIZE" } },
    pipeline: p,
    log: silent,
  });
  assert.equal(r.exit, EXIT.OK);
  assert.ok(p.calls.some(([m]) => m === "stageRows"));
  assert.deepEqual(
    r.effectiveConfig.serviceKeyByType,
    { Tratamento: "svc-1" },
    "runImport must use the STRIPPED config, not the one it was handed",
  );
});

test("a placeholder tenantId refuses the run and NAMES the slot", async () => {
  // ADDED 2026-08-25 WITH THE `tenantId` SLOT. `findPlaceholders` scanned three
  // nested maps and never the config ROOT, so a slot added at the top level had
  // no placeholder check at all. tenantId is the worst one to miss: an all-zero
  // tenant uuid does not trip a foreign key - it writes the whole delivery into
  // a tenant that does not exist, under RLS policies that then hide every row,
  // and the run reports success.
  const lines = [];
  const p = fakePipeline();
  const r = await runImport({
    adapterResult: adapterResult(),
    config: { ...CONFIG, tenantId: PLACEHOLDER_UUID },
    pipeline: p,
    log: (l) => lines.push(l),
  });
  assert.equal(r.exit, EXIT.FAILED);
  assert.deepEqual(p.calls, [], "nothing may be staged behind a placeholder tenant");
  assert.match(lines.join("\n"), /config\."tenantId" still holds placeholder uuid/);
});

test("the committed TEMPLATE carries a tenantId slot, and it is a placeholder", () => {
  // The adapter REQUIRES tenantId (it builds the storage prefix from it) and
  // the template shipped without the slot, so a config filled exactly as the
  // template asked could not run at all. Both halves are pinned: the slot
  // exists, and it ships refusing.
  assert.equal(typeof TEMPLATE.tenantId, "string");
  assert.equal(TEMPLATE.tenantId, PLACEHOLDER_UUID);
});

test("the template's two clinics and two specialties match the vendor's answer", () => {
  // Vendor confirmed 2026-08-25: two exports one per clinic, and only these two
  // specialties. A third filename in a future delivery should be visibly a
  // surprise rather than absorbed.
  assert.deepEqual(Object.keys(TEMPLATE.location.knownLocations).sort(), [
    "castelo-branco",
    "linda-a-velha",
  ]);
  assert.deepEqual(TEMPLATE._specialties.known.sort(), ["Fisioterapia", "Osteopatia"]);
  assert.equal(TEMPLATE.location.kind, "fixed");
});

/* ====================================================================== */
/* B1: THE EXIT CODE READS THE IMPORT PHASE                                */
/* ====================================================================== */
//
// The 2026-08-26 apply failed 162 of 2001 rows and exited 0. The expression was
// `validation.failed === 0 && report.referentialIntegrity?.ok !== false`:
// the first half is the VALIDATE phase, which knows nothing about the import,
// and the second was permanently `undefined !== false`.

const APPLY = { apply: true, confirm: CONFIRM_PHRASE };

test("a batch with ONE failed ledger row exits 1 and says so on the LAST line", async () => {
  const lines = [];
  const r = await runImport({
    adapterResult: adapterResult(),
    config: CONFIG,
    pipeline: fakePipeline({
      report: emptyReport({
        staged: { ...ZERO(), patient: 3 },
        imported: { ...ZERO(), patient: 2 },
        failed: { ...ZERO(), patient: 1 },
      }),
    }),
    ...APPLY,
    log: (l) => lines.push(l),
  });
  assert.equal(r.exit, 1);
  assert.equal(lines.at(-1), "IMPORT FAILED - 1 ledger row(s) failed");
});

test("an imported count BELOW staged minus to_review exits 1, even with nothing marked failed", async () => {
  const lines = [];
  const r = await runImport({
    adapterResult: adapterResult(),
    config: CONFIG,
    pipeline: fakePipeline({
      report: emptyReport({
        staged: { ...ZERO(), appointment: 10 },
        imported: { ...ZERO(), appointment: 7 },
      }),
    }),
    ...APPLY,
    log: (l) => lines.push(l),
  });
  assert.equal(r.exit, 1);
  assert.match(lines.join("\n"), /PROBLEM {2}imported below staged for: appointment/);
});

test("referential integrity NOT ok exits 1", async () => {
  const r = await runImport({
    adapterResult: adapterResult(), config: CONFIG,
    pipeline: fakePipeline({ report: emptyReport({ referentialIntegrity: { ok: false, problems: 2, byEntityType: ZERO() } }) }),
    ...APPLY, log: silent,
  });
  assert.equal(r.exit, 1);
});

test("a CHANGED vendor patient number exits 1 - the ruling says the number is authoritative", async () => {
  const lines = [];
  const r = await runImport({
    adapterResult: adapterResult(), config: CONFIG,
    pipeline: fakePipeline({ report: emptyReport({ patientNumberFidelity: { ok: false, checked: 882, changed: 4 } }) }),
    ...APPLY, log: (l) => lines.push(l),
  });
  assert.equal(r.exit, 1);
  assert.match(lines.join("\n"), /4 vendor patient number\(s\) changed/);
});

test("a fully clean batch exits 0 and prints no IMPORT FAILED line", async () => {
  const lines = [];
  const r = await runImport({
    adapterResult: adapterResult(), config: CONFIG,
    pipeline: fakePipeline({ report: emptyReport() }),
    ...APPLY, log: (l) => lines.push(l),
  });
  assert.equal(r.exit, 0);
  assert.ok(!lines.some((l) => l.startsWith("IMPORT FAILED")), lines.join("\n"));
});

test("the reconciliation block prints failed, integrity and fidelity", async () => {
  const lines = [];
  await runImport({
    adapterResult: adapterResult(), config: CONFIG,
    pipeline: fakePipeline({ report: emptyReport({ patientNumberFidelity: { ok: true, checked: 882, changed: 0 } }) }),
    ...APPLY, log: (l) => lines.push(l),
  });
  const out = lines.join("\n");
  assert.match(out, /staged=\d+ {2}imported=\d+ {2}to_review=\d+ {2}failed=\d+/);
  assert.match(out, /referential integrity: OK/);
  assert.match(out, /patient number fidelity: OK {3}\(882 vendor number\(s\) checked\)/);
});

/* ====================================================================== */
/* B5: NUMBERED PATIENTS IMPORT FIRST                                      */
/* ====================================================================== */

test("orderForImport puts numbered patients before unnumbered ones, stably", () => {
  const pat = (sourceId, patientNumber) => ({ entityType: "patient", sourceId, record: { data: { patientNumber } } });
  const batch = [pat("a"), pat("b", 41), pat("c"), pat("d", 12), pat("e")];
  assert.deepEqual(orderForImport("patient", batch).map((r) => r.sourceId), ["b", "d", "a", "c", "e"]);
});

test("orderForImport leaves every OTHER entity untouched", () => {
  const batch = [{ entityType: "appointment", sourceId: "x" }, { entityType: "appointment", sourceId: "y" }];
  assert.equal(orderForImport("appointment", batch), batch);
});

test("the runner hands the patient batch to the pipeline NUMBERED FIRST", async () => {
  // The 12 self-collisions of 2026-08-26: an unnumbered row imported early took
  // a low trigger-assigned number that a later vendor row legitimately owned.
  const pat = (sourceId, patientNumber) => ({
    entityType: "patient", sourceId,
    record: { entityType: "patient", data: { sourceId, patientNumber } },
  });
  const pipeline = fakePipeline({ report: emptyReport() });
  await runImport({
    adapterResult: adapterResult({ records: [pat("p1"), pat("p2", 7), pat("p3"), pat("p4", 3)] }),
    config: CONFIG,
    pipeline,
    ...APPLY, log: silent,
  });
  const call = pipeline.calls.find((c) => c[0] === "importRecords" && c[1] === "patient");
  assert.deepEqual(call[3], ["p2", "p4", "p1", "p3"]);
});

/* ====================================================================== */
/* B6: TO_NORMALIZE NEVER REACHES THE RESOLVERS                            */
/* ====================================================================== */

test("stripToNormalize removes the sentinel, and that stripped config is what must be resolved through", () => {
  // The runner computed this and kept it as effectiveConfig, but import-core
  // built the pipeline from the RAW config - so resolvers.serviceIdByKey held
  // TO_NORMALIZE -> TO_NORMALIZE and importAppointment handed that string to
  // Postgres as a uuid: 22P02, killing all 61 Diversos appointments while the
  // run printed "imported WITHOUT a service" and exited 0.
  const stripped = stripToNormalize({
    ...CONFIG,
    serviceKeyByType: { Osteopatia: "osteopatia", Diversos: "TO_NORMALIZE" },
  });
  assert.deepEqual(stripped.removed, ["Diversos"]);
  assert.ok(!Object.values(stripped.config.serviceKeyByType).includes("TO_NORMALIZE"));
  assert.ok(!("Diversos" in stripped.config.serviceKeyByType));
});
