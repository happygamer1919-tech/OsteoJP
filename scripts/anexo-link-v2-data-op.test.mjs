// anexo-link-v2-data-op.test.mjs - the ANEXO LINK v2 held data op: properties of its
// FILES, which is the half a machine can hold without a database. The behaviour is
// rehearsed on a throwaway and recorded in docs/data-op-anexo-link-v2.md.
//
// Nothing here asserts a production count, and nothing here may: the op's sets are
// derived at run time, so any number in this file would be a claim about data that
// moves.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const sha256 = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");

const F1 = "scripts/data/anexo-link-v2-1-read.sql";
const F2 = "scripts/data/anexo-link-v2-2-write.sql";
const F3 = "scripts/data/anexo-link-v2-3-verify.sql";
const GUARD = "scripts/assert-production-target.mjs";
const DOCF = "docs/data-op-anexo-link-v2.md";
const SIDEF = "docs/data-op-anexo-link-v2.sha256";
const OLDDOCF = "docs/data-op-anexo-link.md";
const S1 = read(F1);
const S2 = read(F2);
const S3 = read(F3);
const DOC = read(DOCF);
const STAFF11 = read("packages/db/scripts/staff-11-jp-one-clinic-check.mjs");
const FISIOZERO = read("packages/db/src/migration/sources/fisiozero.ts");
const PREFIX_TS = read("apps/web/lib/patients/imported-documents-path.ts");
const DOCUMENTS_TS = read("apps/web/lib/patients/documents.ts");
const SCHEMA_TS = read("packages/db/src/schema.ts");

/** SQL with line comments stripped, so a word in a comment never passes for code. */
const code = (s) => s.replace(/--.*$/gm, "");
/** A string made safe to sit inside a RegExp. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STAGES = [["stage 1", S1], ["stage 2", S2], ["stage 3", S3]];

/**
 * The text of `src` from the anchor `from` up to the first anchor `to` after it.
 * An anchor that is not found FAILS the test: an indexOf of -1 must never widen
 * the slice to the end of the file, or empty it so a doesNotMatch passes.
 */
function between(src, from, to, label = "a slice") {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${label}: the start anchor ${JSON.stringify(from)} is not found`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b >= 0, `${label}: the end anchor ${JSON.stringify(to)} is not found after ${JSON.stringify(from)}`);
  return src.slice(a, b);
}

/** The fenced block under the "## <heading>" whose text starts with `prefix`. */
function block(prefix, doc = DOC) {
  const lines = doc.split("\n");
  const at = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).startsWith(prefix));
  assert.ok(at >= 0, `no heading starting "${prefix}"`);
  const open = lines.findIndex((l, i) => i > at && l === "```");
  assert.ok(open > at, `no fenced block opens under the heading "${prefix}"`);
  const close = lines.findIndex((l, i) => i > open && l === "```");
  assert.ok(close > open, `the fenced block under "${prefix}" never closes`);
  return lines.slice(open + 1, close).join("\n");
}

const BEGIN = "-- >>> ANEXO LINK V2 SETS BEGIN";
const END = "-- <<< ANEXO LINK V2 SETS END";
function sets(sql, label) {
  const a = sql.indexOf(BEGIN);
  const b = sql.indexOf(END);
  assert.ok(a >= 0 && b > a, `${label} has no SETS block`);
  assert.equal(sql.indexOf(BEGIN, a + 1), -1, `${label} has two SETS blocks`);
  return sql.slice(a, b + END.length);
}
const SETS = sets(S1, "stage 1");

const LV = "de000002-0000-0000-0000-000000000001";
const CB = "de000002-0000-0000-0000-000000000002";
const ACTION = "attachment.anexo_link_v2.backfill";
const OLD_ACTION = "attachment.anexo_link.backfill";

test("a slice anchor that is not found fails the test: it never widens the slice to the end of the file or empties it", () => {
  assert.equal(between("a), lnk AS (x), excl AS (y", "), lnk AS (", "), excl AS (", "control"), "), lnk AS (x");
  assert.throws(() => between("a), lnk AS (x), excl AS (y", "), lnk AS (", "), car AS (", "control"), /the end anchor/, "a missing end anchor widened the slice");
  assert.throws(() => between("a), lnk AS (x), excl AS (y", "), cls AS (", "), excl AS (", "control"), /the start anchor/, "a missing start anchor emptied or shifted the slice");
  assert.throws(() => between("excl then lnk", "lnk", "excl", "control"), /the end anchor/, "an end anchor found only before the start was used");
});

/* ---- the ids: two clinic rows, and no other production id ---------------- */

test("the clinic ids are STAFF-11's, and they are the only ids any stage or the document's blocks carry", () => {
  const pick = (name) => STAFF11.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
  assert.equal(pick("LV"), LV, "the Linda-a-Velha id differs from the STAFF-11 check");
  assert.equal(pick("CB"), CB, "the Castelo Branco id differs from the STAFF-11 check");
  for (const [label, text] of [["the SETS block", SETS], ["the doc", DOC]]) {
    assert.ok(text.includes(LV) && text.includes(CB), `a clinic id is missing from ${label}`);
  }
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  for (const [label, text] of [...STAGES, ["the stage blocks", [0, 1, 2, 3].map((n) => block(`STAGE ${n}`)).join("\n")]]) {
    const found = new Set(text.match(UUID) ?? []);
    for (const id of found) assert.ok([LV, CB].includes(id), `${label} carries the id ${id}, which is not a clinic id already on main`);
  }
});

/* ---- what each stage may write ------------------------------------------- */

const ANY_WRITE = /\b(insert\s+into|update\s+[a-z_.]+(\s+[a-z_]+)?\s+set|delete\s+from|truncate|alter\s+table|drop\s+|create\s+(table|function|trigger|index|view|policy))/i;

test("stage 1 and stage 3 write nothing, and each runs in a READ ONLY transaction it rolls back", () => {
  for (const [label, sql] of [["stage 1", S1], ["stage 3", S3]]) {
    assert.doesNotMatch(lexSql(sql).code, ANY_WRITE, `${label} contains a write statement`);
    assert.match(code(sql), /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;/, `${label} is not READ ONLY`);
    assert.match(code(sql), /\nROLLBACK;\n/, `${label} does not roll back`);
    assert.doesNotMatch(code(sql), /\bCOMMIT\b/, `${label} commits`);
  }
});

/**
 * The columns every UPDATE in lexed SQL sets, as [table, [target, ...]]. The SET
 * list is read to its end: until FROM, WHERE or RETURNING at depth 0, a closing
 * parenthesis that ends a CTE, or the statement's semicolon, and split on the
 * commas at depth 0. So a second column on a continuation line, or a row
 * constructor SET (a, b) = (...), is seen, and a subquery inside a value neither
 * ends the list nor splits it. Strings are already blanked by lexSql.
 */
function updateTargets(lexed) {
  const out = [];
  for (const m of lexed.matchAll(/\bupdate\s+([a-z_.]+)(?:\s+(?!set\b)[a-z_]+)?\s+set\b/gi)) {
    const parts = [];
    let cur = "";
    for (let i = m.index + m[0].length, depth = 0; i < lexed.length; i++) {
      const ch = lexed[i];
      if (depth === 0 && (ch === ";" || (/^(from|where|returning)\b/i.test(lexed.slice(i, i + 10)) && /[^A-Za-z0-9_]/.test(lexed[i - 1])))) break;
      if (ch === "(") depth++;
      else if (ch === ")" && depth-- === 0) break;
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
      cur += ch;
    }
    parts.push(cur);
    out.push([m[1].toLowerCase(), parts.map((p) => p.split("=")[0].replace(/\s+/g, " ").trim().toLowerCase())]);
  }
  return out;
}

