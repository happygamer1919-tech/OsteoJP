// THE PATIENT-NUMBER COLLISION FALLBACK. Owner-pre-ruled 2026-08-25.
//
// The three cases the dispatch names - collision WITH the flag imports and logs
// the pair, collision WITHOUT the flag rejects, non-colliding numbers preserved
// VERBATIM in both modes - plus the properties that make the pair list usable
// and safe to hand to reception.

import assert from "node:assert/strict";
import test from "node:test";

import {
  planPatientNumberReassignment,
  CONFIRM_PHRASE,
  EXIT,
  runImport,
} from "./run-import.mjs";

const CONFIG = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  practitionerKeyByName: { "Dr Sintetico": "jp" },
  serviceKeyByType: { Osteopatia: "osteopatia" },
  location: { kind: "fixed", locationKey: "linda-a-velha" },
};

const patient = (sourceId, patientNumber) => ({
  entityType: "patient",
  sourceId,
  raw: { id_paciente: sourceId, numero_paciente: patientNumber },
  record: { entityType: "patient", data: { sourceId, fullName: "Nome Inventado", patientNumber } },
});

function adapterResult(records) {
  return {
    records,
    toReview: [],
    warnings: [],
    checks: { unmappedTerapeuta: [], unmappedTipoServico: [] },
  };
}

/**
 * A pipeline that behaves like the real one: it REJECTS a duplicate number the
 * way `patients_tenant_number_uq` does, and assigns MAX+1 when the key is
 * absent, the way the 0029 trigger does.
 */
function fakePipeline({ existing = [], canReadBack = true } = {}) {
  const inUse = new Set(existing);
  const assignedBySource = new Map();
  const rejected = [];
  const calls = [];
  return {
    calls,
    rejected,
    inUse,
    async stageRows(records) {
      calls.push(["stageRows", records.length]);
      return records;
    },
    async validate(staged) {
      calls.push(["validate", staged.length]);
      return { validated: staged.length, failed: 0 };
    },
    async importRecords(entityType, batch) {
      calls.push(["importRecords", entityType, batch.length]);
      let imported = 0;
      for (const r of batch) {
        if (entityType !== "patient") {
          imported += 1;
          continue;
        }
        const n = r.record.data.patientNumber;
        if (typeof n === "number") {
          // The unique constraint.
          if (inUse.has(n)) {
            rejected.push(n);
            continue;
          }
          inUse.add(n);
          assignedBySource.set(r.sourceId, n);
        } else {
          // The trigger: MAX + 1.
          const next = Math.max(0, ...inUse) + 1;
          inUse.add(next);
          assignedBySource.set(r.sourceId, next);
        }
        imported += 1;
      }
      return { imported };
    },
    async reconcile() {
      calls.push(["reconcile"]);
      return { staged: {}, imported: {}, toReview: {}, referentialIntegrity: { ok: true } };
    },
    async existingPatientNumbers() {
      calls.push(["existingPatientNumbers"]);
      return [...existing];
    },
    ...(canReadBack
      ? {
          async assignedPatientNumbers(sourceIds) {
            calls.push(["assignedPatientNumbers", sourceIds.length]);
            const m = new Map();
            for (const s of sourceIds) if (assignedBySource.has(s)) m.set(s, assignedBySource.get(s));
            return m;
          },
        }
      : {}),
  };
}

const run = (records, pipeline, over = {}) =>
  runImport({
    adapterResult: adapterResult(records),
    config: CONFIG,
    pipeline,
    apply: true,
    confirm: CONFIRM_PHRASE,
    log: () => {},
    ...over,
  });

/* ====================================================================== */
/* THE PLANNER, IN ISOLATION                                               */
/* ====================================================================== */

test("a colliding number has its KEY DELETED, not set to null", () => {
  // The column is `integer NOT NULL DEFAULT sql\`null\``. Passing null is
  // REJECTED; omitting the key is what makes the trigger fill it. That
  // distinction is the entire mechanism.
  const { records, reassign } = planPatientNumberReassignment([patient("P1", 7)], [7]);
  const data = records[0].record.data;
  assert.equal("patientNumber" in data, false, "the key must be ABSENT, not null");
  assert.deepEqual([...reassign.entries()], [["P1", 7]]);
});

