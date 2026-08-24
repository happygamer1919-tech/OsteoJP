#!/usr/bin/env node
/**
 * ATTACHMENT BYTE-COPY JOB. Card A. docs/migration-notes.md section 3.
 *
 * The importer requires `attachments.storage_path` to already point at a real
 * object - the column is NOT NULL and `upsert.ts` uploads nothing. This is the
 * job that puts the bytes there.
 *
 * ==========================================================================
 * IVAN RUNS THIS. NO TERMINAL DOES.
 * ==========================================================================
 * CLAUDE.md, "Patient data isolation (Fisiozero import)". It reads delivery
 * files, so a terminal may never invoke it.
 *
 * NO FILENAME IS EVER PRINTED, INCLUDING ON A CONFLICT OR A FAILURE. The card
 * says "no filenames except conflict/failure entries" and then, in the same
 * breath, "print sha256 and checkpoint line number instead of the name". The
 * second instruction is the operative one and this implements it: attachment
 * filenames may carry patient names (CLAUDE.md), and a failure summary is
 * exactly the output somebody pastes into a chat. Every failure is identified
 * by its CHECKPOINT LINE NUMBER and its sha256, both of which Ivan can look up
 * locally and neither of which is personal data.
 *
 * ==========================================================================
 * WHAT IS UNVERIFIED, SAID PLAINLY
 * ==========================================================================
 * The Supabase Storage REST calls are authored from the documented API and have
 * NEVER BEEN RUN AGAINST A LIVE BUCKET - standing rule 2 forbids a terminal
 * making cloud writes. Every test below drives a MOCK client. Ivan's first run
 * is the proof, and it should be a handful of files before it is tens of GB.
 *
 * Usage:
 *   node scripts/import/copy-attachments.mjs \
 *     --source <dir|zip> --mapping <mapping.json> --checkpoint <file.jsonl>
 * Env (NAMES only, values never read into any log):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Exit: 0 clean · 1 conflicts or failures · 2 bad invocation
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import zlib from "node:zlib";

export const BUCKET = "clinical-attachments";
const DEFAULT_CONCURRENCY = 4;

const safeErr = (e) => `${e?.name ?? "Error"}${e?.code ? ` code=${e.code}` : ""}`;

/* ====================================================================== */
/* SOURCES - a directory, or a ZIP read entry by entry                     */
/* ====================================================================== */

/**
 * NEVER BUFFERS A WHOLE FILE. The delivery may be tens of gigabytes and a
 * single attachment may be a large scan; `readFileSync` on this path would be
 * an out-of-memory crash halfway through a run that has already uploaded
 * thousands of objects.
 *
 * A source exposes `names()` and `open(name)` returning a fresh Readable. It
 * must be re-openable because each file is read TWICE - once to hash, once to
 * upload. Two passes over local disk is the price of knowing the digest BEFORE
 * the bytes leave the machine, which is what makes the collision check mean
 * anything.
 */
export function directorySource(dir) {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
  return {
    kind: "directory",
    names: () => names,
    open: (name) => fs.createReadStream(path.join(dir, name)),
  };
}

const rdU16 = (b, o) => b.readUInt16LE(o);
const rdU32 = (b, o) => b.readUInt32LE(o);
const rdU64 = (b, o) => Number(b.readBigUInt64LE(o));

/**
 * ZIP source. Reads the central directory once, then streams each entry
 * through `inflateRaw` on demand.
 *
 * ZIP64 IS HANDLED because an attachment archive for 8,000-10,000 patients can
 * exceed both the 16-bit entry count and the 32-bit offsets. Reading only the
 * classic record would silently address the wrong bytes.
 */
