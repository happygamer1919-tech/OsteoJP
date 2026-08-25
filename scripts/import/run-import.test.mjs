// The import runner, against generated fixtures and an INJECTED pipeline.
// No database, no adapter run against a real delivery.
//
// The injected pipeline RECORDS every call, which is what makes the
// never-delete rule provable rather than merely stated.

import assert from "node:assert/strict";
import test from "node:test";

import {
  attachmentsWithoutObjects,
  checkMappingCoverage,
  CONFIRM_PHRASE,
  ENTITY_ORDER,
  EXIT,
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
      calls.push(["importRecords", entityType, batch.length]);
      return { imported: batch.length };
    },
    async reconcile() {
      calls.push(["reconcile"]);
      return over.report ?? { staged: {}, imported: {}, toReview: {}, referentialIntegrity: { ok: true } };
    },
  };
}

const silent = () => {};

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
      report: { staged: {}, imported: {}, toReview: {}, referentialIntegrity: { ok: false, problems: 3 } },
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
    adapterResult: adapterResult({ checks: { unresolvablePhones: 137 } }),
    config: CONFIG,
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  const out = lines.join("\n");
  assert.match(out, /DAY-ONE LOGIN\s+137 patient\(s\) have NO resolvable telephone/);
});

test("it says so affirmatively when every patient has a number", async () => {
  // Silence would read as "not checked". The absence of a warning and a
  // positive statement are different facts.
  const lines = [];
  await runImport({
    adapterResult: adapterResult({ checks: { unresolvablePhones: 0 } }),
    config: CONFIG,
    pipeline: fakePipeline(),
    log: (l) => lines.push(l),
  });
  assert.match(lines.join("\n"), /every patient has a resolvable telephone number/);
});