test("it never mutates the caller's records - the staged raw keeps the vendor number", () => {
  // The LEDGER is the audit trail and must still say what the vendor sent, even
  // though the target row will carry a different number.
  const original = patient("P1", 7);
  const { records } = planPatientNumberReassignment([original], [7]);
  assert.equal(original.record.data.patientNumber, 7, "the input must be untouched");
  assert.equal(original.raw.numero_paciente, 7);
  assert.notEqual(records[0], original);
});

test("a NON-colliding number is left exactly as it was", () => {
  const { records, reassign } = planPatientNumberReassignment([patient("P1", 900)], [7, 8]);
  assert.equal(records[0].record.data.patientNumber, 900);
  assert.equal(reassign.size, 0);
});

test("a patient with NO vendor number is untouched and is not counted a collision", () => {
  const p = patient("P1", undefined);
  delete p.record.data.patientNumber;
  const { records, reassign } = planPatientNumberReassignment([p], [7]);
  assert.equal("patientNumber" in records[0].record.data, false);
  assert.equal(reassign.size, 0);
});

test("non-patient entities are never inspected", () => {
  const appt = { entityType: "appointment", sourceId: "A1", raw: {}, record: { entityType: "appointment", data: { sourceId: "A1", patientNumber: 7 } } };
  const { records, reassign } = planPatientNumberReassignment([appt], [7]);
  assert.equal(records[0], appt, "an appointment must pass through by identity");
  assert.equal(reassign.size, 0);
});

/* ====================================================================== */
/* THE THREE CASES THE DISPATCH NAMES                                      */
/* ====================================================================== */

test("COLLISION WITH THE FLAG: imports, and logs the vendor -> assigned pair", async () => {
  const lines = [];
  const p = fakePipeline({ existing: [7, 8, 9] });
  const r = await run([patient("P1", 7)], p, {
    reassignConflictingPatientNumbers: true,
    log: (l) => lines.push(l),
  });
  assert.equal(r.exit, EXIT.OK);
  assert.equal(r.imported, 1, "the patient must import, not reject");
  assert.deepEqual(p.rejected, [], "nothing may be rejected in this mode");
  assert.deepEqual(r.numberPairs, [[7, 10]], "vendor 7 -> trigger-assigned 10");
  const out = lines.join("\n");
  assert.match(out, /PATIENT NUMBERS REASSIGNED\s+1/);
  assert.match(out, /7 -> 10/);
  assert.match(out, /hand this list to reception/);
});

test("COLLISION WITHOUT THE FLAG: rejected, current behaviour unchanged", async () => {
  const p = fakePipeline({ existing: [7, 8, 9] });
  const r = await run([patient("P1", 7)], p);
  assert.equal(p.rejected.length, 1, "the unique constraint must reject it");
  assert.equal(r.imported, 0);
  assert.deepEqual(r.numberPairs, [], "no pairs when the flag is off");
  assert.ok(
    !p.calls.some(([m]) => m === "existingPatientNumbers"),
    "without the flag the existing numbers must not even be read",
  );
});

test("NON-COLLIDING numbers are preserved VERBATIM in BOTH modes", async () => {
  for (const flag of [false, true]) {
    const p = fakePipeline({ existing: [7] });
    const r = await run([patient("P1", 900), patient("P2", 901)], p, {
      reassignConflictingPatientNumbers: flag,
    });
    assert.equal(r.imported, 2, `both import (flag=${flag})`);
    assert.deepEqual(r.numberPairs, [], `no reassignment (flag=${flag})`);
    assert.ok(p.inUse.has(900) && p.inUse.has(901), `900 and 901 kept verbatim (flag=${flag})`);
    assert.deepEqual(p.rejected, [], `nothing rejected (flag=${flag})`);
  }
});

