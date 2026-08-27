#!/usr/bin/env node
/**
 * CROSS-DELIVERY IDENTITY CHECK - the one thing four rehearsals never touched.
 *
 * ==========================================================================
 * WHY THIS EXISTS
 * ==========================================================================
 * Every rehearsal ran ONE delivery. Production runs TWO, one per clinic, into
 * ONE tenant and ONE staging ledger. Everything about that is deliberate
 * (PROD-RUN.md 4.1), and it creates exactly two failure classes that no
 * single-delivery run can produce. Both are decided by comparing the two
 * `pacientes.csv` files BEFORE the first byte is written, because both are
 * discovered otherwise in the middle of the second clinic's import, on a night
 * with no undo.
 *
 *   SAME `id_paciente` IN BOTH FILES - ONE PERSON, SEEN AT BOTH CLINICS.
 *     The staging ledger's unique key is (tenant, source_system, entity_type,
 *     source_id) and the patient source id IS the vendor's `id_paciente`. So
 *     the second delivery's row for that person is recognised as ALREADY
 *     IMPORTED and skipped - which is correct for the patient record and
 *     WRONG for one thing: the skipped row is also what would have written the
 *     second clinic's `patient_locations` link. The patient ends up with
 *     appointments at Castelo Branco and no membership of it, and PL-09 scopes
 *     who may read a patient by exactly that table. That is what block 22's
 *     backfill repairs, and this count is what says whether it is needed.
 *
 *   SAME `numero_paciente` ON DIFFERENT `id_paciente` - TWO PEOPLE, ONE NUMBER.
 *     `patients_tenant_number_uq` is per-TENANT and both clinics import into one
 *     tenant. The second person's INSERT is rejected by the constraint, mid-run,
 *     after the first clinic is already committed. No migration fixes it and no
 *     ordering avoids it: the two numbering series were independent at the
 *     vendor and the collision is real. It is an OWNER decision about which
 *     patient keeps the number, and it is not a decision to take at 22:00.
 *
 * ==========================================================================
 * WHAT IT PRINTS, AND WHY THAT IS SAFE ON THE REAL DELIVERY
 * ==========================================================================
 * COUNTS. Nothing else. No `id_paciente`, no `numero_paciente`, no name, no
 * date, no row, not one field of one patient. Every line below is an integer.
 *
 * That is a deliberately harder rule than the one `distinct-keys.mjs` follows -
 * it prints therapist names, which are operational metadata. There is no
 * equivalent here: a patient number IS a patient identifier, so the answer to
 * "which numbers collide" is a question for the SQL editor against the staged
 * ledger, not for this script. What this script answers is "does the run stop",
 * and a count answers that.
 *
 * IT OPENS NO DATABASE AND NEEDS NO CONFIRMATION PHRASE. It reads two files and
 * exits. It is safe to run any number of times, days before the window, and it
 * is the cheapest possible way to find the one failure that would otherwise be
 * found half way through the second clinic.
 *
 * IVAN RUNS THIS ON THE REAL DELIVERY. A terminal may run it on the August 2026
 * amostra only (CLAUDE.md, *Exemption, ruled 2026-08-26*).
 *
 * Usage:
 *   node scripts/import/cross-delivery.mjs <delivery-A> <delivery-B>
 * Exit:
 *   0  read both, and no number is claimed by two different people
 *   1  STOP - a `numero_paciente` is shared by different `id_paciente`
 *   2  a directory or its pacientes.csv is missing, unreadable or malformed
 */

import fs from "node:fs";
import path from "node:path";

const EXIT = { OK: 0, FAILED: 1, BAD_INVOCATION: 2 };

/** NAME ONLY, NEVER THE MESSAGE - a read error can quote a path. */
const safeErr = (e) => `${e && e.name ? e.name : "Error"}${e && e.code ? ` code=${e.code}` : ""}`;

/* ---------------- CSV, the same state machine as distinct-keys ------------ */

function parseCsv(text, delim) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); field = ""; row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function detectDelimiter(text) {
  const end = text.search(/\r\n|\r|\n/);
  const first = end === -1 ? text : text.slice(0, end);
  let commas = 0, semis = 0, quoted = false;
  for (let i = 0; i < first.length; i += 1) {
    const c = first[i];
    if (c === '"') { if (quoted && first[i + 1] === '"') i += 1; else quoted = !quoted; continue; }
    if (quoted) continue;
    if (c === ",") commas += 1; else if (c === ";") semis += 1;
  }
  return semis > commas ? ";" : ",";
}

