#!/usr/bin/env node
/**
 * BLIND STRUCTURE PROBE for the Fisiozero amostra.
 *
 * ==========================================================================
 * WHY THIS EXISTS AND WHY IT LOOKS PARANOID
 * ==========================================================================
 * CLAUDE.md, "Patient data isolation (Fisiozero import)": no Claude terminal
 * ever opens, reads, cats, greps or samples the delivery files. Ivan runs this;
 * what comes back to a terminal is structure only. Patient health data entering
 * an AI context creates an unapproved RGPD processor relationship, and the way
 * that happens in practice is not a deliberate `cat` - it is a diagnostic that
 * echoes "the offending row" to help somebody debug.
 *
 * SO THE RULE HERE IS ABSOLUTE AND IT IS ENFORCED BY CONSTRUCTION, not by care:
 * NO CELL VALUE, NO ZIP ENTRY NAME AND NO ERROR MESSAGE EVER REACHES STDOUT.
 * Counts, headers, hashes, lengths, extensions and error CODES only.
 *
 * Two places that would otherwise leak, handled deliberately:
 *   - DISTINCT COUNTS need to remember what has been seen. Values are HASHED
 *     before they enter the Set, so no plaintext cell is retained in memory at
 *     all - a crash dump or a debugger cannot surface one.
 *   - ERROR MESSAGES from a parser routinely quote the input that broke it.
 *     Only `name` and `code` are printed, never `message`.
 *
 * COLUMN HEADERS ARE PRINTED IN FULL, deliberately and per the rule, because
 * they are the schema and the whole point of the exercise. A header is not
 * personal data; a cell under it is.
 *
 * Usage:  node scripts/import/probe-amostra.mjs <directory>
 * Exit:   0 always, EXCEPT 2 when the directory is missing or unreadable.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** A CSV larger than this is not parsed - it is reported and skipped. */
const MAX_CSV_BYTES = 512 * 1024 * 1024;
/** ZIP end-of-central-directory can sit at most this far from EOF. */
const EOCD_SEARCH = 66_000;

const out = [];
const say = (line = "") => out.push(line);

/* ======================================================================== */
/* SANITISERS                                                               */
/* ======================================================================== */

/**
 * The ONLY way an error is allowed to be described.
 *
 * Never `message`: a CSV or JSON parser quotes the input that broke it, which
 * on this delivery is a patient row. `name` and `code` carry the diagnosis
 * ("ENOENT", "EACCES", "SyntaxError") and carry no input.
 */
function safeErr(e) {
  const name = e && typeof e.name === "string" ? e.name : "Error";
  const code = e && typeof e.code === "string" ? ` code=${e.code}` : "";
  return `${name}${code}`;
}

/** Short, non-reversible digest. Used so distinct-counting never holds a value. */
const digest = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

/* ======================================================================== */
/* CSV                                                                      */
/* ======================================================================== */

/**
 * A real CSV state machine, because a naive `split` gets the COUNTS wrong and
 * the counts are the entire deliverable.
 *
 * A quoted field may contain the delimiter, a newline, and `""` for a literal
 * quote. Splitting on the delimiter would over-count columns on any row where a
 * patient's address contains a comma - and would do it silently, reporting a
 * ragged file that is actually well-formed, or a clean one that is not.
 *
 * Returns rows as arrays of strings. The CALLER must never print them.
 */
function parseCsv(text, delim) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      // CRLF or a lone CR both end the record.
      if (text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // A final record with no trailing newline still counts.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows, unterminatedQuote: inQuotes };
}

/**
 * Delimiter from the FIRST LINE, counting outside quotes only.
 *
 * Counting naively would pick the wrong character whenever a quoted header
 * contains the other one, and a wrong delimiter makes every downstream number
 * meaningless while still LOOKING like a clean report - one column, 100% fill.
 */
function detectDelimiter(firstLine) {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const c = firstLine[i];
    if (c === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === ",") commas += 1;
    else if (c === ";") semis += 1;
  }
  // Semicolon wins a tie: it is the PT/Excel convention and this is a
  // Portuguese vendor export. Stated rather than left to chance.
  return { delim: semis >= commas && semis > 0 ? ";" : ",", commas, semis };
}

/**
 * Is this buffer valid UTF-8?
 *
 * WORTH CHECKING AND NOT DECORATION. A decade-old Portuguese system plausibly
 * exports cp1252/latin1. Decoded as UTF-8 that does not throw - it produces
 * replacement characters, so every accented name is silently mangled and the
 * import "succeeds". This is the check that catches it before 10,000 rows land.
 */
