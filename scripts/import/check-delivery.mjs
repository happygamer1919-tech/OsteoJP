#!/usr/bin/env node
/**
 * DELIVERY SANITY CHECKER - the acceptance gate for the Fisiozero export.
 *
 * This replaces caderno section 7 on the paid path: it is what decides whether
 * a delivery is CONFORMING, and a non-conforming one goes back to the vendor
 * with the clinic's read-only access to the old platform intact (caderno v1.1,
 * "Manutencao de acesso").
 *
 * ==========================================================================
 * IVAN RUNS THIS. NO TERMINAL EVER DOES.
 * ==========================================================================
 * CLAUDE.md, "Patient data isolation (Fisiozero import)". The output is
 * designed to be pasted back in full without being read first: counts, header
 * names, codes and - by explicit ruling - the `estado` and `tipo_servico`
 * VOCABULARY, which is operational metadata about the clinic's process rather
 * than anything about a person. An unknown status value is useless to report
 * without saying which value it was.
 *
 * NOTHING ELSE IS EVER PRINTED. Not an id, not a filename, not a row.
 *
 * Usage:
 *   node scripts/import/check-delivery.mjs <directory> [--zip <documentos.zip>]
 * Exit:
 *   0  accepted
 *   1  rejected, with a failure summary
 *   2  the directory is missing or unreadable
 */

import fs from "node:fs";
import path from "node:path";

const EXPECTED = {
  "pacientes.csv": [
    "id_paciente", "nome_completo", "numero_paciente", "data_nascimento", "sexo", "nif",
    "email", "telefone", "morada", "codigo_postal", "localidade", "clinica",
    "seguro_saude", "numero_apolice", "observacoes", "data_criacao", "FICHEIRO",
  ],
  "marcacoes.csv": [
    "id_paciente", "inicio", "fim", "terapeuta", "clinica", "tipo_servico", "estado", "observacoes",
  ],
  "documentos.csv": ["id_documento", "id_paciente", "ficheiro", "nome_original", "tipo_mime", "descricao"],
};
/** Every episode file must carry at least these; specialty columns vary. */
const EPISODE_COMMON = ["tipo", "id_paciente", "terapeuta", "data_avaliacao", "escala_eva", "FICHEIRO"];

/** The vocabulary the adapter knows. Anything else is reported BY VALUE. */
const KNOWN_ESTADO = new Set(["realizada", "falta", "marcada"]);

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const note = (m) => notes.push(m);

const safeErr = (e) =>
  `${e && e.name ? e.name : "Error"}${e && e.code ? ` code=${e.code}` : ""}`;

/* ---------------- CSV, the same state machine as the probe ---------------- */

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

/**
 * Read a CSV, refusing anything that is not valid UTF-8.
 *
 * NOT A STYLE CHECK. A cp1252 export decodes without throwing and silently
 * replaces every accented character, so `Joao` and `Setubal` arrive mangled and
 * the import "succeeds". Catching it here is the difference between a
 * re-delivery and 10,000 corrupted names.
 */
function readCsv(full, label) {
  let buf;
  try { buf = fs.readFileSync(full); } catch (e) { fail(`${label}: unreadable (${safeErr(e)})`); return null; }
  const body = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  if (text.includes("�")) {
    fail(`${label}: NOT valid UTF-8 - accented characters would import mangled`);
    return null;
  }
  const grid = parseCsv(text, detectDelimiter(text));
  if (grid.length === 0) { fail(`${label}: empty`); return null; }
  const headers = grid[0].map((h) => h.trim());
  const rows = grid.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows };
}

function checkHeaders(label, headers, expected) {
  const have = new Set(headers);
  const missing = expected.filter((h) => !have.has(h));
  if (missing.length > 0) fail(`${label}: missing column(s) ${JSON.stringify(missing)}`);
  const extra = headers.filter((h) => !expected.includes(h));
  // EXTRA columns are a NOTE and not a failure: the caderno lets the vendor
  // choose the extraction method, and more data than asked for is not a
  // non-conformance. Missing columns are.
  if (extra.length > 0) note(`${label}: ${extra.length} column(s) beyond the spec ${JSON.stringify(extra)}`);
}