/* ====================================================================== */
/* PROPERTIES THAT MAKE THE LIST USABLE AND SAFE                           */
/* ====================================================================== */

test("the pair list carries NUMBERS ONLY - no sourceId, no name", async () => {
  const p = fakePipeline({ existing: [7] });
  const r = await run([patient("P1", 7)], p, { reassignConflictingPatientNumbers: true });
  for (const pair of r.numberPairs) {
    assert.equal(pair.length, 2);
    assert.equal(typeof pair[0], "number");
    assert.equal(typeof pair[1], "number");
  }
  assert.ok(!JSON.stringify(r.numberPairs).includes("P1"), "no sourceId may reach the list");
  assert.ok(!JSON.stringify(r.numberPairs).includes("Nome"), "no name may reach the list");
});

test("existing numbers are read ONCE, not per patient", async () => {
  // Re-reading per patient would be thousands of round trips AND would see the
  // numbers this run had just assigned - so a later vendor number could collide
  // with an earlier reassignment and be reassigned again for no reason.
  const p = fakePipeline({ existing: [7, 8] });
  await run([patient("P1", 7), patient("P2", 8), patient("P3", 9)], p, {
    reassignConflictingPatientNumbers: true,
  });
  assert.equal(p.calls.filter(([m]) => m === "existingPatientNumbers").length, 1);
});

test("several collisions all import, and the pairs are sorted by vendor number", async () => {
  const p = fakePipeline({ existing: [7, 8] });
  const r = await run([patient("P1", 8), patient("P2", 7)], p, {
    reassignConflictingPatientNumbers: true,
  });
  assert.equal(r.imported, 2);
  assert.deepEqual(r.numberPairs.map(([v]) => v), [7, 8], "sorted by vendor number");
  for (const [, assigned] of r.numberPairs) assert.ok(assigned > 8);
});

test("a mixed batch: colliding reassigned, clean preserved, in one run", async () => {
  const p = fakePipeline({ existing: [7] });
  const r = await run([patient("P1", 7), patient("P2", 500)], p, {
    reassignConflictingPatientNumbers: true,
  });
  assert.equal(r.imported, 2);
  assert.deepEqual(r.numberPairs, [[7, 8]]);
  assert.ok(p.inUse.has(500), "the non-colliding number is untouched");
});

test("the flag with a pipeline that cannot read existing numbers REFUSES", async () => {
  // Section 1.3: an unknown case must not map onto the harmless-looking one.
  // Proceeding would import under the DEFAULT behaviour while the operator
  // believes reassignment is on.
  const p = fakePipeline({ existing: [7] });
  delete p.existingPatientNumbers;
  const r = await run([patient("P1", 7)], p, { reassignConflictingPatientNumbers: true });
  assert.equal(r.exit, EXIT.FAILED);
  assert.ok(!p.calls.some(([m]) => m === "importRecords"), "nothing may be imported");
});

test("if the pairs cannot be read back, it says so rather than reporting none", async () => {
  // The rows imported correctly; what is missing is the mapping reception needs.
  // Silence would read as "no collisions", which is the opposite of the truth.
  const lines = [];
  const p = fakePipeline({ existing: [7], canReadBack: false });
  const r = await run([patient("P1", 7)], p, {
    reassignConflictingPatientNumbers: true,
    log: (l) => lines.push(l),
  });
  assert.equal(r.imported, 1);
  assert.deepEqual(r.numberPairs, []);
  assert.match(lines.join("\n"), /cannot read back assigned numbers/);
});

test("--dry-run with the flag still contacts no pipeline at all", async () => {
  const p = fakePipeline({ existing: [7] });
  const r = await runImport({
    adapterResult: adapterResult([patient("P1", 7)]),
    config: CONFIG,
    pipeline: p,
    dryRun: true,
    reassignConflictingPatientNumbers: true,
    log: () => {},
  });
  assert.equal(r.exit, EXIT.OK);
  assert.deepEqual(p.calls, []);
});