export function zipSource(zipPath) {
  const fd = fs.openSync(zipPath, "r");
  const size = fs.fstatSync(fd).size;
  const tailLen = Math.min(66_000, size);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    fs.closeSync(fd);
    throw new Error("zip: no end-of-central-directory record");
  }
  let cdSize = rdU32(tail, eocd + 12);
  let cdOffset = rdU32(tail, eocd + 16);
  if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
    const z64Off = rdU64(tail, eocd - 20 + 8);
    const z64 = Buffer.alloc(56);
    fs.readSync(fd, z64, 0, 56, z64Off);
    if (z64.readUInt32LE(0) === 0x06064b50) {
      cdSize = rdU64(z64, 40);
      cdOffset = rdU64(z64, 48);
    }
  }
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOffset);

  const entries = new Map();
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = rdU16(cd, p + 10);
    let compSize = rdU32(cd, p + 20);
    const nameLen = rdU16(cd, p + 28);
    const extraLen = rdU16(cd, p + 30);
    const commentLen = rdU16(cd, p + 32);
    let localOffset = rdU32(cd, p + 42);
    const nameStart = p + 46;
    const name = cd.subarray(nameStart, nameStart + nameLen).toString("utf8");

    if (compSize === 0xffffffff || localOffset === 0xffffffff) {
      let q = nameStart + nameLen;
      const end = q + extraLen;
      while (q + 4 <= end) {
        const hid = rdU16(cd, q);
        const hsz = rdU16(cd, q + 2);
        if (hid === 0x0001) {
          let r = q + 4;
          if (rdU32(cd, p + 24) === 0xffffffff) r += 8; // uncompressed
          if (compSize === 0xffffffff) {
            compSize = rdU64(cd, r);
            r += 8;
          }
          if (localOffset === 0xffffffff) localOffset = rdU64(cd, r);
          break;
        }
        q += 4 + hsz;
      }
    }
    if (!name.endsWith("/")) {
      entries.set(name.split("/").pop(), { method, compSize, localOffset });
    }
    p = nameStart + nameLen + extraLen + commentLen;
  }

  return {
    kind: "zip",
    names: () => [...entries.keys()],
    open(name) {
      const e = entries.get(name);
      if (!e) throw new Error("zip: entry not found");
      // The local header repeats the name and extra lengths, and they may
      // DIFFER from the central directory's. Reading them here rather than
      // reusing the central values is what keeps the data offset correct.
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, e.localOffset);
      const dataStart = e.localOffset + 30 + rdU16(lh, 26) + rdU16(lh, 28);
      const raw = fs.createReadStream(zipPath, {
        start: dataStart,
        end: dataStart + e.compSize - 1,
      });
      return e.method === 0 ? raw : raw.pipe(zlib.createInflateRaw());
    },
    close: () => fs.closeSync(fd),
  };
}

/* ====================================================================== */
/* CHECKPOINT - append-only JSONL                                          */
/* ====================================================================== */

/**
 * APPEND-ONLY, ONE JSON OBJECT PER LINE, and the line NUMBER is the public
 * handle for an entry. It is what a conflict or a failure is reported by,
 * because the filename cannot be.
 *
 * WRITTEN AFTER EACH FILE RATHER THAN AT THE END. A run over tens of gigabytes
 * will be interrupted - a laptop sleeps, a network drops - and a checkpoint
 * that only exists at the end records nothing about the four hours that did
 * work.
 */
export function readCheckpoint(file) {
  const byPath = new Map();
  if (!fs.existsSync(file)) return { byPath, lines: 0 };
  const text = fs.readFileSync(file, "utf8");
  let lines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    lines += 1;
    try {
      const e = JSON.parse(line);
      byPath.set(e.storagePath, { ...e, line: lines });
    } catch {
      // A truncated final line is expected after a kill -9 and is not a
      // failure: it is skipped and the entry re-uploads. Ignoring it silently
      // is safe ONLY because the re-upload path re-verifies existence.
    }
  }
  return { byPath, lines };
}

export function appendCheckpoint(file, entry) {
  fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
}

/* ====================================================================== */
/* THE RUN                                                                 */
/* ====================================================================== */

export async function copyAttachments({
  source,
  mapping,
  checkpointFile,
  storage,
  concurrency = DEFAULT_CONCURRENCY,
  log = () => {},
}) {
  const started = Date.now();
  const { byPath, lines } = readCheckpoint(checkpointFile);
  let lineNo = lines;

  const counts = { uploaded: 0, skipped: 0, conflicts: 0, failures: 0, bytes: 0 };
  const conflicts = [];
  const failures = [];
  const available = new Set(source.names());

  const work = Object.entries(mapping).filter(([name]) => {
    if (available.has(name)) return true;
    // A mapped file absent from the delivery is a FAILURE, not a skip: the
    // importer will write an attachment row pointing at an object that does
    // not exist, and `storage_path` being NOT NULL makes that look healthy.
    lineNo += 1;
    counts.failures += 1;
    failures.push({ line: lineNo, sha256: null, reason: "not_in_delivery" });
    appendCheckpoint(checkpointFile, {
      storagePath: mapping[name],
      sha256: null,
      bytes: 0,
      status: "failed",
      reason: "not_in_delivery",
    });
    return false;
  });

  const queue = [...work];
  const runOne = async ([name, storagePath]) => {
    try {
      const prior = byPath.get(storagePath);
      const digest = await hashOf(source, name);

      if (prior && prior.status === "uploaded") {
        // THE CHECKPOINT IS NOT TRUSTED ON ITS OWN. It records what we believe
        // we did; `exists` records what is actually there. A bucket emptied
        // between runs would otherwise be skipped entirely on the strength of
        // a file on this laptop.
        if (await storage.exists(storagePath)) {
          if (prior.sha256 === digest) {
            counts.skipped += 1;
            return;
          }
          lineNo += 1;
          counts.conflicts += 1;
          conflicts.push({ line: lineNo, sha256: digest, reason: "digest_changed_since_upload" });
          appendCheckpoint(checkpointFile, { storagePath, sha256: digest, bytes: 0, status: "conflict", reason: "digest_changed_since_upload" });
          return;
        }
      }

      if (await storage.exists(storagePath)) {
        const known = prior?.sha256 ?? null;
        if (known === null || known !== digest) {
          // Occupied by something we cannot vouch for. Overwriting is the one
          // thing this job must never do: the object may be a live clinical
          // document.
          lineNo += 1;
          counts.conflicts += 1;
          conflicts.push({ line: lineNo, sha256: digest, reason: known === null ? "target_exists_unknown_origin" : "target_exists_different_digest" });
          appendCheckpoint(checkpointFile, { storagePath, sha256: digest, bytes: 0, status: "conflict", reason: known === null ? "target_exists_unknown_origin" : "target_exists_different_digest" });
          return;
        }
      }

      const bytes = await storage.upload(storagePath, () => source.open(name));
      lineNo += 1;
      counts.uploaded += 1;
      counts.bytes += bytes ?? 0;
      appendCheckpoint(checkpointFile, { storagePath, sha256: digest, bytes: bytes ?? 0, status: "uploaded" });
    } catch (e) {
      lineNo += 1;
      counts.failures += 1;
      failures.push({ line: lineNo, sha256: null, reason: safeErr(e) });
      appendCheckpoint(checkpointFile, { storagePath, sha256: null, bytes: 0, status: "failed", reason: safeErr(e) });
    }
  };

  // A fixed pool rather than Promise.all over everything: tens of thousands of
  // concurrent uploads would exhaust sockets and file handles long before the
  // remote rate-limited us.
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await runOne(next);
    }
  });
  await Promise.all(workers);

  const elapsedMs = Date.now() - started;
  return { counts, conflicts, failures, elapsedMs };
}