/* ---------------- ZIP central directory, names never printed ---------------- */

function zipEntryNames(full) {
  const fd = fs.openSync(full, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(66_000, size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) return null;
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
      const z64Off = Number(tail.readBigUInt64LE(eocd - 20 + 8));
      const z64 = Buffer.alloc(56);
      fs.readSync(fd, z64, 0, 56, z64Off);
      if (z64.readUInt32LE(0) === 0x06064b50) {
        cdSize = Number(z64.readBigUInt64LE(40));
        cdOffset = Number(z64.readBigUInt64LE(48));
      }
    }
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const names = new Set();
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString("utf8");
      if (!name.endsWith("/")) names.add(name.split("/").pop());
      p = p + 46 + nameLen + extraLen + commentLen;
    }
    return names;
  } finally {
    fs.closeSync(fd);
  }
}

/* ---------------- main ---------------- */

function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  const zipIdx = args.indexOf("--zip");
  const zipPath = zipIdx !== -1 ? args[zipIdx + 1] : null;

  if (!dir) {
    console.error("usage: node scripts/import/check-delivery.mjs <directory> [--zip <documentos.zip>]");
    process.exit(2);
  }
  let st;
  try { st = fs.statSync(dir); } catch (e) {
    console.error(`cannot stat directory: ${safeErr(e)}`);
    process.exit(2);
  }
  if (!st.isDirectory()) { console.error("not a directory"); process.exit(2); }

  const names = fs.readdirSync(dir);
  const has = (n) => names.includes(n);

  /* -- pacientes: the spine. Everything else references it. -- */
  const patientIds = new Set();
  if (!has("pacientes.csv")) fail("pacientes.csv: absent");
  else {
    const pac = readCsv(path.join(dir, "pacientes.csv"), "pacientes.csv");
    if (pac) {
      checkHeaders("pacientes.csv", pac.headers, EXPECTED["pacientes.csv"]);
      let blank = 0, dupes = 0;
      for (const r of pac.rows) {
        const id = r["id_paciente"] ?? "";
        if (id === "") { blank += 1; continue; }
        if (patientIds.has(id)) dupes += 1;
        else patientIds.add(id);
      }
      if (blank > 0) fail(`pacientes.csv: ${blank} row(s) with an empty id_paciente`);
      // THE SINGLE MOST LOAD-BEARING REQUIREMENT in the caderno: without a
      // stable unique id_paciente the delivery is not reconstructable at all.
      if (dupes > 0) fail(`pacientes.csv: id_paciente is NOT unique - ${dupes} duplicate row(s)`);
      note(`pacientes.csv: ${pac.rows.length} row(s), ${patientIds.size} distinct id_paciente`);
    }
  }

  /* -- referential integrity, in one direction: every reference must land -- */
  const referencing = [
    ...(has("marcacoes.csv") ? [["marcacoes.csv", EXPECTED["marcacoes.csv"]]] : []),
    ...(has("documentos.csv") ? [["documentos.csv", EXPECTED["documentos.csv"]]] : []),
    ...names.filter((n) => /^Episodios[_-].+\.csv$/i.test(n)).map((n) => [n, EPISODE_COMMON]),
  ];
  if (!has("marcacoes.csv")) fail("marcacoes.csv: absent");
  if (!names.some((n) => /^Episodios[_-].+\.csv$/i.test(n))) note("no Episodios_<Especialidade>.csv present");

  const estadoCounts = new Map();
  const tipoUnknown = new Map();
  const ficheiroRefs = new Set();

  for (const [file, expected] of referencing) {
    const csv = readCsv(path.join(dir, file), file);
    if (!csv) continue;
    checkHeaders(file, csv.headers, expected);

    let orphans = 0;
    for (const r of csv.rows) {
      const pid = r["id_paciente"] ?? "";
      if (pid === "" || !patientIds.has(pid)) orphans += 1;
      if (r["estado"] !== undefined && r["estado"] !== "") {
        const k = r["estado"].toLowerCase();
        estadoCounts.set(k, (estadoCounts.get(k) ?? 0) + 1);
      }
      if (r["FICHEIRO"]) ficheiroRefs.add(r["FICHEIRO"]);
    }
    if (orphans > 0) {
      fail(`${file}: ${orphans} row(s) reference an id_paciente not present in pacientes.csv`);
    }
    note(`${file}: ${csv.rows.length} row(s)`);
  }

  /* -- documentos: ficheiro uniqueness + its own refs -- */
  if (has("documentos.csv")) {
    const doc = readCsv(path.join(dir, "documentos.csv"), "documentos.csv");
    if (doc) {
      const seen = new Set();
      let dupes = 0, blank = 0;
      for (const r of doc.rows) {
        const f = r["ficheiro"] ?? "";
        if (f === "") { blank += 1; continue; }
        if (seen.has(f)) dupes += 1; else seen.add(f);
        ficheiroRefs.add(f);
      }
      if (blank > 0) fail(`documentos.csv: ${blank} row(s) with an empty ficheiro`);
      if (dupes > 0) fail(`documentos.csv: ficheiro is NOT unique - ${dupes} duplicate value(s)`);
    }
  }

  /* -- estado vocabulary. VALUES are printed here, by ruling. -- */
  const unknownEstado = [...estadoCounts.entries()].filter(([k]) => !KNOWN_ESTADO.has(k));
  if (unknownEstado.length > 0) {
    fail(
      `estado: ${unknownEstado.length} value(s) outside the known list - ` +
        unknownEstado.map(([k, c]) => `${JSON.stringify(k)}=${c}`).join(", "),
    );
  }
  if (estadoCounts.size > 0) {
    note(`estado seen: ${[...estadoCounts.entries()].map(([k, c]) => `${k}=${c}`).join("  ")}`);
  }
  if (tipoUnknown.size > 0) {
    note(`tipo_servico unmapped: ${[...tipoUnknown.entries()].map(([k, c]) => `${k}=${c}`).join("  ")}`);
  }

  /* -- ZIP correspondence, BOTH directions -- */
  if (zipPath) {
    let entries = null;
    try { entries = zipEntryNames(zipPath); } catch (e) { fail(`zip: unreadable (${safeErr(e)})`); }
    if (entries === null) fail("zip: no central directory found");
    else {
      // BOTH DIRECTIONS, because they are different faults. A referenced file
      // that is absent is a BROKEN RECORD - a patient's document is simply
      // gone. An archived file nothing references is an ORPHAN - it may be the
      // document of a patient the export dropped, which is a completeness
      // failure the row counts alone would never show.
      let missing = 0;
      for (const f of ficheiroRefs) if (!entries.has(f)) missing += 1;
      let orphaned = 0;
      for (const e of entries) if (!ficheiroRefs.has(e)) orphaned += 1;
      if (missing > 0) fail(`zip: ${missing} referenced file(s) are NOT in the archive`);
      if (orphaned > 0) fail(`zip: ${orphaned} archived file(s) are referenced by no row`);
      note(`zip: ${entries.size} file entr(ies), ${ficheiroRefs.size} referenced name(s)`);
    }
  } else {
    note("zip: not supplied - correspondence NOT checked");
  }

  /* -- verdict -- */
  console.log("FISIOZERO DELIVERY CHECK");
  console.log("========================");
  for (const n of notes) console.log(`  note  ${n}`);
  console.log("");
  if (failures.length === 0) {
    console.log("ACCEPTED - no conformance failure found.");
    console.log("");
    console.log("This checks STRUCTURE and REFERENCES. It does not and cannot check");
    console.log("that the contents are correct or complete against the clinic's records.");
    process.exit(0);
  }
  console.log(`REJECTED - ${failures.length} conformance failure(s):`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}

main();
