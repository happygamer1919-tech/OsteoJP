#!/usr/bin/env node
/**
 * DISTINCT MAPPING KEYS - the two vocabularies the mapping config has to cover,
 * read straight off a delivery, with nothing else printed.
 *
 * ==========================================================================
 * WHY THIS EXISTS
 * ==========================================================================
 * `mapping-config.template.json` lists five practitioner names and four service
 * types. THOSE ARE THE AMOSTRA'S, observed in a 1,000-row sample. The real
 * delivery is a decade of a clinic's diary and will carry names of people who
 * left years ago and service labels nobody remembers choosing.
 *
 * What happens to an absent key is NOT symmetrical, and that asymmetry is the
 * whole reason this runs BEFORE the config is filled:
 *
 *   AN UNMAPPED `terapeuta` REFUSES THE ENTIRE RUN. `appointments.practitioner_id`
 *     is NOT NULL, so the runner will not start until every name resolves. Found
 *     on import night that is a stop with the old system already retired; found
 *     here it is a legacy staff row created days earlier
 *     (scripts/import/legacy-staff-accounts.sql).
 *
 *   AN UNMAPPED `tipo_servico` IMPORTS WITHOUT A SERVICE and only warns.
 *     `appointments.service_id` is NULLABLE. So it does not stop anything - it
 *     quietly loses a fact about every appointment carrying that label, which is
 *     worse in a different way, and it is an OWNER decision rather than an
 *     engineering one.
 *
 * ==========================================================================
 * WHAT IT PRINTS, AND WHY THAT IS SAFE ON THE REAL DELIVERY
 * ==========================================================================
 * Two columns of `marcacoes.csv`: `terapeuta` and `tipo_servico`. Distinct
 * values, with the number of rows carrying each. NOTHING ELSE - no
 * `id_paciente`, no name, no date, no note, no row.
 *
 * `terapeuta` IS A STAFF NAME AND IT IS PRINTED DELIBERATELY. CLAUDE.md's
 * isolation rule is about PATIENT data; a therapist's professional name is
 * operational metadata, already ruled printable by MIG-03 - the runner's own
 * unmapped-key refusal names it with a row count, which is exactly this output.
 * The mapping cannot be filled without it.
 *
 * `tipo_servico` was ruled printable by the same reasoning in
 * `check-delivery.mjs`: it is the clinic's process vocabulary, and an unknown
 * value is useless to report without saying which value it was.
 *
 * IVAN RUNS THIS ON THE REAL DELIVERY. A terminal may run it on the August 2026
 * amostra only (CLAUDE.md, *Exemption, ruled 2026-08-26*).
 *
 * Usage:
 *   node scripts/import/distinct-keys.mjs <delivery-directory>
 * Exit:
 *   0  read it
 *   2  the directory or marcacoes.csv is missing or unreadable
 */

import fs from "node:fs";
import path from "node:path";

const EXIT = { OK: 0, FAILED: 1, BAD_INVOCATION: 2 };

/** NAME ONLY, NEVER THE MESSAGE - a read error can quote a path. */
const safeErr = (e) => `${e && e.name ? e.name : "Error"}${e && e.code ? ` code=${e.code}` : ""}`;

/* ---------------- CSV, the same state machine as check-delivery ----------- */

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

/* ---------------- the read ------------------------------------------------ */

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/import/distinct-keys.mjs <delivery-directory>");
  process.exit(EXIT.BAD_INVOCATION);
}

const file = path.join(dir, "marcacoes.csv");
let buf;
try {
  buf = fs.readFileSync(file);
} catch (e) {
  console.error(`marcacoes.csv: unreadable (${safeErr(e)})`);
  process.exit(EXIT.BAD_INVOCATION);
}

// Strip a UTF-8 BOM, exactly as check-delivery.mjs does: readFileSync leaves it
// in the string and it would otherwise become part of the first header name.
const body = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  ? buf.subarray(3)
  : buf;
const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
const grid = parseCsv(text, detectDelimiter(text));
if (grid.length === 0) {
  console.error("marcacoes.csv: empty");
  process.exit(EXIT.BAD_INVOCATION);
}

const headers = grid[0].map((h) => h.trim());
const idx = { terapeuta: headers.indexOf("terapeuta"), tipo_servico: headers.indexOf("tipo_servico") };
for (const [col, i] of Object.entries(idx)) {
  if (i === -1) {
    console.error(`marcacoes.csv: no ${col} column - headers are ${JSON.stringify(headers)}`);
    process.exit(EXIT.BAD_INVOCATION);
  }
}

const counts = { terapeuta: new Map(), tipo_servico: new Map() };
let rows = 0;
for (let r = 1; r < grid.length; r += 1) {
  const line = grid[r];
  // A trailing newline yields one empty row; it is not a data row.
  if (line.length === 1 && (line[0] ?? "").trim() === "") continue;
  rows += 1;
  for (const col of ["terapeuta", "tipo_servico"]) {
    const v = (line[idx[col]] ?? "").trim();
    // BLANK IS COUNTED SEPARATELY, not dropped. A blank terapeuta is a row the
    // adapter routes to to_review, and a config cannot fix it - it is a data
    // question. Silently omitting it would make the key list look complete.
    const key = v === "" ? "(blank)" : v;
    counts[col].set(key, (counts[col].get(key) ?? 0) + 1);
  }
}

/* ---------------- the output ---------------------------------------------- */

const print = (title, map, note) => {
  console.log("");
  console.log(`${title}  -  ${map.size} distinct`);
  console.log("-".repeat(title.length + 16));
  // BY DESCENDING ROW COUNT, then by value. The names carrying a decade of the
  // diary belong at the top: those are the ones whose absence from the roster
  // costs the most, and a config filled top-down covers the most rows first.
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const width = Math.max(...sorted.map(([k]) => k.length));
  for (const [k, n] of sorted) console.log(`  ${k.padEnd(width)}  ${String(n).padStart(6)} row(s)`);
  if (note) console.log(`  ${note}`);
};

console.log("FISIOZERO DELIVERY - DISTINCT MAPPING KEYS");
console.log("==========================================");
console.log("The two vocabularies mapping-config must cover. Values and row counts");
console.log("only - no id, no patient field, no row.");
console.log("");
console.log(`marcacoes.csv  ${rows} data row(s)`);

print(
  "terapeuta      (fills practitionerKeyByName)",
  counts.terapeuta,
  "EVERY value above must resolve. An unmapped terapeuta REFUSES the whole run:\n" +
    "  appointments.practitioner_id is NOT NULL. A name absent from the production\n" +
    "  roster needs a legacy row - scripts/import/legacy-staff-accounts.sql - BEFORE\n" +
    "  the config is filled.",
);

print(
  "tipo_servico   (fills serviceKeyByType)",
  counts.tipo_servico,
  "An unmapped tipo_servico does NOT stop the run: appointments.service_id is\n" +
    "  NULLABLE, so those rows import WITHOUT a service and the runner only notes it.\n" +
    "  That makes an absent value an OWNER decision, not an engineering one.",
);

console.log("");
console.log("Copy each value EXACTLY, accents included. The runner matches these strings");
console.log("byte for byte and a missing accent reads as a different, unmapped key.");
process.exit(EXIT.OK);
