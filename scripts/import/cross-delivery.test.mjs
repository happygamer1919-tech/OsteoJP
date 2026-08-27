// The cross-delivery check must find the two failure classes that only exist
// because production runs TWO deliveries into ONE tenant, and it must never
// print a patient value while doing it.
//
// WHY THE LEAK TEST IS MECHANICAL. This script compares `id_paciente` and
// `numero_paciente` - both patient identifiers, both forbidden output under
// CLAUDE.md's isolation rule. The way that rule gets broken is not somebody
// deciding to ignore it; it is somebody adding one helpful line to a STOP
// message ("...colliding numbers: 41, 118") while making the output more
// useful. Every fixture cell here is a tracked token and the assertion is that
// NOT ONE of them reaches stdout or stderr.
//
// THE FIXTURES ARE BUILT HERE AND DELETED AFTER. No delivery file is involved,
// which is itself the rule: this suite runs in CI and CI must never need one.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT = fileURLToPath(new URL("./cross-delivery.mjs", import.meta.url));

/** Every data cell is ZZI<n> (an id) or ZZN<n> (a number). Nothing else is. */
const ID = (n) => `ZZI${String(n).padStart(3, "0")}`;
const NUM = (n) => `ZZN${String(n).padStart(3, "0")}`;

function delivery(rows, { header = "id_paciente,nome_completo,numero_paciente", bom = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cross-delivery-"));
  const body = rows.map((r) => r.join(",")).join("\n");
  fs.writeFileSync(path.join(dir, "pacientes.csv"), `${bom ? "﻿" : ""}${header}\n${body}\n`, "utf8");
  return dir;
}

function run(a, b) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, a, b], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** The count printed against a label, read out of the aligned output. */
function count(out, label) {
  const m = out.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)`));
  assert.ok(m, `no line for "${label}" in:\n${out}`);
  return Number(m[1]);
}

const cleanup = [];
test.after(() => { for (const d of cleanup) fs.rmSync(d, { recursive: true, force: true }); });
const keep = (d) => { cleanup.push(d); return d; };

/* ---------------- the identical case: full overlap, nothing differs ------- */

test("two identical deliveries: every id shared, nothing differs, exit 0", () => {
  const rows = [[ID(1), "n", NUM(1)], [ID(2), "n", NUM(2)], [ID(3), "n", NUM(3)]];
  const a = keep(delivery(rows));
  const b = keep(delivery(rows));
  const r = run(a, b);
  assert.equal(r.code, 0);
  assert.equal(count(r.out, "shared id_paciente  "), 3);
  assert.equal(count(r.out, "shared numero_paciente  "), 3);
  assert.equal(count(r.out, "shared id_paciente whose numero_paciente DIFFERS"), 0);
  assert.equal(count(r.out, "shared numero_paciente whose id_paciente DIFFERS"), 0);
});

/* ---------------- one number changed on a shared person ------------------- */

test("a shared id whose number differs is counted, and is NOT a stop", () => {
  // The FIRST delivery imported wins and the second row is skipped, so the
  // second number is never written. Reception needs to know; the run does not
  // stop.
  const a = keep(delivery([[ID(1), "n", NUM(1)], [ID(2), "n", NUM(2)]]));
  const b = keep(delivery([[ID(1), "n", NUM(1)], [ID(2), "n", NUM(9)]]));
  const r = run(a, b);
  assert.equal(r.code, 0, "a differing number on the same person must not stop the run");
  assert.equal(count(r.out, "shared id_paciente whose numero_paciente DIFFERS"), 1);
  assert.equal(count(r.out, "shared numero_paciente whose id_paciente DIFFERS"), 0);
  assert.match(r.out, /THE SAME PERSON CARRIES DIFFERENT NUMBERS: 1/);
});

/* ---------------- THE STOP: one number, two people ------------------------ */

test("a number claimed by different people STOPS with exit 1", () => {
  // patients_tenant_number_uq is per-TENANT and both clinics import into one
  // tenant. This is the failure that lands mid-run, after the first clinic is
  // already committed.
  const a = keep(delivery([[ID(1), "n", NUM(1)]]));
  const b = keep(delivery([[ID(2), "n", NUM(1)]]));
  const r = run(a, b);
  assert.equal(r.code, 1, "the collision class must exit 1, not 0");
  assert.equal(count(r.out, "shared numero_paciente whose id_paciente DIFFERS"), 1);
  assert.match(r.out, /^STOP\./m);
  assert.match(r.out, /patients_tenant_number_uq/);
  assert.match(r.out, /OWNER DECISION/);
  assert.match(r.out, /--reassign-conflicting-patient-numbers/);
});

test("the stop message names block 22's sibling remedy only when ids are shared", () => {
  const a = keep(delivery([[ID(1), "n", NUM(1)]]));
  const b = keep(delivery([[ID(2), "n", NUM(2)]]));
  const r = run(a, b);
  assert.equal(r.code, 0);
  assert.equal(count(r.out, "shared id_paciente  "), 0);
  assert.ok(!/backfill-patient-locations/.test(r.out), "no shared ids means no backfill advice");
});

test("a shared id points the reader at the backfill, because PL-09 needs it", () => {
  const a = keep(delivery([[ID(1), "n", NUM(1)]]));
  const b = keep(delivery([[ID(1), "n", NUM(1)]]));
  const r = run(a, b);
  assert.match(r.out, /backfill-patient-locations\.sql/);
  assert.match(r.out, /PL-09/);
});

/* ---------------- blanks are never a shared value ------------------------- */

test("blank numero_paciente is never treated as a shared number", () => {
  // 118 of the amostra's 1000 rows carry no number and 0029's trigger assigns
  // those after the import. Folding blanks together would report a collision on
  // every delivery holding more than one.
  const a = keep(delivery([[ID(1), "n", ""], [ID(2), "n", ""]]));
  const b = keep(delivery([[ID(3), "n", ""], [ID(4), "n", ""]]));
  const r = run(a, b);
  assert.equal(r.code, 0);
  assert.equal(count(r.out, "shared numero_paciente  "), 0);
  assert.equal(count(r.out, "shared numero_paciente whose id_paciente DIFFERS"), 0);
  assert.match(r.out, /blank numero_paciente/);
});

test("a shared person blank on one side only is counted as differing", () => {
  const a = keep(delivery([[ID(1), "n", NUM(1)]]));
  const b = keep(delivery([[ID(1), "n", ""]]));
  const r = run(a, b);
  assert.equal(r.code, 0);
  assert.equal(count(r.out, "shared id_paciente whose numero_paciente DIFFERS"), 1);
  assert.match(r.out, /blank on exactly one side/);
});

/* ---------------- it reads the same CSV dialects as the rest -------------- */

test("a BOM and a quoted delimiter do not break the header or the rows", () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "cross-delivery-"));
  keep(dirA);
  fs.writeFileSync(
    path.join(dirA, "pacientes.csv"),
    `﻿id_paciente;nome_completo;numero_paciente\n${ID(1)};"a; b";${NUM(1)}\n`,
    "utf8",
  );
  const b = keep(delivery([[ID(1), "n", NUM(1)]]));
  const r = run(dirA, b);
  assert.equal(r.code, 0);
  assert.equal(count(r.out, "shared id_paciente  "), 1);
  assert.equal(count(r.out, "shared numero_paciente  "), 1);
});

/* ---------------- invocation and unreadable input ------------------------- */

test("one argument is a BAD_INVOCATION, not a run against itself", () => {
  const a = keep(delivery([[ID(1), "n", NUM(1)]]));
  const r = run(a, "");
  assert.equal(r.code, 2);
  assert.match(r.out, /usage:/);
});

test("a missing pacientes.csv exits 2 and names no path contents", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cross-delivery-"));
  keep(empty);
  const b = keep(delivery([[ID(1), "n", NUM(1)]]));
  const r = run(empty, b);
  assert.equal(r.code, 2);
  assert.match(r.out, /unreadable/);
});

test("a pacientes.csv without the two columns exits 2", () => {
  const a = keep(delivery([["x", "y"]], { header: "nome_completo,morada" }));
  const b = keep(delivery([[ID(1), "n", NUM(1)]]));
  const r = run(a, b);
  assert.equal(r.code, 2);
  assert.match(r.out, /no id_paciente column/);
});

/* ---------------- IT OPENS NO DATABASE -------------------------------------*/

test("it contacts nothing: no pg, no fetch, no env read of a connection string", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  for (const forbidden of ["DATABASE_URL", "SUPABASE_URL", "SERVICE_ROLE", "postgres", "fetch(", "child_process"]) {
    assert.ok(!src.includes(forbidden), `cross-delivery.mjs must stay read-only and offline: found ${forbidden}`);
  }
});

/* ---------------- THE LEAK TEST ------------------------------------------- */

test("NOT ONE id or number from either delivery reaches the output", () => {
  // Every branch at once: shared ids, a differing number, and a colliding
  // number - so the STOP path prints too, since that is the message most
  // tempted to name the offending values.
  const a = keep(delivery([
    [ID(1), "n", NUM(1)],
    [ID(2), "n", NUM(2)],
    [ID(3), "n", ""],
    [ID(4), "n", NUM(4)],
  ]));
  const b = keep(delivery([
    [ID(1), "n", NUM(1)],
    [ID(2), "n", NUM(9)],
    [ID(3), "n", NUM(3)],
    [ID(5), "n", NUM(4)],
  ]));
  const r = run(a, b);
  assert.equal(r.code, 1, "the fixture must reach the STOP path");
  for (let i = 1; i <= 9; i += 1) {
    assert.ok(!r.out.includes(ID(i)), `an id_paciente reached the output: ${ID(i)}`);
    assert.ok(!r.out.includes(NUM(i)), `a numero_paciente reached the output: ${NUM(i)}`);
  }
  assert.ok(!/ZZ[IN]/.test(r.out), "a tracked token reached the output");
});

test("the header names are printable, and only on the malformed path", () => {
  // A header is the file's structure, not its contents - the same ruling
  // distinct-keys.mjs prints its headers under. It must not appear otherwise.
  const a = keep(delivery([[ID(1), "n", NUM(1)]]));
  const b = keep(delivery([[ID(1), "n", NUM(1)]]));
  assert.ok(!run(a, b).out.includes("nome_completo"));
});