/* ---------------- read one delivery's patient identity columns ------------ */

/**
 * Returns { rows, byId: Map<id, Set<numero>>, byNumero: Map<numero, Set<id>>,
 *           blankNumero: number, blankId: number }.
 *
 * A BLANK `numero_paciente` IS NEVER A SHARED VALUE. 118 of the amostra's 1000
 * rows carry no number and 0029's trigger assigns those AFTER the import; two
 * blanks are not two people with the same number, and folding them together
 * would report a collision on every delivery that has more than one.
 */
function readDelivery(dir) {
  const file = path.join(dir, "pacientes.csv");
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    console.error(`${path.basename(dir)}/pacientes.csv: unreadable (${safeErr(e)})`);
    process.exit(EXIT.BAD_INVOCATION);
  }

  // Strip a UTF-8 BOM exactly as check-delivery.mjs does: readFileSync leaves it
  // in the string and it would otherwise become part of the first header name.
  const body = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
    ? buf.subarray(3)
    : buf;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const grid = parseCsv(text, detectDelimiter(text));
  if (grid.length === 0) {
    console.error(`${path.basename(dir)}/pacientes.csv: empty`);
    process.exit(EXIT.BAD_INVOCATION);
  }

  const headers = grid[0].map((h) => h.trim());
  const idx = {
    id_paciente: headers.indexOf("id_paciente"),
    numero_paciente: headers.indexOf("numero_paciente"),
  };
  for (const [col, i] of Object.entries(idx)) {
    if (i === -1) {
      // HEADER NAMES ONLY. They are the file's structure, not its contents.
      console.error(
        `${path.basename(dir)}/pacientes.csv: no ${col} column - headers are ${JSON.stringify(headers)}`,
      );
      process.exit(EXIT.BAD_INVOCATION);
    }
  }

  const byId = new Map();
  const byNumero = new Map();
  let rows = 0;
  let blankNumero = 0;
  let blankId = 0;
  for (let r = 1; r < grid.length; r += 1) {
    const line = grid[r];
    // A trailing newline yields one empty row; it is not a data row.
    if (line.length === 1 && (line[0] ?? "").trim() === "") continue;
    rows += 1;
    const id = (line[idx.id_paciente] ?? "").trim();
    const numero = (line[idx.numero_paciente] ?? "").trim();
    // A BLANK id is a row the adapter drops before staging (it has no source
    // id). Counted so the totals reconcile, never carried into a comparison.
    if (id === "") { blankId += 1; continue; }
    if (!byId.has(id)) byId.set(id, new Set());
    if (numero === "") {
      blankNumero += 1;
    } else {
      byId.get(id).add(numero);
      if (!byNumero.has(numero)) byNumero.set(numero, new Set());
      byNumero.get(numero).add(id);
    }
  }
  return { rows, byId, byNumero, blankNumero, blankId };
}

/* ---------------- compare ------------------------------------------------- */

const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

const dirA = process.argv[2];
const dirB = process.argv[3];
if (!dirA || !dirB) {
  console.error("usage: node scripts/import/cross-delivery.mjs <delivery-A> <delivery-B>");
  process.exit(EXIT.BAD_INVOCATION);
}

const A = readDelivery(dirA);
const B = readDelivery(dirB);

let sharedIds = 0;
let sharedIdsNumeroDiffers = 0;
let sharedIdsOneSideBlank = 0;
for (const [id, numsA] of A.byId) {
  const numsB = B.byId.get(id);
  if (!numsB) continue;
  sharedIds += 1;
  if (!sameSet(numsA, numsB)) {
    sharedIdsNumeroDiffers += 1;
    // ONE SIDE BLANK is a subclass worth separating: the person carries a
    // vendor number at one clinic and none at the other, so whichever delivery
    // imports first decides whether the number survives at all.
    if (numsA.size === 0 || numsB.size === 0) sharedIdsOneSideBlank += 1;
  }
}