test("stage 2's writes are exactly the whitelist: one column of attachments and one audit row", () => {
  // The SET reader, on the shapes it must read right both ways, first.
  const targets = (sql) => updateTargets(lexSql(sql).code);
  assert.deepEqual(targets("UPDATE public.a SET x = t.r\n    FROM (SELECT 1 AS r) t WHERE true;\n"), [["public.a", ["x"]]], "the SET reader misreads one column");
  assert.deepEqual(targets("UPDATE public.a SET x = t.r\n    , y = 'x, z = 1'\n    FROM t;\n"), [["public.a", ["x", "y"]]], "a second column on a continuation line is missed, or a comma in a string splits the list");
  assert.deepEqual(targets("UPDATE public.a SET (x, y) = (1, 2) WHERE true;\n"), [["public.a", ["(x, y)"]]], "a row-constructor SET reads as one column");
  assert.deepEqual(targets("UPDATE public.a SET x = (SELECT b.v FROM b WHERE b.k = 1), y = 2 WHERE true;\n"), [["public.a", ["x", "y"]]], "a subquery inside a value cut the SET list short");
  assert.deepEqual(targets("WITH u AS (UPDATE public.a a SET x = 1 RETURNING 1) SELECT 1;\n"), [["public.a", ["x"]]], "an aliased UPDATE inside a CTE is missed");
  const lexed = lexSql(S2).code;
  assert.deepEqual(updateTargets(lexed), [["public.attachments", ["clinical_record_id"]]], "stage 2 sets something besides attachments.clinical_record_id");
  const found = [...lexed.matchAll(/\b(update\s+public\.[a-z_]+\s+set\s+[a-z_0-9]+|delete\s+from\s+public\.[a-z_]+|insert\s+into\s+public\.[a-z_]+)/gi)]
    .map((m) => m[1].replace(/\s+/g, " ").toLowerCase());
  assert.deepEqual(found, ["update public.attachments set clinical_record_id", "insert into public.audit_log"]);
  const everyWrite = [...lexed.matchAll(new RegExp(ANY_WRITE.source, "gi"))];
  assert.equal(everyWrite.length, found.length, `stage 2 has a write outside the whitelist: ${everyWrite.map((m) => m[0]).join(" | ")}`);
  for (const t of ["clinical_records", "clinical_episodes", "migration_staging_rows", "consultations", "patients"]) {
    assert.doesNotMatch(lexed, new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+public\\.${t}\\b`, "i"), `stage 2 writes ${t}`);
  }
});

test("the write sets one column on the link set only, each row still unlinked and not soft deleted, and is followed by its ROW_COUNT", () => {
  const c = code(S2);
  const w = between(c, "UPDATE public.attachments SET", "GET DIAGNOSTICS v_n = ROW_COUNT;", "the write");
  const from = w.search(/\n\s+FROM \(SELECT \(e ->> 'a'\)::uuid AS a, /);
  assert.ok(from > 0, "the write does not read its pairs FROM the link set");
  assert.equal(w.slice(0, from).replace(/\s+/g, " "), "UPDATE public.attachments SET clinical_record_id = t.r", "the write sets something besides clinical_record_id: its whole SET list, continuation lines included, is not that one column");
  for (const guard of ["attachments.id = t.a", "attachments.tenant_id = v_tenant", "attachments.clinical_record_id IS NULL", "attachments.deleted_at IS NULL"]) {
    assert.ok(w.includes(guard), `the write does not re-check ${guard}`);
  }
  assert.match(c, /GET DIAGNOSTICS v_n = ROW_COUNT;\n\s+IF v_n <> cardinality\(v_att\) THEN\n\s+RAISE EXCEPTION 'STOP: W1 linked/, "the write's ROW_COUNT is not asserted exactly");
  const writes = [...c.matchAll(/\b(UPDATE public\.|DELETE FROM public\.|INSERT INTO public\.)/g)].map((m) => m.index);
  writes.forEach((at, i) => {
    const next = writes[i + 1] ?? c.length;
    const diag = c.indexOf("GET DIAGNOSTICS v_n = ROW_COUNT;", at);
    assert.ok(diag > at && diag < next, `write ${i + 1} is not followed by its ROW_COUNT before the next write`);
  });
});

test("stage 2 is ONE DO block inside ONE REPEATABLE READ transaction, and every refusal is raised before the write", () => {
  assert.equal((S2.match(/\bDO \$/g) ?? []).length, 1, "stage 2 is not exactly one DO block");
  assert.equal((S2.match(/^END \$anexo2\$;$/gm) ?? []).length, 1);
  const c = code(S2);
  const begin = c.indexOf("BEGIN ISOLATION LEVEL REPEATABLE READ;");
  const doAt = c.indexOf("DO $anexo2$");
  const commit = c.indexOf("\nCOMMIT;\n");
  assert.ok(begin >= 0 && begin < doAt && doAt < commit, "the DO block is not between BEGIN and COMMIT");
  for (const s of [S1, S3]) assert.equal((s.match(/\bDO \$/g) ?? []).length, 0);
  const write = c.indexOf("UPDATE public.attachments SET");
  for (const step of ["RAISE EXCEPTION 'STOP: % refuses", "RAISE EXCEPTION 'STOP: carry % reads", "RAISE EXCEPTION 'STOP: P4 found a trigger", "RAISE EXCEPTION 'STOP: the md5 family % is empty"]) {
    const at = c.indexOf(step);
    assert.ok(at > doAt && at < write, `${step.slice(17, 50)} is not raised before the write`);
  }
});

/* ---- no DELETE, DROP or TRUNCATE: read by a lexer, not by a substring ---- */

/**
 * The SQL a stage file hands the server, lexed the way psql and Postgres read
 * it. Line and block comments and every quoted literal (E-strings with their
 * backslash escapes, and quoted identifiers) are blanked; a psql meta-command
 * line is collected apart, because psql, not the server, runs it; and a
 * dollar-quoted body is kept as CODE and lexed again, because in these files it
 * is a DO block the server executes. So a word in a comment or a string can
 * neither fake nor break a check on the code, and a statement inside the DO
 * body or inside a CTE is still seen. Newlines are kept, so positions hold.
 */
function lexSql(src, top = true) {
  let out = "";
  const metas = [];
  const blank = (t) => t.replace(/[^\n]/g, " ");
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (top && c === "\\") {
      const e = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
      metas.push(src.slice(i + 1, e).match(/^[A-Za-z!?]*/)[0]);
      out += blank(src.slice(i, e));
      i = e;
      continue;
    }
    if (src.startsWith("--", i)) {
      const e = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
      out += blank(src.slice(i, e));
      i = e;
      continue;
    }
    if (src.startsWith("/*", i)) {
      let depth = 0;
      let j = i;
      do {
        if (src.startsWith("/*", j)) { depth++; j += 2; } else if (src.startsWith("*/", j)) { depth--; j += 2; } else j++;
      } while (depth > 0 && j < src.length);
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const eString = c === "'" && /(^|[^A-Za-z0-9_])[Ee]$/.test(out);
      let j = i + 1;
      while (j < src.length) {
        if (eString && src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      out += blank(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    const dollar = c === "$" && !/[A-Za-z0-9_]$/.test(out) ? src.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/) : null;
    if (dollar) {
      const tag = dollar[0];
      const close = src.indexOf(tag, i + tag.length);
      assert.ok(close > 0, "an unclosed dollar quote");
      const inner = lexSql(src.slice(i + tag.length, close), false);
      out += blank(tag) + inner.code + blank(tag);
      metas.push(...inner.metas);
      i = close + tag.length;
      continue;
    }
    out += c;
    i++;
  }
  return { code: out, metas };
}
const FORBIDDEN = /\b(DELETE|DROP|TRUNCATE)\b/i;

/**
 * `text` cut at its top-level commas, outside every parenthesis, string and
 * comment, each part with its line comments dropped and its whitespace folded to
 * one space. The cut points are read on the lexed text, whose strings and
 * comments are blanked at the same positions, so a comma inside a label, a
 * literal or a subquery never cuts.
 */
function splitTop(text) {
  const lexed = lexSql(text, false).code;
  const parts = [];
  let from = 0;
  for (let i = 0, depth = 0; i < lexed.length; i++) {
    if (lexed[i] === "(") depth++;
    else if (lexed[i] === ")") depth--;
    else if (lexed[i] === "," && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts.map((p) => code(p).replace(/\s+/g, " ").trim());
}

test("no stage file carries a DELETE, DROP or TRUNCATE statement: the SQL is lexed, so a comment or a string can neither hide nor fake one", () => {
  // The lexer, on the shapes it must read right both ways, first.
  const seen = (sql) => FORBIDDEN.test(lexSql(sql).code);
  assert.equal(seen("-- DELETE FROM public.attachments\nSELECT 1;\n"), false, "a line comment reads as a statement");
  assert.equal(seen("/* DROP /* nested */ TABLE x */ SELECT 'TRUNCATE x', E'it''s \\' DELETE', \"drop\";\n"), false, "a string, a quoted name or a block comment reads as a statement");
  assert.equal(seen("\\echo 'DELETE FROM x'\nSELECT 1;\n"), false, "a psql echo reads as a statement");
  assert.equal(seen("DO $b$\nBEGIN\n  DELETE FROM public.attachments WHERE false;\nEND $b$;\n"), true, "a DELETE inside a DO body is missed");
  assert.equal(seen("WITH d AS (DELETE FROM public.attachments RETURNING id) SELECT 1;\n"), true, "a DELETE inside a CTE is missed");
  assert.equal(seen("SELECT 1; truncate public.attachments;\n"), true, "a lower-case TRUNCATE is missed");
  assert.equal(seen("SELECT 'a'; DROP TABLE x; -- 'b'\n"), true, "a DROP between two strings is missed");
  assert.equal(seen("SELECT E' \\t\\u00a0'; DELETE FROM x;\n"), true, "a DELETE after an E-string of escapes is missed");
  for (const [label, sql] of STAGES) {
    const { code: c, metas } = lexSql(sql);
    for (const st of c.split(";")) {
      assert.doesNotMatch(st, FORBIDDEN, `${label} carries a ${st.match(FORBIDDEN)?.[1]} statement: ${st.replace(/\s+/g, " ").trim().slice(0, 120)}`);
    }
    // A string the server runs (EXECUTE) or a result psql runs as SQL (\gexec, \i) would carry a
    // statement past the lexer, so neither is allowed, and psql runs only these four commands.
    assert.doesNotMatch(c, /\bEXECUTE\b/i, `${label} runs dynamic SQL`);
    for (const m of metas) assert.ok(["pset", "timing", "echo", "gset"].includes(m), `${label} runs the psql command \\${m}`);
    assert.ok(metas.includes("echo"), `${label}: the lexer collected no psql command at all, so it read nothing`);
  }
});

/* ---- the sets, the read of a FICHEIRO cell, and the classes -------------- */

test("stage 1 and stage 2 compute every set with the SAME bytes", () => {
  assert.equal(sets(S2, "stage 2"), SETS, "the SETS block drifted between stage 1 and stage 2");
});

/** The characters an SQL E-string literal spells, escapes decoded. */
function decodeE(lit) {
  return lit.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,2}|[tnrfb\\'])/g, (_, e) => {
    if (e[0] === "u") return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { t: "\t", n: "\n", r: "\r", f: "\f", b: "\b", "\\": "\\", "'": "'" }[e];
  });
}

test("a FICHEIRO cell is cut exactly as the importer cuts it: split on a comma or a semicolon, then JavaScript's trim, over the whole BMP", () => {
  // The importer's own rule, read from its source.
  const fn = between(FISIOZERO, "export function splitDeliveryFileNames(raw: string): string[] {", "\n}\n", "splitDeliveryFileNames");
  assert.match(fn, /\.split\(\/\[,;\]\/\)\s*\.map\(\(p\) => p\.trim\(\)\)\s*\.filter\(\(p\) => p !== ""\)/, "the importer's split changed; this op must change with it");
  // The op's ws set equals what String.prototype.trim strips, code point for code point.
  const lit = SETS.match(/^\s+E'([^']*)' AS ws$/m)?.[1];
  assert.ok(lit, "the SETS block does not define ws as one E-string");
  const ws = new Set(decodeE(lit));
  const jsTrimmed = new Set();
  for (let cp = 0; cp <= 0xffff; cp++) {
    const ch = String.fromCharCode(cp);
    if ((" " + ch + " ").trim() === "" && ch.trim() === "") jsTrimmed.add(ch);
  }
  const hex = (s) => [...s].map((c) => c.charCodeAt(0).toString(16)).sort().join(" ");
  assert.equal(hex([...ws].join("")), hex([...jsTrimmed].join("")), "the ws set is not exactly what JavaScript's trim strips");
  // The same split and trim, in ONE place, read the real cells and the synthetic one.
  const split = between(SETS, "\nsplit AS (", "\nnamed AS (", "the split CTE");
  assert.equal((split.match(/btrim\(p\.part, k\.ws\)/g) ?? []).length, 2, "the split does not trim with ws in both its output and its filter");
  assert.match(split, /CROSS JOIN LATERAL regexp_split_to_table\(c\.cell, '\[,;\]'\) AS p\(part\)/, "the split is not on a comma or a semicolon");
  assert.doesNotMatch(SETS, /btrim\([^,()]*\)/, "a btrim with the default set is back in the SETS block");
  const cells = between(SETS, "\ncells AS (", "\nsplit AS (", "the cells CTE");
  const synthetic = cells.match(/SELECT 'control', [^\n]*\n\s+E'([^']*)'\n/)?.[1];
  assert.ok(synthetic, "the synthetic cell is not in the cells CTE");
  const cut = decodeE(synthetic).split(/[,;]/).map((p) => p.trim()).filter((p) => p !== "");
  assert.deepEqual(cut, ["a.pdf", "b.pdf", "c.pdf"], "the importer's own rule does not cut the synthetic cell into the three names R11 expects");
  for (const ch of ["\u00a0", "\t", "\u3000"]) assert.ok(decodeE(synthetic).includes(ch), `the synthetic cell lacks U+${ch.charCodeAt(0).toString(16)}, which btrim's default leaves`);
  assert.ok(decodeE(synthetic).includes(",") && decodeE(synthetic).includes(";"), "the synthetic cell does not carry both separators");
  const r11 = between(SETS, "'R11'", "'R12'", "R11");
  assert.match(r11, /EXCEPT ALL SELECT unnest\(ARRAY\['a\.pdf', 'b\.pdf', 'c\.pdf'\]\)/, "R11 does not count a name the read got that it should not have");
  assert.match(r11, /EXCEPT ALL SELECT sp\.file_name FROM split sp WHERE sp\.src = 'control'/, "R11 does not count a name the read missed");
  assert.match(r11, /\(SELECT count\(\*\) FROM split sp WHERE sp\.src = 'control'\)::int$/m, "R11's control is not the names read from the synthetic cell");
});

test("the Storage path is the importer's, and the imported prefix every stage reads is the one Documentos reads", () => {
  assert.match(FISIOZERO, /export const attachmentStoragePath = \(tenantId: string, fileName: string\): string =>\n\s+`\$\{tenantId\}\/migration\/fisiozero\/\$\{fileName\}`;/, "the importer's Storage path changed");
  assert.match(PREFIX_TS, /return `\$\{tenantId\}\/migration\/fisiozero\/`;/, "the Documentos prefix changed");
  assert.match(DOCUMENTS_TS, /like\(attachments\.storagePath, `\$\{importedDocumentPrefix\(tenantId\)\}%`\)/, "Documentos no longer keeps a linked imported original");
  assert.ok(SETS.includes("sp.tenant_id::text || '/migration/fisiozero/' || sp.file_name AS storage_path"), "the SETS block names a document by another path");
  for (const [label, sql] of [["stage 2", S2], ["stage 3", S3]]) {
    const likes = code(sql).match(/storage_path LIKE [^\n]*/g) ?? [];
    assert.ok(likes.length > 0, `${label} reads no imported prefix`);
    for (const l of likes) assert.match(l, /^storage_path LIKE a\.tenant_id::text \|\| '\/migration\/fisiozero\/%'/, `${label} reads another prefix: ${l}`);
  }
});

test("the ruled scope is the original op's: an imported registo's staging row names the file, and the three ruled refusals stand", () => {
  const OLD2 = read("scripts/data/anexo-link-2-apply.sql");
  for (const cond of ["entity_type = 'clinical_record'", "status = 'imported'", "imported_entity_id IS NOT NULL"]) {
    assert.ok(OLD2.toLowerCase().includes(`s.${cond}`.toLowerCase()), `the original op no longer reads ${cond}; this test's premise moved`);
    assert.ok(between(SETS, "\ncells AS (", "\nsplit AS (", "cells").includes(`s.${cond}`), `the v2 scope drops ${cond}`);
  }
  assert.ok(SETS.includes("coalesce(s.raw ->> 'FICHEIRO', '')"), "the v2 op reads another cell");
  assert.doesNotMatch(between(SETS, "\ncells AS (", "\nsplit AS (", "cells"), /source_system\s*=/, "the v2 scope narrows the source system, which the ruling does not");
  const ref = (c) => between(SETS, `'${c}'`, `'R${String(Number(c.slice(1)) + 1).padStart(2, "0")}'`, c);
  assert.match(ref("R04"), /HAVING count\(DISTINCT l\.record_id\) > 1/, "R04 no longer refuses a document named by two registos");
  assert.match(ref("R06"), /l\.att_patient IS DISTINCT FROM l\.cr_patient/, "R06 no longer refuses a patient mismatch, NULL-safe");
  assert.match(ref("R07"), /l\.cr_status IS DISTINCT FROM 'locked'/, "R07 no longer refuses a target registo that is not locked");
});

test("the classes are seven, each its own predicate; only a live, unlinked document of the tenant is linked, and UNCLASSIFIED refuses", () => {
  const cls0 = between(SETS, "\ncls0 AS (", "\ncls AS (", "cls0");
  const flags = [...cls0.matchAll(/\) AS (f_[a-z]+),?\n|p\.other_tenant AS (f_other),\n/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(flags, ["f_other", "f_noreg", "f_nodoc", "f_here", "f_else", "f_del", "f_link"], "the class predicates moved");
  const link = cls0.slice(cls0.indexOf("(NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NOT NULL\n            AND p.att_record IS NULL AND p.att_deleted IS NULL) AS f_link"));
  assert.ok(link.length > 0 && link.startsWith("(NOT p.other_tenant"), "the link class is not: this tenant, a registo, a document, unlinked and not soft deleted");
  const del = "(NOT p.other_tenant AND p.cr_id IS NOT NULL AND p.attachment_id IS NOT NULL\n            AND p.att_record IS NULL AND p.att_deleted IS NOT NULL) AS f_del";
  assert.ok(cls0.includes(del), "a soft-deleted document is no longer its own class");
  assert.match(between(SETS, "\nlnk AS (", "\nexcl AS (", "lnk"), /FROM cls c\n\s+WHERE c\.f_link\n/, "the link set reads more than the link class");
  const r10 = between(SETS, "'R10'", "'R11'", "R10");
  for (const f of [...flags, "f_unc"]) assert.ok(r10.includes(`c.${f}::int`), `R10 does not count ${f}`);
  assert.match(r10, /\) <> 1\)::int,/, "R10 does not refuse a pair outside exactly one class");
  assert.match(between(SETS, "\npair AS (", "\ncls0 AS (", "pair"), /SELECT DISTINCT /, "the pairs are not DISTINCT, so a cell naming one file twice would link it twice");
  assert.match(SETS, /\(n\.tenant_id IS DISTINCT FROM k\.tenant\) AS other_tenant/, "another tenant is not its own class");
  assert.match(SETS, /\(SELECT l\.tenant_id FROM public\.locations l\n\s+WHERE l\.id = 'de000002-0000-0000-0000-000000000001'::uuid\) AS tenant/, "the tenant is not the Linda-a-Velha row's");
});

test("every named document outside the link set is left alone AND watched: excl is the complement of the link class, stage 1 lists the same pairs, stage 2 records it and verdict 10 reads it back", () => {
  const excl = code(between(SETS, "\nexcl AS (", "\ncar AS (", "excl"));
  assert.match(excl, /\n\s+FROM cls c\n\s+WHERE NOT c\.f_link AND c\.attachment_id IS NOT NULL\n\s+AND c\.attachment_id NOT IN \(SELECT l\.attachment_id FROM lnk l\)\n\)/, "excl is not every named document outside the link set, whatever its class");
  assert.doesNotMatch(excl, /c\.f_(other|noreg|nodoc|here|else|del|unc)\b/, "excl names classes one by one, so a class that names a document can drop out of it");
  assert.match(S1, /\n\s+FROM cls c WHERE NOT c\.f_link\),\n/, "stage 1 section 2d does not list every pair outside the link class");
  assert.ok(S2.includes("coalesce((SELECT array_agg(DISTINCT x.attachment_id ORDER BY x.attachment_id) FROM excl x), '{}'::uuid[])"), "stage 2 does not record every left-alone document");
  assert.ok(S2.includes("'excluded_ids', to_jsonb(v_excl_ids)"), "the audit row does not carry the left-alone ids");
  assert.match(S3, /\bex AS \(\n\s+SELECT \(x\.v\)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text\(al\.m -> 'excluded_ids'\) x\(v\)\n/, "verdict 10 does not read the left-alone ids back");
});