function isValidUtf8(buf) {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return !decoded.includes("�");
}

function probeCsv(file, full) {
  say(`  FILE  ${file}`);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch (e) {
    say(`    ERROR stat: ${safeErr(e)}`);
    return;
  }
  say(`    bytes            ${stat.size}`);
  if (stat.size > MAX_CSV_BYTES) {
    say(`    SKIPPED          larger than ${MAX_CSV_BYTES} bytes; not parsed`);
    return;
  }

  let buf;
  try {
    buf = fs.readFileSync(full);
  } catch (e) {
    say(`    ERROR read: ${safeErr(e)}`);
    return;
  }

  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const body = hasBom ? buf.subarray(3) : buf;
  const utf8 = isValidUtf8(body);
  say(`    utf8 BOM         ${hasBom ? "yes" : "no"}`);
  say(`    valid UTF-8      ${utf8 ? "yes" : "NO - likely cp1252/latin1, accented names will mangle"}`);

  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);

  // Physical lines, before any parsing. Differs from record count whenever a
  // quoted field contains a newline, and BOTH numbers are reported because a
  // gap between them is itself a finding.
  const physicalLines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length - (/(\r\n|\r|\n)$/.test(text) ? 1 : 0);
  say(`    lines (physical) ${physicalLines}`);

  const firstLineEnd = text.search(/\r\n|\r|\n/);
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const { delim, commas, semis } = detectDelimiter(firstLine);
  say(`    delimiter        ${delim === ";" ? "semicolon" : "comma"}  (header: ${commas} comma, ${semis} semicolon)`);

  let parsed;
  try {
    parsed = parseCsv(text, delim);
  } catch (e) {
    say(`    ERROR parse: ${safeErr(e)}`);
    return;
  }
  if (parsed.unterminatedQuote) {
    say(`    WARNING          file ends inside an unterminated quote - counts below are unreliable`);
  }

  const rows = parsed.rows;
  if (rows.length === 0) {
    say(`    headers          (file is empty)`);
    return;
  }
  const headers = rows[0];
  const dataRows = rows.slice(1);
  say(`    columns          ${headers.length}`);
  say(`    data rows        ${dataRows.length}`);
  say(`    headers          ${JSON.stringify(headers)}`);

  const ragged = dataRows.filter((r) => r.length !== headers.length).length;
  say(`    ragged rows      ${ragged}${ragged ? "  <-- field count differs from the header" : ""}`);

  // Fill rate and distinct count, per column. Values are hashed on the way into
  // the Set: the distinct COUNT is the deliverable and no plaintext is kept.
  const filled = new Array(headers.length).fill(0);
  const seen = headers.map(() => new Set());
  for (const r of dataRows) {
    for (let c = 0; c < headers.length; c += 1) {
      const v = c < r.length ? r[c].trim() : "";
      if (v.length === 0) continue;
      filled[c] += 1;
      seen[c].add(digest(v));
    }
  }

  say(`    per-column fill rate and distinct values:`);
  const idCandidates = [];
  for (let c = 0; c < headers.length; c += 1) {
    const d = seen[c].size;
    const isCandidate = dataRows.length > 0 && filled[c] === dataRows.length && d === dataRows.length;
    if (isCandidate) idCandidates.push(headers[c]);
    say(
      `      ${String(c).padStart(2, " ")}  ${JSON.stringify(headers[c])}` +
        `  fill=${pct(filled[c], dataRows.length)} (${filled[c]}/${dataRows.length})` +
        `  distinct=${d}${isCandidate ? "  <-- UNIQUE ID CANDIDATE" : ""}`,
    );
  }

  say(
    `    unique id        ${
      idCandidates.length
        ? `${idCandidates.length} candidate(s): ${JSON.stringify(idCandidates)}`
        : "NONE - no column is both 100% filled and fully distinct"
    }`,
  );
  // AT LOW ROW COUNTS ALMOST EVERY COLUMN IS FULLY DISTINCT, so the candidate
  // list above is nearly meaningless on a small amostra - a `nome` column looks
  // exactly like an id across 20 rows. Said here rather than left for somebody
  // to conclude that "nome" is the stable identifier the caderno asks for.
  if (idCandidates.length > 0 && dataRows.length < 20) {
    say(
      `    CAVEAT           only ${dataRows.length} data row(s): distinctness proves little at this size,` +
        ` and these candidates are NOT evidence of a stable identifier`,
    );
  }
  say("");
}