let sharedNumeros = 0;
let sharedNumerosIdDiffers = 0;
for (const [numero, idsA] of A.byNumero) {
  const idsB = B.byNumero.get(numero);
  if (!idsB) continue;
  sharedNumeros += 1;
  if (!sameSet(idsA, idsB)) sharedNumerosIdDiffers += 1;
}

/* ---------------- the output ---------------------------------------------- */

const n = (v) => String(v).padStart(8);

console.log("FISIOZERO - CROSS-DELIVERY IDENTITY CHECK");
console.log("=========================================");
console.log("Counts only. No id, no number, no patient field, no row.");
console.log("");
console.log(`delivery A  ${path.basename(dirA)}`);
console.log(`delivery B  ${path.basename(dirB)}`);
console.log("");
console.log("PER DELIVERY");
console.log(`  A  ${n(A.rows)}  data row(s)   ${n(A.byId.size)} distinct id_paciente   ${n(A.blankNumero)} blank numero_paciente`);
console.log(`  B  ${n(B.rows)}  data row(s)   ${n(B.byId.size)} distinct id_paciente   ${n(B.blankNumero)} blank numero_paciente`);
if (A.blankId > 0 || B.blankId > 0) {
  console.log(`  rows with a BLANK id_paciente, excluded from every comparison:  A ${A.blankId}   B ${B.blankId}`);
}
console.log("");
console.log("SHARED BETWEEN THE TWO DELIVERIES");
console.log(`  shared id_paciente                                   ${n(sharedIds)}`);
console.log(`  shared numero_paciente                               ${n(sharedNumeros)}`);
console.log(`  shared id_paciente whose numero_paciente DIFFERS     ${n(sharedIdsNumeroDiffers)}`);
if (sharedIdsOneSideBlank > 0) {
  console.log(`    of those, blank on exactly one side                 ${n(sharedIdsOneSideBlank)}`);
}
console.log(`  shared numero_paciente whose id_paciente DIFFERS     ${n(sharedNumerosIdDiffers)}`);
console.log("");

/* ---------------- what each number means ---------------------------------- */

if (sharedIds > 0) {
  console.log(`ONE PERSON AT BOTH CLINICS: ${sharedIds}. CONTINUE - this is expected and`);
  console.log("  the import handles it. The second delivery's patient row is SKIPPED as");
  console.log("  already imported, which is right for the record and leaves that person");
  console.log("  WITHOUT a patient_locations link to the second clinic. Run block 22");
  console.log("  (scripts/import/backfill-patient-locations.sql) AFTER both clinics are");
  console.log("  imported. Do not skip it: PL-09 scopes patient visibility by exactly");
  console.log("  that table, so the second clinic cannot see its own patient without it.");
  console.log("");
}

if (sharedIdsNumeroDiffers > 0) {
  console.log(`THE SAME PERSON CARRIES DIFFERENT NUMBERS: ${sharedIdsNumeroDiffers}. NOT a stop, and`);
  console.log("  not silent either. The FIRST delivery imported wins; the second row is");
  console.log("  skipped and its number is never written. Whichever clinic quotes the");
  console.log("  other number will not find the patient by it. Tell reception.");
  console.log("");
}

if (sharedNumerosIdDiffers > 0) {
  console.log(`STOP. ${sharedNumerosIdDiffers} numero_paciente value(s) are claimed by DIFFERENT people`);
  console.log("  in the two deliveries. patients_tenant_number_uq is per-TENANT and both");
  console.log("  clinics import into ONE tenant, so the second person's INSERT is");
  console.log("  REJECTED by the constraint - mid-run, after the first clinic is already");
  console.log("  committed. No migration fixes it and no ordering avoids it.");
  console.log("");
  console.log("  THIS IS AN OWNER DECISION AND IT IS TAKEN BEFORE THE WINDOW, NOT DURING");
  console.log("  IT. Either the owner rules which patient keeps the number, or the CB run");
  console.log("  carries --reassign-conflicting-patient-numbers (PROD-RUN.md 3.3b) and the");
  console.log("  vendor -> assigned pairs go to reception on Monday.");
  console.log("");
  process.exit(EXIT.FAILED);
}

console.log("No numero_paciente is claimed by two different people. The CB run may");
console.log("proceed without --reassign-conflicting-patient-numbers on this evidence.");
process.exit(EXIT.OK);