test("a trigger the system did not create refuses, on exactly the tables stage 2 writes, in stage 1 and again in P4", () => {
  const tables = "'public.attachments'::regclass, 'public.audit_log'::regclass";
  const r12 = between(SETS, "'R12'", END, "R12");
  assert.equal(r12.split(tables).length - 1, 2, "R12 does not read exactly the tables stage 2 writes, for n and for control");
  assert.match(r12, /AND NOT t\.tgisinternal\)::int,/, "R12 counts the system's own triggers");
  // P4 is read AFTER the SETS block: R12 inside it reads the same catalog, so a slice
  // from the file's first read of pg_trigger would be R12's and could never fail on P4.
  const afterSets = code(S2.slice(S2.indexOf(END) + END.length));
  assert.equal(afterSets.split("FROM pg_catalog.pg_trigger t").length - 1, 1, "stage 2 reads the trigger catalog more than once after its SETS afterSets, so this test cannot tell which read is P4");
  const p4 = between(afterSets, "SELECT string_agg(t.tgrelid::regclass::text", "END IF;", "P4");
  assert.match(p4, new RegExp(`\\n\\s+INTO v_want\\n\\s+FROM pg_catalog\\.pg_trigger t\\n\\s+WHERE t\\.tgrelid IN \\(${esc(tables)}\\)\\n\\s+AND NOT t\\.tgisinternal;\\n`), "P4 does not read exactly R12's catalog: every trigger the system did not create, on exactly the tables stage 2 writes");
  assert.match(p4, /\n\s+RAISE NOTICE 'P4 [^\n]*\n\s+IF v_want IS NOT NULL THEN\n\s+RAISE EXCEPTION 'STOP: P4 found a trigger the system did not create/, "P4 does not stop on every trigger it finds");
  assert.ok(afterSets.indexOf("SELECT string_agg(t.tgrelid::regclass::text") < afterSets.indexOf("UPDATE public.attachments SET"), "P4 does not read the catalog before the write");
});

test("a named file to link that resolves to more than one live document row refuses (R05), whether the other row is linked or not, and a soft-deleted row does not count", () => {
  const r05 = between(SETS, "'R05'", "'R06'", "R05");
  assert.match(r05, /\(SELECT count\(\*\) FROM \(SELECT c\.storage_path FROM cls c\n\s+WHERE c\.storage_path IN \(SELECT l\.storage_path FROM lnk l\)\n\s+AND c\.attachment_id IS NOT NULL AND c\.att_deleted IS NULL\n\s+GROUP BY c\.storage_path\n\s+HAVING count\(DISTINCT c\.attachment_id\) > 1\) x\)::int,\n/, "R05 does not count every live document row, linked or not, at a path the link set would link");
  assert.match(r05, /\n\s+\(SELECT count\(DISTINCT l\.storage_path\) FROM lnk l\)::int\n/, "R05's control is not the paths the link set would link");
  for (const [label, text] of [["D2", DOC.match(/^\| D2 \| [^\n]*$/m)?.[0]], ["the refusal table", DOC.match(/^\| R05 \| [^\n]*$/m)?.[0]]]) {
    assert.ok(text, `the doc has no ${label} row`);
    assert.match(text, /more than one live document row/, `the doc's ${label} row does not state the rule R05 enforces`);
    assert.match(text, /soft-deleted row/, `the doc's ${label} row does not say a soft-deleted row does not count`);
  }
});

/* ---- the md5 families and the audit row ---------------------------------- */

const W_FIXED = "string_agg(ROW(a.id, a.tenant_id, a.patient_id, a.storage_path, a.file_name, a.mime_type,";

/** Every column of `attachments`, from the drizzle schema. */
function schemaColumns() {
  const t = between(SCHEMA_TS, 'export const attachments = pgTable(\n  "attachments",', "\n  (t) => [", "the attachments table in schema.ts");
  return [...t.matchAll(/^\s+[a-zA-Z]+: [a-z]+\("([a-z_]+)"/gm)].map((m) => m[1]).sort();
}
/** Every column of `attachments`, from the migrations: the CREATE TABLE plus every ADD COLUMN. */
function migrationColumns() {
  const dir = join(ROOT, "packages/db/migrations");
  const cols = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    const create = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?"?(?:public"?\.)?"?attachments"? \(([\s\S]*?)\n\);/);
    if (create) for (const m of create[1].matchAll(/^\s+"([a-z_]+)" /gm)) cols.add(m[1]);
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?"?(?:public"?\.)?"?attachments"?\s+ADD COLUMN (?:IF NOT EXISTS )?"?([a-z_]+)"?/gi)) cols.add(m[1]);
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?"?(?:public"?\.)?"?attachments"?\s+DROP COLUMN (?:IF EXISTS )?"?([a-z_]+)"?/gi)) cols.delete(m[1]);
  }
  return [...cols].sort();
}