/* ======================================================================== */
/* ZIP - central directory only, never an entry's bytes                     */
/* ======================================================================== */

const rdU16 = (b, o) => b.readUInt16LE(o);
const rdU32 = (b, o) => b.readUInt32LE(o);
const rdU64 = (b, o) => Number(b.readBigUInt64LE(o));

/**
 * Read the ZIP central directory WITHOUT inflating anything.
 *
 * ZIP64 IS HANDLED RATHER THAN ASSUMED AWAY, and that is not defensive
 * programming for its own sake. The classic EOCD stores the entry count in 16
 * bits and sizes in 32. An attachment archive for 8,000-10,000 patients can
 * exceed both. Reading only the classic record would report 65,535 entries and
 * a wrapped size with total confidence - a wrong number that looks entirely
 * reasonable, which is the failure mode this project keeps paying for.
 */
function readZipCentralDirectory(full) {
  const fd = fs.openSync(full, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(EOCD_SEARCH, size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) return { error: "no end-of-central-directory record found" };

    let totalEntries = rdU16(tail, eocd + 10);
    let cdSize = rdU32(tail, eocd + 12);
    let cdOffset = rdU32(tail, eocd + 16);
    let zip64 = false;

    // ZIP64 locator sits immediately before the EOCD.
    if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
      const z64Off = rdU64(tail, eocd - 20 + 8);
      const z64 = Buffer.alloc(56);
      fs.readSync(fd, z64, 0, 56, z64Off);
      if (z64.readUInt32LE(0) === 0x06064b50) {
        zip64 = true;
        totalEntries = rdU64(z64, 32);
        cdSize = rdU64(z64, 40);
        cdOffset = rdU64(z64, 48);
      }
    }

    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);

    let p = 0;
    let entries = 0;
    let dirEntries = 0;
    let uncompressed = 0;
    let minLen = Infinity;
    let maxLen = 0;
    let truncatedSizes = 0;
    const byExt = new Map();

    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      let uSize = rdU32(cd, p + 24);
      const nameLen = rdU16(cd, p + 28);
      const extraLen = rdU16(cd, p + 30);
      const commentLen = rdU16(cd, p + 32);
      const nameStart = p + 46;

      // ZIP64 extended information: the 8-byte size lives in the extra field
      // whenever the 4-byte slot reads 0xFFFFFFFF.
      if (uSize === 0xffffffff) {
        let q = nameStart + nameLen;
        const extraEnd = q + extraLen;
        let found = false;
        while (q + 4 <= extraEnd) {
          const hid = rdU16(cd, q);
          const hsz = rdU16(cd, q + 2);
          if (hid === 0x0001 && hsz >= 8) {
            uSize = rdU64(cd, q + 4);
            found = true;
            break;
          }
          q += 4 + hsz;
        }
        if (!found) truncatedSizes += 1;
      }

      // The NAME is read only to take its LENGTH and its EXTENSION. It is never
      // stored, never printed, and goes out of scope with this iteration.
      const name = cd.subarray(nameStart, nameStart + nameLen).toString("utf8");

      // A DIRECTORY IS AN ENTRY TOO, and counting it as a file with no
      // extension is wrong in the direction that matters: it inflates the
      // attachment count and puts phantom rows in the "(none)" bucket, which is
      // exactly the bucket somebody would investigate as "files with no
      // extension". Directories are counted separately and excluded from the
      // extension and filename-length tallies.
      if (name.endsWith("/")) {
        dirEntries += 1;
        entries += 1;
        p = nameStart + nameLen + extraLen + commentLen;
        continue;
      }

      const base = name.split("/").pop() ?? name;
      if (base.length > 0) {
        minLen = Math.min(minLen, base.length);
        maxLen = Math.max(maxLen, base.length);
      }
      const dot = base.lastIndexOf(".");
      const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "(none)";
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1);

      entries += 1;
      uncompressed += uSize;
      p = nameStart + nameLen + extraLen + commentLen;
    }

    return {
      zip64,
      declaredEntries: totalEntries,
      walkedEntries: entries,
      dirEntries,
      uncompressed,
      truncatedSizes,
      minLen: minLen === Infinity ? 0 : minLen,
      maxLen,
      byExt,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function probeZip(file, full) {
  say(`  FILE  ${file}`);
  let r;
  try {
    r = readZipCentralDirectory(full);
  } catch (e) {
    say(`    ERROR: ${safeErr(e)}`);
    say("");
    return;
  }
  if (r.error) {
    say(`    ERROR: ${r.error}`);
    say("");
    return;
  }
  say(`    zip64            ${r.zip64 ? "yes" : "no"}`);
  say(`    entries          ${r.walkedEntries}  (${r.walkedEntries - r.dirEntries} file(s), ${r.dirEntries} director(ies))`);
  if (r.declaredEntries !== r.walkedEntries) {
    // A mismatch means the directory did not walk cleanly. Reported rather than
    // reconciled: the two numbers disagreeing is the finding.
    say(`    WARNING          directory declares ${r.declaredEntries}, walked ${r.walkedEntries}`);
  }
  say(`    uncompressed     ${r.uncompressed} bytes`);
  if (r.truncatedSizes > 0) {
    say(`    WARNING          ${r.truncatedSizes} entr(ies) had no readable 64-bit size; total is a FLOOR`);
  }
  say(`    filename length  min=${r.minLen} max=${r.maxLen}`);
  const exts = [...r.byExt.entries()].sort((a, b) => b[1] - a[1]);
  say(`    by extension     ${exts.length ? exts.map(([e, c]) => `${e}=${c}`).join("  ") : "(none)"}`);
  say("");
}

/* ======================================================================== */
/* manifesto.json                                                           */
/* ======================================================================== */

function probeManifest(file, full) {
  say(`  FILE  ${file}`);
  let raw;
  try {
    raw = fs.readFileSync(full, "utf8");
  } catch (e) {
    say(`    ERROR read: ${safeErr(e)}`);
    say("");
    return;
  }
  let obj;
  try {
    obj = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    // SyntaxError only. A JSON parse error quotes the offending input, so the
    // message is deliberately dropped.
    say(`    parses           NO (${safeErr(e)})`);
    say("");
    return;
  }
  say(`    parses           yes`);
  if (obj === null || typeof obj !== "object") {
    say(`    top-level        ${Array.isArray(obj) ? "array" : typeof obj} - no keys`);
  } else if (Array.isArray(obj)) {
    say(`    top-level        array of ${obj.length}`);
  } else {
    say(`    top-level keys   ${JSON.stringify(Object.keys(obj))}`);
  }
  say("");
}

/* ======================================================================== */
/* MAIN                                                                     */
/* ======================================================================== */

function sha256File(full) {
  const h = createHash("sha256");
  const fd = fs.openSync(full, "r");
  try {
    const buf = Buffer.alloc(1024 * 1024);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/import/probe-amostra.mjs <directory>");
    process.exit(2);
  }
  let st;
  try {
    st = fs.statSync(dir);
  } catch (e) {
    console.error(`cannot stat directory: ${safeErr(e)}`);
    process.exit(2);
  }
  if (!st.isDirectory()) {
    console.error("not a directory");
    process.exit(2);
  }

  let names;
  try {
    names = fs.readdirSync(dir).sort();
  } catch (e) {
    console.error(`cannot read directory: ${safeErr(e)}`);
    process.exit(2);
  }

  const files = names.filter((n) => {
    try {
      return fs.statSync(path.join(dir, n)).isFile();
    } catch {
      return false;
    }
  });

  say("FISIOZERO AMOSTRA - BLIND STRUCTURE PROBE");
  say("=========================================");
  say("Structure only. No cell value, no zip entry name and no error message");
  say("appears below. Safe to paste back in full.");
  say("");
  say(`top-level files  ${files.length}`);
  say("");

  const csvs = files.filter((f) => /\.csv$/i.test(f));
  const zips = files.filter((f) => /\.zip$/i.test(f));
  const manifests = files.filter((f) => /^manifesto\.json$/i.test(f));

  say("CSV FILES");
  say("---------");
  if (csvs.length === 0) say("  (none)");
  for (const f of csvs) probeCsv(f, path.join(dir, f));
  say("");

  say("ZIP FILES");
  say("---------");
  if (zips.length === 0) say("  (none)");
  for (const f of zips) probeZip(f, path.join(dir, f));
  say("");

  say("MANIFESTO");
  say("---------");
  if (manifests.length === 0) say("  (none)");
  for (const f of manifests) probeManifest(f, path.join(dir, f));
  say("");

  say("SHA256 OF EVERY TOP-LEVEL FILE");
  say("------------------------------");
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      say(`  ${sha256File(full)}  ${f}`);
    } catch (e) {
      say(`  ${"-".repeat(64)}  ${f}  (${safeErr(e)})`);
    }
  }

  process.stdout.write(out.join("\n") + "\n");
  process.exit(0);
}

main();