async function hashOf(source, name) {
  const h = createHash("sha256");
  for await (const chunk of source.open(name)) h.update(chunk);
  return h.digest("hex");
}

/* ====================================================================== */
/* SUPABASE STORAGE over REST - no new dependency                          */
/* ====================================================================== */

/**
 * Built from env by NAME. The key is read into a header and never returned,
 * logged, or included in any error this module produces.
 */
export function supabaseStorageClient(fetchImpl = globalThis.fetch) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment");
  }
  const base = `${url.replace(/\/+$/, "")}/storage/v1/object`;
  const auth = { authorization: `Bearer ${key}` };
  return {
    async exists(storagePath) {
      const res = await fetchImpl(`${base}/info/${BUCKET}/${storagePath}`, { method: "GET", headers: auth });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`storage info failed: ${res.status}`);
      return true;
    },
    async upload(storagePath, openStream) {
      const body = Readable.toWeb(openStream());
      const res = await fetchImpl(`${base}/${BUCKET}/${storagePath}`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/octet-stream", "x-upsert": "false" },
        body,
        duplex: "half",
      });
      if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
      return Number(res.headers.get("content-length") ?? 0);
    },
  };
}

/* ====================================================================== */
/* CLI                                                                     */
/* ====================================================================== */

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

async function main() {
  const src = arg("--source");
  const mappingFile = arg("--mapping");
  const checkpointFile = arg("--checkpoint");
  if (!src || !mappingFile || !checkpointFile) {
    console.error("usage: --source <dir|zip> --mapping <mapping.json> --checkpoint <file.jsonl>");
    process.exit(2);
  }
  let mapping;
  try {
    mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
  } catch (e) {
    console.error(`mapping unreadable: ${safeErr(e)}`);
    process.exit(2);
  }
  let source;
  try {
    source = fs.statSync(src).isDirectory() ? directorySource(src) : zipSource(src);
  } catch (e) {
    console.error(`source unreadable: ${safeErr(e)}`);
    process.exit(2);
  }

  const storage = supabaseStorageClient();
  const r = await copyAttachments({ source, mapping, checkpointFile, storage });
  source.close?.();

  console.log("ATTACHMENT BYTE COPY");
  console.log("====================");
  console.log(`  uploaded   ${r.counts.uploaded}`);
  console.log(`  skipped    ${r.counts.skipped}`);
  console.log(`  conflicts  ${r.counts.conflicts}`);
  console.log(`  failures   ${r.counts.failures}`);
  console.log(`  bytes      ${r.counts.bytes}`);
  console.log(`  elapsed    ${Math.round(r.elapsedMs / 1000)}s`);
  // Identified by checkpoint line and digest ONLY. Never by name.
  for (const c of r.conflicts) console.log(`  CONFLICT  line=${c.line} sha256=${c.sha256} ${c.reason}`);
  for (const f of r.failures) console.log(`  FAILURE   line=${f.line} sha256=${f.sha256 ?? "-"} ${f.reason}`);
  process.exit(r.counts.conflicts + r.counts.failures > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