test("the written-row fingerprint covers EVERY attachments column the op does not write, from schema.ts and the migrations, in stage 2 and stage 3 alike", () => {
  const fromSchema = schemaColumns();
  const fromMigrations = migrationColumns();
  assert.ok(fromSchema.length > 5, "schema.ts yielded no attachments columns, so this read nothing");
  assert.deepEqual(fromSchema, fromMigrations, "schema.ts and the migrations disagree on the attachments columns");
  const want = fromSchema.filter((c) => c !== "clinical_record_id");
  for (const [label, sql, n] of [["stage 2", S2, 2], ["stage 3", S3, 1]]) {
    const rows = [...sql.matchAll(/string_agg\(ROW\((a\.id, a\.tenant_id, a\.patient_id,[\s\S]*?)\)::text/g)].map((m) => m[1]);
    assert.equal(rows.length, n, `${label} carries ${rows.length} written-row fingerprints, not ${n}`);
    for (const r of rows) {
      const cols = r.split(",").map((x) => x.trim().replace(/^a\./, "")).sort();
      assert.deepEqual(cols, [...want].sort(), `${label}'s fingerprint is not every column but clinical_record_id`);
    }
  }
});

const FAMILIES = ["w_fixed", "att_rest", "excl", "cr_all", "cr_t", "ep_all", "ep_t", "stg", "cons"];
const GUARANTEED = ["w_fixed", "cr_t", "cr_all", "stg"];

test("every md5 family stage 2 compares is in the audit row with its row count, is compared after the write, and a guaranteed family stops when empty", () => {
  const rows = between(S2, "v_md5_rows := jsonb_build_object(", ");", "v_md5_rows");
  const md5 = between(S2, "'md5', jsonb_build_object(", "),\n    'md5_rows'", "the md5 object");
  for (const f of FAMILIES) {
    assert.ok(rows.includes(`'${f}', v_bn_${f}`), `the family ${f} has no row count in the audit row`);
    assert.ok(md5.includes(`'${f}', v_b_md5_${f}`), `the family ${f} has no md5 in the audit row`);
    const after = S2.indexOf("IS DISTINCT FROM v_b_md5_" + f, S2.indexOf("UPDATE public.attachments SET"));
    assert.ok(after > 0, `the family ${f} is not compared after the write`);
  }
  assert.equal([...rows.matchAll(/'([a-z_]+)', v_bn_/g)].length, FAMILIES.length, "the audit row counts a family this test does not know");
  const stop = between(S2, "FOR v_row IN SELECT e.key FROM jsonb_each_text(v_md5_rows) e", "END LOOP;", "the empty-family stop");
  assert.ok(stop.includes(`WHERE e.key IN (${GUARANTEED.map((f) => `'${f}'`).join(", ")})`), "the families a refusal guarantees do not stop when empty");
  assert.match(stop, /RAISE EXCEPTION 'STOP: the md5 family % is empty/);
  for (const t of ["public.clinical_records cr;", "public.clinical_episodes ep;", "public.migration_staging_rows s;", "public.consultations co;"]) {
    assert.ok(S2.includes(`FROM ${t}`), `stage 2 does not compare every row of ${t.split(" ")[0]}`);
  }
  assert.match(S2, /FROM public\.attachments a WHERE NOT \(a\.id = ANY\(v_att\)\);/, "stage 2 does not compare every other attachment, every tenant");
});

test("the exact deltas: the total holds, linked and unlinked move by exactly the link set, and no document loses its patient", () => {
  const a = between(code(S2), "SELECT count(*)::int INTO v_a_total", "RAISE NOTICE 'A the deltas", "section A");
  assert.match(a, /IF v_a_total <> v_b_total THEN/);
  assert.match(a, /IF v_a_linked <> v_b_linked \+ cardinality\(v_att\) OR v_a_unlinked <> v_b_unlinked - cardinality\(v_att\) THEN/);
  assert.match(a, /IF v_a_with_patient <> v_b_with_patient THEN/);
  assert.match(a, /IF v_digest IS DISTINCT FROM \(v_car ->> 'anexo_v2_digest'\) THEN/, "the rows as written are not held to the carried digest");
});

test("every check stage 2 makes after the write is armed: each document carries the registo that named it, patients match, registos stay locked, no other original gained a registo, and the audit row is written once, at this transaction's time", () => {
  const c = code(S2);
  const write = c.indexOf("UPDATE public.attachments SET");
  const insert = c.indexOf("INSERT INTO public.audit_log");
  const done = c.indexOf("RAISE NOTICE 'ANEXO LINK V2 STAGE 2 DONE");
  assert.ok(write > 0 && write < insert && insert < done, "the write, the audit insert and the DONE line are not in that order");
  const after = c.slice(write, insert);
  const audit = c.slice(insert, done);
  const armed = (src, re, what) => assert.match(src, re, `${what} is not asserted, or not armed, after the write`);
  armed(after, /\n\s+SELECT count\(\*\)::int INTO v_n\n\s+FROM jsonb_array_elements\(v_lnk\) e\n\s+JOIN public\.attachments a ON a\.id = \(e ->> 'a'\)::uuid AND a\.clinical_record_id = \(e ->> 'r'\)::uuid;\n\s+IF v_n <> cardinality\(v_att\) THEN\n\s+RAISE EXCEPTION 'STOP: /, "every linked document carrying the registo that named it");
  armed(after, /\n\s+WHERE a\.id = ANY\(v_att\) AND a\.patient_id IS DISTINCT FROM cr\.patient_id;\n\s+IF v_n <> 0 THEN\n\s+RAISE EXCEPTION 'STOP: /, "every linked document belonging to its registo's patient");
  armed(after, /\n\s+SELECT count\(\*\)::int INTO v_n FROM public\.clinical_records cr WHERE cr\.id = ANY\(v_regs\) AND cr\.status = 'locked';\n\s+IF v_n <> cardinality\(v_regs\) THEN\n\s+RAISE EXCEPTION 'STOP: /, "every target registo still locked");
  armed(after, /\n\s+AND NOT \(a\.id = ANY\(v_pre\)\) AND NOT \(a\.id = ANY\(v_att\)\);\n\s+IF v_n <> 0 THEN\n\s+RAISE EXCEPTION 'STOP: /, "no imported original gaining a registo outside the link set");
  armed(audit, /^INSERT INTO public\.audit_log \(tenant_id, actor_user_id, action, entity_type, entity_id, metadata\)\n\s+VALUES \(v_tenant, NULL, c_action, /, "the audit row's action");
  armed(audit, /\n\s+GET DIAGNOSTICS v_n = ROW_COUNT;\n\s+IF v_n <> 1 OR \(SELECT count\(\*\) FROM public\.audit_log al WHERE al\.action = c_action\) <> 1 THEN\n\s+RAISE EXCEPTION 'STOP: /, "the audit row written exactly once");
  armed(audit, /\n\s+IF \(SELECT count\(\*\) FROM public\.audit_log al WHERE al\.action = c_action AND al\.created_at = now\(\)\) <> 1 THEN\n\s+RAISE EXCEPTION 'STOP: /, "the audit row's created_at being this transaction's time");
  // Every STOP between the write and the DONE line: the ROW_COUNT, the deltas, the
  // checks above, the digest and the md5 families. One fewer is a check removed.
  assert.equal((c.slice(write, done).match(/RAISE EXCEPTION 'STOP:/g) ?? []).length, 17, "the number of STOPs after the write moved: a check was removed or added without this test");
});

test("the carries: the link set's count and digest, lifted in plain SQL, compared in the block, and passed by the document", () => {
  const car = between(SETS, "\ncar AS (", "\nref AS (", "car");
  const names = [...car.matchAll(/'(anexo_v2_[a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(names, ["anexo_v2_count", "anexo_v2_digest"]);
  for (const a of names) for (const b of names) if (a !== b) assert.ok(!b.includes(a), `carry ${a} is inside ${b}`);
  for (const c of names) assert.match(S2, new RegExp(`set_config\\('anexo2\\.${c}',\\s+:'${c}',\\s+false\\)`), `stage 2 does not lift ${c}`);
  assert.match(S2, /IF v_n <> 2 THEN\n\s+RAISE EXCEPTION 'STOP: the carry set has % names, not 2'/, "stage 2 does not assert the carry count");
  const blockNames = block("STAGE 2").match(/NAMES=\(\n([\s\S]*?)\n\)/)?.[1].split(/\s+/).filter(Boolean);
  assert.deepEqual(blockNames, names, "the doc's stage 2 block does not pass exactly these carries, in order");
  assert.match(car, /coalesce\(md5\(string_agg\(l\.attachment_id::text \|\| ':' \|\| l\.record_id::text, ','\n\s+ORDER BY l\.attachment_id, l\.record_id\)\), 'empty'\)/, "the digest expression moved");
  // P3, the one place the block holds what stage 1 printed against what it
  // recomputes: v_car is the car CTE of the SETS block, assigned once; each of its
  // names is read back from what set_config lifted, refused when it was not passed,
  // and refused when it differs. The later count and digest checks compare with v_car.
  const c2 = code(S2);
  assert.ok(c2.includes("(SELECT jsonb_object_agg(c.carry, c.value) FROM car c)\n    INTO v_tenant, v_lnk, v_regs, v_excl, v_excl_ids, v_ref, v_car;"), "stage 2's v_car is not the car CTE, recomputed");
  assert.doesNotMatch(c2, /\bv_car\s*:=/, "stage 2 assigns v_car a second time");
  const p3 = between(c2, "SELECT count(*)::int INTO v_n FROM jsonb_object_keys(v_car);", "RAISE NOTICE 'P3 both carries match stage 1';", "P3").replace(/\s+/g, " ").trim();
  assert.equal(p3, "SELECT count(*)::int INTO v_n FROM jsonb_object_keys(v_car); IF v_n <> 2 THEN RAISE EXCEPTION 'STOP: the carry set has % names, not 2', v_n; END IF; "
    + "FOR v_row IN SELECT c.key, c.value FROM jsonb_each_text(v_car) c ORDER BY 1 LOOP v_want := current_setting('anexo2.' || v_row.key, true); "
    + "IF v_want IS NULL OR v_want = '' THEN RAISE EXCEPTION 'STOP: carry % was not passed from stage 1', v_row.key; END IF; "
    + "IF v_want IS DISTINCT FROM v_row.value THEN RAISE EXCEPTION 'STOP: carry % reads % now and stage 1 printed %. The database moved since stage 1. Nothing was written; the sitting stops here', v_row.key, v_row.value, v_want; END IF; END LOOP; "
    + "IF cardinality(v_att) <> (v_car ->> 'anexo_v2_count')::int THEN RAISE EXCEPTION 'STOP: the link set holds % documents and the carry counts %', cardinality(v_att), v_car ->> 'anexo_v2_count'; END IF;",
  "P3 does not hold every carry stage 1 printed against the one it recomputes, and refuse on a carry missing or different");
});

test("stage 2 refuses on stale or foreign carries: stage 1 passed within the hour, on the recorded sha", () => {
  const b = block("STAGE 2");
  assert.match(b, /find \/tmp\/anexo2-stage1\.ok -mmin -60(?![0-9])/, "stage 2 takes a stage 1 mark older than the hour");
  assert.match(b, /find \/tmp\/anexo2-stage1\.out -mmin -60(?![0-9])/, "stage 2 takes a stage 1 transcript older than the hour");
  assert.ok(b.includes('[ "$(cat /tmp/anexo2-stage1.ok)" = "${REC}" ] || {'), "stage 2 does not hold stage 1's pass to the recorded sha");
});

test("every refusal stage 1 prints is a refusal stage 2 raises, each with its control, and the doc counts and lists them", () => {
  const codes = [...SETS.matchAll(/'(R\d{2})'(?: AS code)?,/g)].map((m) => m[1]);
  const want = Array.from({ length: codes.length }, (_, i) => `R${String(i + 1).padStart(2, "0")}`);
  assert.deepEqual(codes, want, "the refusal codes are not contiguous from R01");
  assert.ok(codes.length >= 12);
  assert.match(SETS, /'R01' AS code, '[^']+' AS label,\n[\s\S]*? AS n,\n\s+\(SELECT count\(\*\) FROM cl\)::int AS control/, "the refusals do not carry a control column");
  assert.match(S1, /'verdict', CASE WHEN r\.n > 0 THEN 'REFUSE' WHEN r\.control = 0 THEN 'VACUOUS' ELSE 'OK' END/, "a refusal does not read REFUSE, VACUOUS or OK by its n and its control");
  assert.match(S2, /WHERE \(e ->> 'n'\)::int > 0 ORDER BY 1\s+LOOP\s+RAISE EXCEPTION 'STOP: % refuses/);
  assert.ok(block("STAGE 1").includes(`[ "\${RN}" = ${codes.length} ]`), "stage 1's block does not count every refusal line");
  for (const c of codes) assert.match(DOC, new RegExp(`^\\| ${c} \\| `, "m"), `the doc's refusal table does not explain ${c}`);
});

/**
 * Every refusal of the SETS block as [code, n, control], each folded to one line.
 * The rows are cut at their UNION ALLs and each row at its top-level commas, both
 * read on the lexed text, so a comment or a label can move neither cut.
 */
function refusalRows() {
  const head = "\nref AS (\n";
  const body = between(SETS, head, `\n)\n${END}`, "the ref CTE").slice(head.length);
  const rows = [];
  let from = 0;
  for (const m of lexSql(body, false).code.matchAll(/\n\s+UNION ALL\n/g)) {
    rows.push(body.slice(from, m.index));
    from = m.index + m[0].length;
  }
  rows.push(body.slice(from));
  return rows.map((r) => {
    const parts = splitTop(r);
    assert.equal(parts.length, 4, `a refusal row is not a code, a label, n and a control: ${parts.join(" | ").slice(0, 120)}`);
    return [parts[0].match(/^SELECT '(R\d{2})'/)?.[1], parts[2].replace(/ AS n$/, ""), parts[3].replace(/ AS control$/, "")];
  });
}

// What each refusal counts (n) and the population it reads (control), whole, as the
// doc's refusal table states them. Some have a test of their own as well; this one
// holds every predicate, so none can be blinded (WHERE false, a comparison that can
// never hold) or its control emptied while the other tests stay green.
const REFUSAL_PREDICATES = [
  ["R01", "((2 - (SELECT count(*) FROM cl)) + GREATEST((SELECT count(DISTINCT cl.tenant_id) FROM cl) - 1, 0))::int",
    "(SELECT count(*) FROM cl)::int"],
  ["R02", "(SELECT count(*) FROM public.audit_log al WHERE al.action = 'attachment.anexo_link.backfill')::int",
    "(SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant)::int"],
  ["R03", "(SELECT count(*) FROM public.audit_log al WHERE al.action = 'attachment.anexo_link_v2.backfill')::int",
    "(SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant)::int"],
  ["R04", "(SELECT count(*) FROM (SELECT l.attachment_id FROM lnk l GROUP BY l.attachment_id HAVING count(DISTINCT l.record_id) > 1) x)::int",
    "(SELECT count(DISTINCT l.attachment_id) FROM lnk l)::int"],
  ["R05", "(SELECT count(*) FROM (SELECT c.storage_path FROM cls c WHERE c.storage_path IN (SELECT l.storage_path FROM lnk l) AND c.attachment_id IS NOT NULL AND c.att_deleted IS NULL GROUP BY c.storage_path HAVING count(DISTINCT c.attachment_id) > 1) x)::int",
    "(SELECT count(DISTINCT l.storage_path) FROM lnk l)::int"],
  ["R06", "(SELECT count(*) FROM lnk l WHERE l.att_patient IS DISTINCT FROM l.cr_patient)::int",
    "(SELECT count(*) FROM lnk)::int"],
  ["R07", "(SELECT count(DISTINCT l.record_id) FROM lnk l WHERE l.cr_status IS DISTINCT FROM 'locked')::int",
    "(SELECT count(DISTINCT l.record_id) FROM lnk l)::int"],
  ["R08", "(SELECT count(DISTINCT l.record_id) FROM lnk l, k WHERE l.cr_tenant IS DISTINCT FROM k.tenant)::int",
    "(SELECT count(DISTINCT l.record_id) FROM lnk l)::int"],
  ["R09", "(CASE WHEN (SELECT count(*) FROM lnk) = 0 THEN 1 ELSE 0 END)::int",
    "(SELECT count(*) FROM cls c WHERE NOT c.f_other)::int"],
  ["R10", "(SELECT count(*) FROM cls c WHERE c.f_unc OR (c.f_other::int + c.f_noreg::int + c.f_nodoc::int + c.f_here::int + c.f_else::int + c.f_del::int + c.f_link::int + c.f_unc::int) <> 1)::int",
    "(SELECT count(*) FROM cls)::int"],
  ["R11", "((SELECT count(*) FROM (SELECT sp.file_name FROM split sp WHERE sp.src = 'control' EXCEPT ALL SELECT unnest(ARRAY['a.pdf', 'b.pdf', 'c.pdf'])) x) + (SELECT count(*) FROM (SELECT unnest(ARRAY['a.pdf', 'b.pdf', 'c.pdf']) EXCEPT ALL SELECT sp.file_name FROM split sp WHERE sp.src = 'control') y))::int",
    "(SELECT count(*) FROM split sp WHERE sp.src = 'control')::int"],
  ["R12", "(SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN ('public.attachments'::regclass, 'public.audit_log'::regclass) AND NOT t.tgisinternal)::int",
    "(SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN ('public.attachments'::regclass, 'public.audit_log'::regclass))::int"],
];

test("every refusal's n and its control are the predicate the refusal table states, pinned whole: a predicate blinded or a control emptied goes red", () => {
  // The row reader, on the shapes it must read right, first.
  assert.deepEqual(splitTop("SELECT 'R99', 'a, b (c)', (SELECT count(*) FROM x WHERE y IN (1, 2))::int, -- n, here\n  0::int"),
    ["SELECT 'R99'", "'a, b (c)'", "(SELECT count(*) FROM x WHERE y IN (1, 2))::int", "0::int"], "a comma in a label, a subquery or a comment cuts a refusal row");
  const rows = refusalRows();
  assert.deepEqual(rows.map((r) => r[0]), REFUSAL_PREDICATES.map((r) => r[0]), "the refusal rows are not R01 to R12, in order");
  for (const [c, n, control] of REFUSAL_PREDICATES) {
    const [, gotN, gotControl] = rows.find((r) => r[0] === c);
    assert.equal(gotN, n, `${c} counts something other than its predicate`);
    assert.equal(gotControl, control, `${c}'s control reads another population`);
  }
});

/* ---- the verify ---------------------------------------------------------- */

function verdictRows() {
  const body = between(S3, "), r AS (\n", "\n)\nSELECT r.n,", "the verdict rows").slice("), r AS (\n".length);
  return body.split(/\n(?=(?:SELECT|UNION ALL SELECT) \d+)/);
}
const ALLOWED_VACUOUS = [10, 11];

test("stage 3 prints a contiguous set of verdicts, each able to FAIL, and the doc counts them and allows VACUOUS on 10 and 11 only", () => {
  const ns = [...S3.matchAll(/^(?:SELECT|UNION ALL SELECT) (\d+)(?: AS n)?, '/gm)].map((m) => Number(m[1]));
  const verdicts = ns.filter((n) => n !== 99);
  assert.deepEqual(verdicts, Array.from({ length: verdicts.length }, (_, i) => i + 1));
  const rows = verdictRows();
  assert.equal(rows.length, verdicts.length, "the verdict rows did not split one per verdict");
  rows.forEach((r, i) => assert.match(r, /(?:THEN|ELSE) 'FAIL'/, `verdict ${i + 1} cannot FAIL`));
  const b = block("STAGE 3");
  assert.ok(b.includes(`[ "\${NV}" = ${verdicts.length} ]`), "the doc's stage 3 block counts a different number");
  const allowed = b.match(/grep -vxE '([0-9|]+)'/)?.[1].split("|").map(Number);
  assert.deepEqual(allowed, ALLOWED_VACUOUS, "the block allows VACUOUS on verdicts other than 10 and 11");
});

test("an empty comparand never reads OK: 10 and 11 read VACUOUS, every other verdict FAILs on an empty link set, and 4 carries its less-one control", () => {
  const rows = verdictRows();
  rows.forEach((r, i) => {
    const n = i + 1;
    if (ALLOWED_VACUOUS.includes(n)) {
      assert.match(r, /THEN 'VACUOUS'/, `verdict ${n} has no VACUOUS branch`);
      assert.ok(r.indexOf("THEN 'FAIL'") < r.indexOf("THEN 'VACUOUS'"), `verdict ${n} must test FAIL before VACUOUS`);
    } else {
      assert.doesNotMatch(r, /'VACUOUS'/, `verdict ${n} can read VACUOUS`);
    }
  });
  for (const n of [3, 5, 6, 9, 12]) assert.match(rows[n - 1], /OR v\.n_link = 0 THEN 'FAIL'/, `verdict ${n} does not FAIL on an empty link set`);
  for (const n of [7, 8]) assert.match(rows[n - 1], /OR v\.n_reg = 0 THEN 'FAIL'/, `verdict ${n} does not FAIL on no registo`);
  assert.match(rows[3], /OR v\.digest_less_one IS NOT DISTINCT FROM \(v\.m ->> 'digest'\) THEN 'FAIL'/, "verdict 4 loses its control");
  assert.match(S3, /ORDER BY a\.id OFFSET 1\) s\) AS digest_less_one/, "the less-one digest does not drop a pair");
  assert.match(rows[8], /v\.unrecorded <> 0 OR v\.imported_linked_now < v\.n_link/, "verdict 9 does not find the written rows without the list");
});

// What each stage 3 verdict compares: its CASE, whole, and every read of the v CTE
// it compares, whole, over the rows the audit row names. A comparison dropped from a
// CASE, a bound loosened, or a read blinded (WHERE false, another status) goes red here.
const VERDICT_CASES = [
  "CASE WHEN v.v2_rows = 1 THEN 'OK' ELSE 'FAIL' END",
  "CASE WHEN v.old_rows <> 0 OR v.v2_rows <> 1 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.link_ok <> v.n_link OR v.n_pairs <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.digest_now IS DISTINCT FROM (v.m ->> 'digest') OR v.digest_less_one IS NOT DISTINCT FROM (v.m ->> 'digest') THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.md5_w_fixed_now IS DISTINCT FROM (v.m -> 'md5' ->> 'w_fixed') OR v.w_rows_now <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.mismatch <> 0 OR v.linked_read <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.unlocked <> 0 OR v.regs_read <> v.n_reg OR v.n_rg <> v.n_reg OR v.n_reg = 0 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.md5_cr_t_now IS DISTINCT FROM (v.m -> 'md5' ->> 'cr_t') OR v.regs_read <> v.n_reg OR v.n_reg = 0 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.unrecorded <> 0 OR v.imported_linked_now < v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END",
  "CASE WHEN v.md5_excl_now IS DISTINCT FROM (v.m -> 'md5' ->> 'excl') OR v.ex_read IS DISTINCT FROM coalesce((v.m -> 'md5_rows' ->> 'excl')::int, 0) THEN 'FAIL' WHEN coalesce((v.m -> 'md5_rows' ->> 'excl')::int, 0) = 0 THEN 'VACUOUS' ELSE 'OK' END",
  "CASE WHEN v.md5_ep_t_now IS DISTINCT FROM (v.m -> 'md5' ->> 'ep_t') OR v.ep_read IS DISTINCT FROM coalesce((v.m -> 'md5_rows' ->> 'ep_t')::int, 0) THEN 'FAIL' WHEN coalesce((v.m -> 'md5_rows' ->> 'ep_t')::int, 0) = 0 THEN 'VACUOUS' ELSE 'OK' END",
  "CASE WHEN v.documentos_ok <> v.n_link OR v.n_link = 0 THEN 'FAIL' ELSE 'OK' END",
];
const IMPORTED = "a.storage_path LIKE a.tenant_id::text || '/migration/fisiozero/%'";
const TARGET_EPISODES = "WHERE ep.id IN (SELECT cr.episode_id FROM public.clinical_records cr WHERE cr.id IN (SELECT rg.id FROM rg))";
const V_READS = {
  v2_rows: "(SELECT count(*) FROM public.audit_log x WHERE x.action = 'attachment.anexo_link_v2.backfill')::int",
  old_rows: "(SELECT count(*) FROM public.audit_log x WHERE x.action = 'attachment.anexo_link.backfill')::int",
  m: "(SELECT al.m FROM al)",
  n_link: "coalesce((SELECT (al.m ->> 'linked_count')::int FROM al), 0)",
  n_reg: "coalesce((SELECT (al.m ->> 'registos_touched')::int FROM al), 0)",
  n_pairs: "(SELECT count(*) FROM pr)::int",
  n_rg: "(SELECT count(*) FROM rg)::int",
  link_ok: "(SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id AND a.clinical_record_id = pr.r_id)::int",
  digest_now: "(SELECT coalesce(md5(string_agg(a.id::text || ':' || a.clinical_record_id::text, ',' ORDER BY a.id, a.clinical_record_id)), 'empty') FROM pr JOIN public.attachments a ON a.id = pr.a_id)",
  digest_less_one: "(SELECT coalesce(md5(string_agg(s.id::text || ':' || s.clinical_record_id::text, ',' ORDER BY s.id, s.clinical_record_id)), 'empty') FROM (SELECT a.id, a.clinical_record_id FROM pr JOIN public.attachments a ON a.id = pr.a_id ORDER BY a.id OFFSET 1) s)",
  w_rows_now: "(SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id)::int",
  md5_w_fixed_now: `(SELECT md5(coalesce(${W_FIXED} a.size_bytes, a.uploaded_by, a.created_at, a.deleted_at, a.deleted_by_user_id, a.delete_reason)::text, E'\\n' ORDER BY a.id), '')) FROM public.attachments a WHERE a.id IN (SELECT pr.a_id FROM pr))`,
  linked_read: "(SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id JOIN public.clinical_records cr ON cr.id = a.clinical_record_id)::int",
  mismatch: "(SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id JOIN public.clinical_records cr ON cr.id = a.clinical_record_id WHERE a.patient_id IS DISTINCT FROM cr.patient_id)::int",
  regs_read: "(SELECT count(*) FROM rg JOIN public.clinical_records cr ON cr.id = rg.id)::int",
  unlocked: "(SELECT count(*) FROM rg JOIN public.clinical_records cr ON cr.id = rg.id WHERE cr.status IS DISTINCT FROM 'locked')::int",
  md5_cr_t_now: "(SELECT md5(coalesce(string_agg(md5((cr.*)::text), E'\\n' ORDER BY cr.id), '')) FROM public.clinical_records cr WHERE cr.id IN (SELECT rg.id FROM rg))",
  imported_linked_now: `(SELECT count(*) FROM public.attachments a WHERE ${IMPORTED} AND a.clinical_record_id IS NOT NULL)::int`,
  unrecorded: `(SELECT count(*) FROM public.attachments a WHERE ${IMPORTED} AND a.clinical_record_id IS NOT NULL AND a.id NOT IN (SELECT pr.a_id FROM pr) AND a.id NOT IN (SELECT pre.id FROM pre))::int`,
  md5_excl_now: "(SELECT md5(coalesce(string_agg((a.*)::text, E'\\n' ORDER BY a.id), '')) FROM public.attachments a WHERE a.id IN (SELECT ex.id FROM ex))",
  ex_read: "(SELECT count(*) FROM public.attachments a WHERE a.id IN (SELECT ex.id FROM ex))::int",
  ep_read: `(SELECT count(*) FROM public.clinical_episodes ep ${TARGET_EPISODES})::int`,
  md5_ep_t_now: `(SELECT md5(coalesce(string_agg((ep.*)::text, E'\\n' ORDER BY ep.id), '')) FROM public.clinical_episodes ep ${TARGET_EPISODES})`,
  documentos_ok: `(SELECT count(*) FROM pr JOIN public.attachments a ON a.id = pr.a_id WHERE a.patient_id IS NOT NULL AND ${IMPORTED})::int`,
};
// The sets every read is over: the one v2 audit row, and the pairs, registos,
// left-alone ids and already-linked ids stage 2 wrote into it.
const VERIFY_SOURCES = "WITH al AS ( SELECT a.metadata AS m, a.created_at AS at, a.tenant_id AS tenant FROM public.audit_log a WHERE a.action = 'attachment.anexo_link_v2.backfill' ORDER BY a.created_at DESC LIMIT 1 ), "
  + "pr AS ( SELECT (e ->> 'a')::uuid AS a_id, (e ->> 'r')::uuid AS r_id FROM al CROSS JOIN LATERAL jsonb_array_elements(al.m -> 'pairs') e ), "
  + "rg AS ( SELECT (x.v)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text(al.m -> 'registos') x(v) ), "
  + "ex AS ( SELECT (x.v)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text(al.m -> 'excluded_ids') x(v) ), "
  + "pre AS ( SELECT (x.v)::uuid AS id FROM al CROSS JOIN LATERAL jsonb_array_elements_text(al.m -> 'prelinked_ids') x(v)";

test("every stage 3 verdict compares exactly what it names: each CASE, each read of the v CTE and the sets they read are pinned whole", () => {
  const cases = verdictRows().map((r) => splitTop(r).at(-1).replace(/ FROM v$/, "").replace(/ AS verdict$/, ""));
  assert.equal(cases.length, VERDICT_CASES.length, "stage 3 prints another number of verdicts than this test pins");
  cases.forEach((c, i) => assert.equal(c, VERDICT_CASES[i], `verdict ${i + 1} compares something other than what it names`));
  const head = "), v AS (\n  SELECT\n";
  const reads = splitTop(between(S3, head, "\n), r AS (\n", "the v CTE").slice(head.length)).map((p) => p.match(/^([\s\S]+) AS ([a-z_0-9]+)$/)?.slice(1));
  assert.ok(reads.every(Boolean), "a read of the v CTE has no name");
  assert.deepEqual(reads.map((r) => r[1]), Object.keys(V_READS), "the v CTE reads another set of names than this test pins");
  for (const [expr, name] of reads) assert.equal(expr, V_READS[name], `the read ${name} that a verdict compares reads something else`);
  assert.equal(code(between(S3, "WITH al AS (", "), v AS (", "the verify's sources")).replace(/\s+/g, " ").trim(), VERIFY_SOURCES, "stage 3 reads its verdicts over another audit row or other recorded sets");
});

test("stage 3 reads back only what stage 2 records, and the audit actions agree everywhere", () => {
  assert.ok(S2.includes(`c_action     constant text := '${ACTION}'`));
  assert.ok(SETS.includes(`al.action = '${ACTION}'`) && SETS.includes(`al.action = '${OLD_ACTION}'`));
  assert.ok(S3.includes(`a.action = '${ACTION}'`) && S3.includes(`x.action = '${OLD_ACTION}'`));
  assert.ok(read("scripts/data/anexo-link-2-apply.sql").includes(`c_action  constant text := '${OLD_ACTION}'`), "the original op's action is not the one R02 refuses on");
  const top = [...S3.matchAll(/m -> '([a-z_]+)'(?! ->)/g)].map((m) => m[1]);
  const topText = [...S3.matchAll(/m ->> '([a-z_]+)'/g)].map((m) => m[1]);
  const nested = [...S3.matchAll(/m -> '(md5|md5_rows)' ->> '([a-z_]+)'/g)].map((m) => [m[1], m[2]]);
  for (const k of new Set([...top, ...topText])) assert.ok(S2.includes(`'${k}', `), `stage 3 reads ${k}, which stage 2 never writes`);
  for (const [obj, k] of nested) assert.ok(FAMILIES.includes(k), `stage 3 reads ${obj}.${k}, which stage 2 never writes`);
});

test("the md5 fingerprints stage 3 recomputes are the exact expressions stage 2 recorded", () => {
  const cr = "md5(coalesce(string_agg(md5((cr.*)::text), E'\\n' ORDER BY cr.id), ''))";
  const ep = "md5(coalesce(string_agg((ep.*)::text, E'\\n' ORDER BY ep.id), ''))";
  const ex = "md5(coalesce(string_agg((a.*)::text, E'\\n' ORDER BY a.id), ''))";
  const dg = "coalesce(md5(string_agg(a.id::text || ':' || a.clinical_record_id::text, ','";
  for (const [label, s] of [["stage 2", S2], ["stage 3", S3]]) {
    assert.ok(s.includes(W_FIXED), `${label}: the written-row fingerprint differs`);
    for (const [name, e] of [["registo", cr], ["episode", ep], ["left-alone", ex], ["digest", dg]]) assert.ok(s.includes(e), `${label}: the ${name} fingerprint differs`);
    assert.match(s, /SET TIME ZONE 'UTC';\nSET datestyle = 'ISO, YMD';/, `${label} does not fix the text rendering`);
  }
  assert.match(S1, /SET TIME ZONE 'UTC';\nSET datestyle = 'ISO, YMD';/, "stage 1 does not fix the text rendering");
});

test("the re-issuable paragraph names what a later migration and a later merge move: every verdict whose md5 is over whole rows, and 10 when a merge re-points a document the op left alone", () => {
  const v = between(S3, "), v AS (\n", "\n), r AS (\n", "the v CTE");
  const md5s = [...v.matchAll(/\(SELECT md5\(coalesce\(string_agg\(([^\n]*)[\s\S]*?\) AS (md5_[a-z_]+_now),?\n/g)];
  assert.ok(md5s.length >= 4, "stage 3's md5 reads were not found, so this read nothing");
  const whole = md5s.filter((m) => /\([a-z]+\.\*\)::text/.test(m[1])).map((m) => m[2]);
  const moved = verdictRows().map((r, i) => [i + 1, r]).filter(([, r]) => whole.some((c) => r.includes(`v.${c}`))).map(([n]) => n);
  assert.ok(moved.includes(8), "verdict 8 no longer reads a whole-row md5, so this test's premise moved");
  const list = moved.join(", ").replace(/, (\d+)$/, " and $1");
  const para = between(DOC, "**Stage 3 is re-issuable", "\n\n", "the re-issuable paragraph").replace(/\s+/g, " ");
  assert.ok(para.includes(`A later migration can FAIL ${list} with no row written at all`), `the re-issuable paragraph does not say a migration can move ${list}, the verdicts whose md5 is over whole rows`);
  assert.ok(para.includes("8 moves only with a merge or a migration"), "the re-issuable paragraph calls a FAIL on 8 after a migration an integrity breach");
  assert.ok(para.includes("when it owns a named document the op left alone it FAILs 10"), "the re-issuable paragraph does not say a merge moves 10 when it re-points a document the op left alone");
});

/* ---- the document: run from main, the head checked by the machine ------- */

const STAGE_BLOCKS = () => [0, 1, 2, 3].map((n) => [`stage ${n}`, block(`STAGE ${n}`)]);

test("the document runs from origin/main: stage 0 records the sha, stages 1 and 2 HALT on a moved main before any database, every stage checks out the recorded sha, and no block names a branch", () => {
  for (const [label, b] of STAGE_BLOCKS()) {
    assert.ok(!b.includes("origin/data/"), `${label} derives its head from a branch`);
    assert.ok(!b.includes("ANEXO-LINK-held-op"), `${label} names the op's branch`);
    assert.doesNotMatch(b, /^BRANCH=/m, `${label} sets a branch`);
    const checkouts = b.split("\n").filter((x) => /\bgit checkout\b/.test(x));
    assert.equal(checkouts.length, 1, `${label} checks out ${checkouts.length} times`);
    assert.equal(checkouts[0], label === "stage 0" ? "git checkout -q --detach ${MAIN}" : "git checkout -q --detach ${REC}", `${label} checks out something other than the recorded head`);
  }
  const s0 = block("STAGE 0").split("\n");
  const fetch = s0.indexOf("git fetch origin --prune");
  const main = s0.indexOf("MAIN=$(git rev-parse origin/main)");
  const co = s0.indexOf("git checkout -q --detach ${MAIN}");
  const side = s0.indexOf('shasum -a 256 -c ${DOCPIN} || { echo "STOP: this document is not the approved one"; exit 1; }');
  const lastPin = Math.max(...s0.map((l, i) => (l.startsWith('[ "$(shasum -a 256 ') ? i : -1)));
  const rec = s0.indexOf('echo "${MAIN}" > /tmp/anexo2-main.sha');
  const written = s0.findIndex((l) => l.includes("/tmp/anexo2-written.ok"));
  assert.ok(written >= 0 && written < fetch, "stage 0 does not refuse once stage 2 has written, so a new head could replace the recorded one");
  assert.ok(fetch >= 0 && fetch < main && main < co && co < side && side < lastPin && lastPin < rec, "stage 0 does not fetch, resolve origin/main, check it out, verify the sidecar and every pin, and only then record the sha");
  for (const n of [1, 2]) {
    const l = block(`STAGE ${n}`).split("\n");
    const readRec = l.indexOf("REC=$(cat /tmp/anexo2-main.sha)");
    const f = l.indexOf("git fetch origin --prune");
    const now = l.indexOf("NOW=$(git rev-parse origin/main)");
    const halt = l.findIndex((x) => x.startsWith('[ "${NOW}" = "${REC}" ] || { echo "STOP: main moved since stage 0, the merge freeze was broken.'));
    const co2 = l.indexOf("git checkout -q --detach ${REC}");
    const env = l.findIndex((x) => x.includes("osteojp-secrets"));
    const psql = l.findIndex((x) => x.startsWith("psql "));
    assert.ok(readRec >= 0 && readRec < f && f < now && now < halt && halt < co2 && co2 < env && env < psql, `stage ${n}'s HEAD CHECK does not read the recorded sha, fetch, compare and halt before it checks out, loads the environment and runs psql`);
    assert.match(l[halt], /nothing is written.*exit 1; \}$/, `stage ${n}'s HEAD CHECK does not halt with nothing written`);
  }
  const s1 = block("STAGE 1").split("\n");
  assert.ok(s1.includes('echo "${REC}" > /tmp/anexo2-stage1.ok'), "stage 1 does not mark its pass with the recorded sha");
  const s3 = block("STAGE 3").split("\n");
  assert.ok(s3.includes("REC=$(cat /tmp/anexo2-main.sha)"), "stage 3 does not run from the recorded sha");
  assert.ok(!s3.some((l) => l.includes('"${NOW}" = "${REC}"') && /exit [1-9]/.test(l)), "stage 3 stops on a moved main, but after the write only it may still run");
  assert.ok(s3.some((l) => l.includes("MAIN MOVED since stage 0")), "stage 3 does not report a moved main");
});

const CLEAN = ["STRAY=$(git status --short)", '[ -z "${STRAY}" ] || { echo "STOP: the apply worktree is not clean"; echo "${STRAY}"; exit 1; }'];
const SIDECAR = 'shasum -a 256 -c docs/data-op-anexo-link-v2.sha256 || { echo "STOP: this document is not the approved one"; exit 1; }';

test("stages 0, 1 and 2 refuse a worktree that is not clean before they fetch, and stages 1 to 3 check the sidecar on the recorded sha before the environment or psql", () => {
  for (const [label, b] of STAGE_BLOCKS()) {
    const l = b.split("\n");
    const at = l.indexOf(CLEAN[0]);
    const fetch = l.indexOf("git fetch origin --prune");
    if (label === "stage 3") {
      assert.equal(at, -1, "stage 3 refuses a worktree that is not clean, but after the write only it may still run");
    } else {
      assert.ok(at >= 0 && l[at + 1] === CLEAN[1], `${label} does not refuse a worktree that is not clean`);
      assert.equal(l.filter((x) => x.includes("STRAY")).length, 2, `${label} checks its worktree more than once, so this test cannot tell which check halts`);
      const written = l.findIndex((x) => x.includes("/tmp/anexo2-written.ok"));
      assert.ok(written >= 0 && written < at && at < fetch, `${label} does not check the worktree after the written marker and before it fetches`);
    }
    if (label === "stage 0") continue;
    const side = l.indexOf(SIDECAR);
    const co = l.indexOf("git checkout -q --detach ${REC}");
    const env = l.findIndex((x) => x.includes("osteojp-secrets"));
    const psql = l.findIndex((x) => x.startsWith("psql "));
    assert.equal(l.filter((x) => x.includes("docs/data-op-anexo-link-v2.sha256")).length, 1, `${label} does not check the sidecar exactly once`);
    assert.ok(co >= 0 && co < side && side < env && env < psql, `${label} does not check the sidecar after it checks out the recorded sha and before it loads the environment and runs psql`);
  }
});

/** The lines of a stage block after its psql line: the checks it makes on the transcript psql left. */
function tail(n) {
  const l = block(`STAGE ${n}`).split("\n");
  const at = l.findIndex((x) => x.startsWith("psql "));
  assert.ok(at > 0 && l.at(-1) === ")", `the stage ${n} block has no psql line, or does not close its subshell`);
  return l.slice(at + 1, -1).join("\n");
}

/**
 * The stage `n` block's own checks after psql, run under bash on a transcript this
 * test writes, with `/tmp/` moved to a scratch directory. So a check that no longer
 * halts where it must (a grep for a word the SQL never prints, a check deleted) goes
 * red here, where a pin on the text would pass a grep that can never match.
 */
function runTail(n, transcript, rec = "a".repeat(40)) {
  const dir = mkdtempSync(join(tmpdir(), "anexo2-tail-"));
  try {
    writeFileSync(join(dir, `anexo2-stage${n}.out`), transcript);
    const body = tail(n).split("/tmp/").join(`${dir}/`);
    const r = spawnSync("bash", ["-c", `(\nset -eo pipefail\nREC=${rec}\n${body}\n)`], { encoding: "utf8" });
    const file = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8").trim() : null);
    return { code: r.status, out: `${r.stdout}${r.stderr}`, mark: file("anexo2-stage1.ok"), written: file("anexo2-written.ok") !== null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REF_CODES = Array.from({ length: 12 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`);
/** A stage 1 transcript in psql's aligned shape; `verdicts` maps a refusal code to what it reads. */
function stage1Out({ verdicts = {}, codes = REF_CODES, partition = "partition holds", complete = true } = {}) {
  return [
    "=== ANEXO LINK V2, STAGE 1. READ ONLY ===",
    " pairs | in_exactly_one | unclassified | label_agrees |    partition    ",
    "-------+----------------+--------------+--------------+-----------------",
    `    11 |             11 |            0 |           11 | ${partition}`,
    ...codes.map((c) => ` ${c}  | a refusal label | ${verdicts[c] === "REFUSE" ? 1 : 0} |       2 | ${verdicts[c] ?? "OK"}`),
    ...(complete ? ["=== ANEXO LINK V2 STAGE 1 COMPLETE. Nothing was written. ==="] : []),
    "",
  ].join("\n");
}
/** A stage 3 transcript in psql's aligned shape; `verdicts` maps a verdict number to what it reads. */
function stage3Out({ verdicts = {}, count = 12, summary = true, complete = true } = {}) {
  const rows = Array.from({ length: count }, (_, i) => [i + 1, verdicts[i + 1] ?? "OK"]);
  const tally = (w) => rows.filter((r) => r[1] === w).length;
  return [
    "  n | check | observed | expected | verdict",
    ...rows.map(([n, w]) => `${String(n).padStart(3)} | a verdict label | 5 | 5, above 0 | ${w}`),
    ...(summary ? [` 99 | SUMMARY | ${tally("OK")} OK / ${tally("VACUOUS")} VACUOUS / ${tally("FAIL")} FAIL | ${count} verdicts | SUMMARY`] : []),
    ...(complete ? ["=== ANEXO LINK V2 STAGE 3 COMPLETE. Nothing was written. ==="] : []),
    "",
  ].join("\n");
}

test("the checks each block makes on its transcript halt where they must: run under bash on written transcripts, every halt arm stops and every clean arm goes on", () => {
  const halts = (r, stop, what) => {
    assert.equal(r.code, 1, `${what}: the block went on (exit ${r.code})\n${r.out}`);
    assert.ok(r.out.includes(stop), `${what}: the block did not print ${JSON.stringify(stop)}\n${r.out}`);
  };
  // Stage 1: the mark that lets stage 2 run is written only on a clean read.
  const s1 = runTail(1, stage1Out());
  assert.equal(s1.code, 0, `stage 1 halts on a clean read\n${s1.out}`);
  assert.equal(s1.mark, "a".repeat(40), "stage 1 does not mark its pass with the recorded sha");
  assert.ok(s1.out.includes("STAGE 1 READ, NO REFUSAL."), "stage 1 does not say it read no refusal");
  const vac = runTail(1, stage1Out({ verdicts: { R02: "VACUOUS", R03: "VACUOUS" } }));
  assert.equal(vac.code, 0, `stage 1 halts on a VACUOUS refusal, which is not a refusal\n${vac.out}`);
  for (const [what, out, stop] of [
    ["a REFUSE on R05", stage1Out({ verdicts: { R05: "REFUSE" } }), "STOP: stage 1 printed REFUSE on R05 "],
    ["a REFUSE on R01 and R12", stage1Out({ verdicts: { R01: "REFUSE", R12: "REFUSE" } }), "STOP: stage 1 printed REFUSE on R01 R12 "],
    ["no COMPLETE line", stage1Out({ complete: false }), "STOP: stage 1 did not print its COMPLETE line"],
    ["a partition that does not hold", stage1Out({ partition: "PARTITION BROKEN" }), "STOP: stage 1 did not print partition holds"],
    ["11 refusal lines", stage1Out({ codes: REF_CODES.slice(0, 11) }), "STOP: stage 1 printed 11 refusal lines, not 12"],
  ]) {
    const r = runTail(1, out);
    halts(r, stop, `stage 1 on ${what}`);
    assert.equal(r.mark, null, `stage 1 on ${what} marked its pass, so stage 2 would run`);
  }
  // Stage 2: the written marker stands as soon as psql exits 0, whatever the transcript says.
  const done = "NOTICE:  ANEXO LINK V2 STAGE 2 DONE: linked\n=== ANEXO LINK V2 STAGE 2 COMMITTED ===\n";
  const s2 = runTail(2, done);
  assert.equal(s2.code, 0, `stage 2 halts on a clean write\n${s2.out}`);
  assert.ok(s2.written && s2.out.includes(WRITTEN_LINE), "stage 2 does not mark the write and send the runner on");
  for (const [what, out, stop] of [
    ["no DONE line", "=== ANEXO LINK V2 STAGE 2 COMMITTED ===\n", "but its DONE line is missing"],
    ["no COMMITTED line", "NOTICE:  ANEXO LINK V2 STAGE 2 DONE: linked\n", "but its COMMITTED line is missing"],
  ]) {
    const r = runTail(2, out);
    halts(r, stop, `stage 2 on ${what}`);
    assert.ok(r.written, `stage 2 on ${what} left no written marker, though psql exited 0 and the write stands`);
    assert.ok(!r.out.includes(WRITTEN_LINE), `stage 2 on ${what} sent the runner on to stage 3`);
  }
  // Stage 3: VERIFIED only with 12 verdicts, a SUMMARY, the COMPLETE line, no FAIL, and VACUOUS on 10 and 11 alone.
  const s3 = runTail(3, stage3Out());
  assert.equal(s3.code, 0, `stage 3 halts on a clean verify\n${s3.out}`);
  assert.ok(s3.out.includes("ANEXO LINK V2 VERIFIED: 12 OK / 0 VACUOUS / 0 FAIL."), `stage 3 does not print its profile\n${s3.out}`);
  const allowed = runTail(3, stage3Out({ verdicts: { 10: "VACUOUS", 11: "VACUOUS" } }));
  assert.equal(allowed.code, 0, `stage 3 halts on VACUOUS 10 and 11, which the op allows\n${allowed.out}`);
  assert.ok(allowed.out.includes("ANEXO LINK V2 VERIFIED: 10 OK / 2 VACUOUS / 0 FAIL."), `stage 3 does not print the profile it read\n${allowed.out}`);
  for (const [what, out, stop] of [
    ["a FAIL on 3, 4 and 6", stage3Out({ verdicts: { 3: "FAIL", 4: "FAIL", 6: "FAIL" } }), "STOP: a stage 3 verdict read FAIL"],
    ["a FAIL on 12 alone", stage3Out({ verdicts: { 12: "FAIL" } }), "STOP: a stage 3 verdict read FAIL"],
    ["a VACUOUS on 9", stage3Out({ verdicts: { 9: "VACUOUS" } }), "STOP: VACUOUS on 9 "],
    ["no COMPLETE line", stage3Out({ complete: false }), "STOP: stage 3 did not print its COMPLETE line"],
    ["no SUMMARY row", stage3Out({ summary: false }), "STOP: stage 3 printed no SUMMARY row"],
    ["11 verdicts", stage3Out({ count: 11 }), "STOP: stage 3 printed 11 verdicts, not 12"],
  ]) {
    const r = runTail(3, out);
    halts(r, stop, `stage 3 on ${what}`);
    assert.ok(!r.out.includes("ANEXO LINK V2 VERIFIED"), `stage 3 on ${what} still printed VERIFIED`);
  }
});

test("every script a block runs is pinned by sha256 in that block and checked before it runs, and stage 0 checks all four", () => {
  for (const [label, b] of STAGE_BLOCKS()) {
    const l = b.split("\n");
    const runs = [];
    l.forEach((x, i) => {
      const pq = x.match(/^psql .* -f (scripts\/\S+\.sql)(?=\s|$)/);
      if (pq) runs.push([pq[1], i]);
      if (/(?:^|[;&|(`]\s*)psql\s/.test(x)) assert.ok(pq, `${label} runs psql in a shape this test does not read: ${x}`);
      const nd = x.match(/^node (scripts\/\S+\.mjs)$/);
      if (nd) runs.push([nd[1], i]);
      assert.doesNotMatch(x, /(?:^|[\s;|&(])(?:bash|sh|zsh|source|eval)\s|(?:^|[\s;|&])\.\s+(?!\/Users\/ivan\/osteojp-secrets\/new-prod\.env)/, `${label} runs a program by a route this test does not pin: ${x}`);
    });
    assert.equal(runs.length, label === "stage 0" ? 0 : 2, `${label} runs ${runs.map((r) => r[0]).join(", ")}`);
    for (const [file, at] of runs) {
      const check = l.findIndex((x) => new RegExp(`^\\[ "\\$\\(shasum -a 256 ${esc(file)} \\| cut -d' ' -f1\\)" = "\\$\\{(SHA[A-Z0-9]*)\\}" \\] \\|\\| \\{ echo "STOP: [^"]*"; exit 1; \\}$`).test(x));
      assert.ok(check >= 0 && check < at, `${label} runs ${file} without checking its pin first`);
      const v = l[check].match(/\$\{(SHA[A-Z0-9]*)\}/)[1];
      assert.equal(l.find((x) => x.startsWith(`${v}=`)), `${v}=${sha256(file)}`, `${label}'s ${v} is not the sha256 of ${file}`);
    }
  }
  const s0 = block("STAGE 0");
  for (const f of [F1, F2, F3, GUARD]) assert.ok(s0.includes(`[ "$(shasum -a 256 ${f} | cut -d' ' -f1)" = `), `stage 0 does not check ${f}`);
});

/**
 * THE HALT RULE as STAFF-10 v2 states it since its owner ruling of 2026-09-26 (one
 * halt rule, in the same words in the document and in GREEN's dispatch), copied here
 * because that document is not on main. This op states it word for word, with its
 * own onward line in place of STAFF-10 v2's, and nothing else changed.
 */
const STAFF10_HALT_RULE = [
  "THE HALT RULE. Any refusal (a REFUSE line, or a harness or classifier refusal), any",
  "STOP line, any FAIL verdict, any ERROR and any non-zero exit stops the sitting, and",
  "nothing continues to the next block. After stage 2 has committed, a post-commit STOP",
  "still stops the sitting: the write stands, and stage 3 (READ ONLY) runs only on the",
  "owner's or the lead's word. The only onward path from stage 2 to stage 3 is exit 0",
  "with the line \"STAFF-10 V2 WRITTEN. Paste stage 3 now.\" No block, and no dispatch",
  "step, runs anything after a refusal, a STOP, a FAIL, an ERROR or a non-zero exit:",
  "no closing read and no journal read. Whether and when a halted sitting starts again",
  "is the lead's call, never the runner's.",
].join("\n");
const WRITTEN_LINE = "ANEXO LINK V2 WRITTEN. Paste stage 3 now.";
const HALT_RULE = STAFF10_HALT_RULE.replace("\"STAFF-10 V2 WRITTEN. Paste stage 3 now.\"", `"${WRITTEN_LINE}"`);
const AFTER_STOP = "stage 3 (READ ONLY) runs only on the owner's or the lead's word";

test("the halt rule is STAFF-10 v2's, word for word; no block or stage file tells anyone to run stage 1 again, and no STOP sends the runner on to stage 3", () => {
  assert.notEqual(HALT_RULE, STAFF10_HALT_RULE, "this op's onward line did not replace STAFF-10 v2's, so this test compares nothing");
  assert.equal(DOC.split(HALT_RULE).length - 1, 1, "the document does not state STAFF-10 v2's halt rule exactly once, word for word");
  assert.ok(DOC.indexOf(HALT_RULE) < DOC.indexOf("| Fact | Value |"), "the halt rule is not stated at the head of the document, before the facts table");
  assert.ok(block("STAGE 2").split("\n").includes(`echo "${WRITTEN_LINE}"`), "the stage 2 block's onward line is not the one the halt rule names");
  assert.ok(HALT_RULE.replace(/\s+/g, " ").includes(AFTER_STOP), "the words every STOP after the write ends on are not the halt rule's");
  for (const [label, b] of STAGE_BLOCKS()) assert.doesNotMatch(b, /run stage 1 again/i, `${label} tells the reader to run stage 1 again`);
  for (const [label, sql] of STAGES) assert.doesNotMatch(sql, /run stage 1 again/i, `${label} tells the reader to run stage 1 again`);
  let stops = 0;
  const written = [];
  for (const [label, b] of STAGE_BLOCKS()) {
    for (const line of b.split("\n").filter((l) => l.includes("STOP:"))) {
      stops++;
      assert.doesNotMatch(line, /paste stage 3|stage 3 only|go on to stage 3/i, `${label}: a STOP sends the runner on to stage 3: ${line.slice(0, 100)}`);
      if (/ALREADY WRITTEN/.test(line)) {
        written.push(label);
        assert.ok(line.endsWith(` The sitting stops here. Never run stage 0, 1 or 2 again. GREEN reports this whole output, and ${AFTER_STOP}"; exit 1; }`), `${label}: the ALREADY WRITTEN STOP does not stop the sitting and leave stage 3 to the owner's or the lead's word`);
      }
    }
  }
  assert.ok(stops > 0, "no block prints a STOP line, so this read nothing");
  assert.deepEqual(written, ["stage 0", "stage 1", "stage 2"], "stages 0, 1 and 2 do not each refuse once stage 2 has written");
  const prose = between(DOC, "## STAGE 2", "## STAGE 3", "the stage 2 section").split("\n```\n").at(-1);
  for (const want of [
    "Either one stops the sitting like every other `STOP:`: GREEN reports the whole output, never runs stage 0, 1 or 2 again, and stage 3, READ ONLY, runs only on the owner's or the lead's word.",
    "**Every other exit stops the sitting, with nothing else pasted.**",
    "In every case GREEN reports the exit code and the whole output, and stage 3, READ ONLY, runs only on the owner's or the lead's word;",
  ]) {
    assert.ok(prose.replace(/\s+/g, " ").includes(want), `the prose under the stage 2 block does not say: ${want}`);
  }
  assert.doesNotMatch(DOC.replace(/\s+/g, " "), /when the owner or the lead says so/, "the document keeps the halt rule's superseded ending somewhere");
});

test("stage 2 cannot hide its DONE line, the block marks the write as soon as psql exits 0, and a STOP after the write stops the sitting", () => {
  const c = code(S2);
  const pin = c.indexOf("SET client_min_messages = notice;");
  assert.ok(pin >= 0 && pin < c.indexOf("DO $anexo2$"), "stage 2 does not pin client_min_messages before the block");
  assert.match(S2, /RAISE NOTICE 'ANEXO LINK V2 STAGE 2 DONE/, "the DONE line is not the NOTICE the block greps for");
  assert.match(S2, /\\echo '=== ANEXO LINK V2 STAGE 2 COMMITTED ==='\n$/, "the COMMITTED line is not the file's last, after the COMMIT");
  const b = block("STAGE 2");
  const psql = b.indexOf("-f scripts/data/anexo-link-v2-2-write.sql");
  const touch = b.indexOf("touch /tmp/anexo2-written.ok");
  const done = b.indexOf("grep -q 'ANEXO LINK V2 STAGE 2 DONE'");
  assert.ok(psql > 0 && psql < touch && touch < done, "the written marker is not touched between psql and the transcript checks");
  const after = b.split("\n").slice(b.slice(0, touch).split("\n").length);
  const stops = after.filter((line) => line.includes("STOP:"));
  assert.deepEqual(stops.map((l) => l.match(/^grep -q '([^']+)'/)?.[1]), ["ANEXO LINK V2 STAGE 2 DONE", "ANEXO LINK V2 STAGE 2 COMMITTED"], "the block does not print exactly two STOP lines after the write");
  for (const line of stops) {
    assert.match(line, /"STOP: psql exited 0, so the COMMIT ran and THE WRITE STANDS, but its (DONE|COMMITTED) line is missing\. The sitting stops here\. Never run stage 0, 1 or 2 again\. GREEN reports this whole output, and stage 3 \(READ ONLY\) runs only on the owner's or the lead's word"; exit 1; \}$/);
  }
  const onward = after.filter((l) => /stage 3/i.test(l) && !l.includes("STOP:"));
  assert.deepEqual(onward, ['echo "ANEXO LINK V2 WRITTEN. Paste stage 3 now."'], "the only line sending the runner on to stage 3 is not the WRITTEN line");
});

test("every block survives an interactive zsh paste: no # line, no backslash continuation, no ! outside test !", () => {
  for (const [label, b] of STAGE_BLOCKS()) {
    b.split("\n").forEach((x, i) => {
      assert.doesNotMatch(x, /^\s*#/, `${label}:${i + 1} starts with #`);
      assert.doesNotMatch(x, /\\$/, `${label}:${i + 1} ends in a backslash`);
      assert.doesNotMatch(x.replace(/test !/g, ""), /!/, `${label}:${i + 1} carries a !, which zsh expands from history`);
    });
  }
});

/* ---- the pins, the superseded op, the order and the public bytes ---------- */

test("the doc pins each file by its sha256, and the sidecar pins the doc", () => {
  const pins = { SHA1: F1, SHA2: F2, SHA3: F3, SHAGUARD: GUARD };
  for (const [name, file] of Object.entries(pins)) {
    const want = sha256(file);
    const set = [...DOC.matchAll(new RegExp(`^${name}=([0-9a-f]{64})$`, "gm"))].map((m) => m[1]);
    assert.ok(set.length > 0, `no block sets ${name}`);
    for (const v of set) assert.equal(v, want, `${name} in the doc is not the sha256 of ${file}`);
    assert.match(DOC, new RegExp(`^\\| [^|]+ \\| \`${esc(file)}\`, [^\\n]*sha256 \`${want}\``, "m"), `the facts table does not pin ${file}`);
  }
  assert.equal(read(SIDEF), `${sha256(DOCF)}  ${DOCF}\n`, "the sidecar does not pin the doc");
});

/** sha256 of docs/data-op-anexo-link.md as main carried it before this op (d5c85b83), with no banner. */
const ORIGINAL_DOC_SHA256 = "5b5b84113145e2fb4794e973a0b08e481427bd3680f8713bd7522cd60868d74a";

test("the original ANEXO LINK files are byte-identical to what their own doc pinned, and that doc is SUPERSEDED", () => {
  const old = read(OLDDOCF);
  assert.match(old, /^> \*\*SUPERSEDED on 2026-09-26\. DO NOT RUN ANY BLOCK IN THIS DOCUMENT\.\*\* The ANEXO LINK\n> write is now `docs\/data-op-anexo-link-v2\.md`/m, "the original doc carries no SUPERSEDED banner naming v2");
  assert.ok(old.indexOf("SUPERSEDED") < old.indexOf("**Status: NOT RUN.**"), "the banner is not above the original text");
  // The banner is quote lines and one blank line, and the document without it is,
  // byte for byte, the original as main carried it before this op (d5c85b83).
  const from = old.indexOf("> **SUPERSEDED");
  const status = old.indexOf("**Status: NOT RUN.**");
  assert.match(old.slice(from, status), /^(?:> [^\n]*\n)+\n$/, "the banner carries something besides its quote lines and one blank line");
  assert.equal(createHash("sha256").update(old.slice(0, from) + old.slice(status)).digest("hex"), ORIGINAL_DOC_SHA256, "the original document's text below its banner changed");
  for (const f of ["anexo-link-1-preview.sql", "anexo-link-2-apply.sql", "anexo-link-3-postcheck.sql"]) {
    const pinned = old.match(new RegExp(`scripts/data/${esc(f)}\`, sha256 \`([0-9a-f]{64})\``))?.[1];
    assert.ok(pinned, `the original doc does not pin ${f}`);
    assert.equal(sha256(`scripts/data/${f}`), pinned, `${f} moved`);
  }
});

/**
 * Every read of public.audit_log in a stage file, as the text of the subquery or
 * statement that holds it. The parentheses are matched on the lexed SQL, whose
 * strings and comments are blanked at the same positions, so a quoted
 * 'public.audit_log'::regclass is not a read and a parenthesis inside a string
 * cannot move a bound, and a psql line (an \echo) is dropped from the text, so it
 * can neither fake nor hide a key. The INSERT is the write, not a read.
 */
function auditReads(sql) {
  const lexed = lexSql(sql).code;
  const reads = [];
  for (const m of lexed.matchAll(/public\.audit_log\b/g)) {
    if (/INSERT\s+INTO\s+$/i.test(lexed.slice(Math.max(0, m.index - 24), m.index))) continue;
    let from = 0;
    for (let i = m.index - 1, depth = 0; i >= 0; i--) {
      if (lexed[i] === ")") depth++;
      else if (lexed[i] === "(" && depth-- === 0) { from = i + 1; break; } else if (lexed[i] === ";" && depth === 0) { from = i + 1; break; }
    }
    let to = lexed.length;
    for (let i = m.index, depth = 0; i < lexed.length; i++) {
      if (lexed[i] === "(") depth++;
      else if (lexed[i] === ")" && depth-- === 0) { to = i; break; } else if (lexed[i] === ";" && depth === 0) { to = i; break; }
    }
    reads.push(code(sql.slice(from, to)).replace(/^\\.*$/gm, "").replace(/\s+/g, " ").trim());
  }
  return reads;
}
const OWN_ACTION = new RegExp(`\\b[a-z]+\\.action (?:= '${esc(ACTION)}'|= '${esc(OLD_ACTION)}'|= c_action\\b|IN \\('${esc(OLD_ACTION)}', '${esc(ACTION)}'\\))`);
const TENANT_CONTROLS = {
  "stage 1": ["SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant", 2],
  "stage 2": ["SELECT count(*) FROM public.audit_log al, k WHERE al.tenant_id = k.tenant", 2],
  "stage 3": [null, 0],
};

test("the order after DUR-01 is stated in the document and not coupled in SQL: no stage reads appointments, every audit_log read is keyed on this op's two actions but the tenant-wide controls, and the document names them", () => {
  assert.match(DOC, /^\| Order \| \*\*After DUR-01\*\*, by the owner's order\. Not coupled in SQL/m, "the facts table does not state the order after DUR-01");
  assert.match(DOC, /^## The order with DUR-01$/m, "the document does not explain why the order is not coupled");
  for (const [label, sql] of STAGES) {
    assert.doesNotMatch(code(sql), /dur01|dur-01|public\.appointments/i, `${label} reads DUR-01's rows or its audit row`);
    const reads = auditReads(sql);
    assert.ok(reads.length > 0, `${label}: no audit_log read found, so this read nothing`);
    const [control, n] = TENANT_CONTROLS[label];
    for (const r of reads) {
      assert.ok(OWN_ACTION.test(r) || r === control, `${label} reads audit_log neither by this op's two actions nor as the tenant-wide control: ${r.slice(0, 160)}`);
    }
    assert.equal(reads.filter((r) => r === control).length, n, `${label} counts the tenant's audit rows ${reads.filter((r) => r === control).length} times, not ${n}`);
  }
  // Where the controls sit: R02's and R03's control column. Stage 3 has none: verdict 1
  // asserts exactly one v2 row, and a tenant-wide count beside it always includes that row,
  // so it could never decide the verdict (review round 4).
  for (const c of ["R02", "R03"]) {
    const row = between(SETS, `'${c}'`, `'R0${Number(c[2]) + 1}'`, c);
    assert.match(row, new RegExp(`\\n\\s+\\(${esc(TENANT_CONTROLS["stage 1"][0])}\\)::int\\n\\s+UNION ALL\\n\\s+SELECT $`), `${c}'s control is not the tenant-wide count`);
  }
  assert.match(verdictRows()[0], /CASE WHEN v\.v2_rows = 1 THEN 'OK' ELSE 'FAIL' END/, "verdict 1 does not FAIL on everything but exactly one v2 row");
  assert.match(DOC, /^1\. exactly one v2 audit row\. It needs no control: a read blind to `audit_log` reads 0 and FAILs it/m, "the doc presents verdict 1 with a control that cannot FAIL it");
  const section = between(DOC, "## The order with DUR-01\n", "\n## ", "the DUR-01 section").replace(/\s+/g, " ");
  for (const want of ["Two controls count every audit row of the op's tenant", "the controls of R02 and R03 (stages 1 and 2)", "verdict 1 asserts exactly one v2 audit row, so a read blind to `audit_log` reads 0 and FAILs it", "DUR-01's audit row is one of the rows those controls count"]) {
    assert.ok(section.includes(want), `the DUR-01 section does not say: ${want}`);
  }
});

test("no public byte of the op carries a count next to a counted noun, or a dash, and no byte this branch adds is outside ASCII", () => {
  const noun = /\b\d[\d,.]*\s*(?:future |past |live |linked |imported |named )?(?:pairs?|rows?|patients?|appointments?|documents?|registos?|attachments?|files?|thousand)\b/i;
  for (const [label, text] of [...STAGES, ["the doc", DOC], ["the sidecar", read(SIDEF)]]) {
    text.split("\n").forEach((line, i) => {
      assert.doesNotMatch(line, noun, `${label}:${i + 1} reads like a count: ${line.trim().slice(0, 100)}`);
      assert.doesNotMatch(line, /[\u2013\u2014]/, `${label}:${i + 1} carries an en or em dash`);
    });
  }
  // Every file this branch adds, and the banner it adds to the original doc, is
  // ASCII: the whitespace the trim strips is written as escapes inside E-strings,
  // never as the invisible characters themselves. The original doc's own text
  // below the banner is history and is not this branch's.
  const old = read(OLDDOCF);
  const banner = old.slice(0, old.indexOf("**Status: NOT RUN.**"));
  assert.ok(banner.includes("SUPERSEDED"), "the original doc's banner was not found, so this read nothing");
  for (const [label, text] of [...STAGES, ["the doc", DOC], ["the sidecar", read(SIDEF)], ["this test", read("scripts/anexo-link-v2-data-op.test.mjs")], ["the original doc's banner", banner]]) {
    text.split("\n").forEach((line, i) => {
      const ch = line.match(/[^\x00-\x7f]/)?.[0];
      assert.equal(ch, undefined, `${label}:${i + 1} carries U+${ch?.codePointAt(0).toString(16).padStart(4, "0")}, a character outside ASCII`);
    });
  }
  for (const [name, lit] of [["ws", SETS.match(/^\s+E'([^']*)' AS ws$/m)?.[1]], ["the synthetic cell", SETS.match(/SELECT 'control', [^\n]*\n\s+E'([^']*)'\n/)?.[1]]]) {
    assert.ok(lit, `${name} is not one E-string in the SETS block`);
    assert.match(lit, /^(?:[\x20-\x7e]|\\[tnrf]|\\x[0-9a-f]{2}|\\u[0-9a-f]{4})+$/, `${name} is not written in printable ASCII and escapes`);
  }
});
