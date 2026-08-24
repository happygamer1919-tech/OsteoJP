// The attachment byte-copy job, against generated fixtures and a MOCK storage
// client. No real delivery file, no cloud call - standing rule 2 and CLAUDE.md's
// patient-data isolation rule both forbid a terminal doing either.
//
// WHAT THESE ASSERT is the set of things that would lose or overwrite a
// clinical document: an overwrite of an object we cannot vouch for, a resume
// that trusts a checkpoint over the bucket, a mapped file missing from the
// delivery passing as a skip, and a filename reaching stdout.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  copyAttachments,
  directorySource,
  readCheckpoint,
  zipSource,
} from "./copy-attachments.mjs";

/** Filenames are tracked tokens: any leak into output fails. */
const NAME = (n) => `ZZV${String(n).padStart(3, "0")}-scan.pdf`;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bytecopy-"));
}

function delivery(files) {
  const dir = tmp();
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

/** A storage client that records what was asked of it. */
function mockStorage({ existing = new Set(), failOn = null } = {}) {
  const uploaded = new Map();
  return {
    calls: [],
    uploaded,
    async exists(p) {
      this.calls.push(["exists", p]);
      return existing.has(p) || uploaded.has(p);
    },
    async upload(p, open) {
      this.calls.push(["upload", p]);
      if (failOn === p) throw Object.assign(new Error("boom"), { name: "UploadError", code: "EIO" });
      let bytes = 0;
      for await (const c of open()) bytes += c.length;
      uploaded.set(p, bytes);
      return bytes;
    },
  };
}

test("uploads every mapped file once and records bytes", async () => {
  const dir = delivery({ [NAME(1)]: "hello", [NAME(2)]: "worldly" });
  const cp = path.join(tmp(), "cp.jsonl");
  const storage = mockStorage();
  const r = await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf", [NAME(2)]: "t/b.pdf" },
    checkpointFile: cp,
    storage,
  });
  assert.equal(r.counts.uploaded, 2);
  assert.equal(r.counts.bytes, 12);
  assert.equal(readCheckpoint(cp).byPath.size, 2);
});

test("a re-run SKIPS completed entries - and verifies against the bucket first", async () => {
  const dir = delivery({ [NAME(1)]: "hello" });
  const cp = path.join(tmp(), "cp.jsonl");
  const storage = mockStorage();
  const args = { source: directorySource(dir), mapping: { [NAME(1)]: "t/a.pdf" }, checkpointFile: cp, storage };
  await copyAttachments(args);
  const second = await copyAttachments({ ...args, storage });
  assert.equal(second.counts.skipped, 1);
  assert.equal(second.counts.uploaded, 0);
  assert.ok(storage.calls.some(([m]) => m === "exists"), "the resume path must check the bucket");
});

test("a checkpoint that LIES is caught - the object is gone, so it re-uploads", async () => {
  // The checkpoint records what we believe we did. The bucket records what is
  // there. Trusting the first alone means a bucket emptied between runs is
  // skipped entirely on the strength of a file on this laptop.
  const dir = delivery({ [NAME(1)]: "hello" });
  const cp = path.join(tmp(), "cp.jsonl");
  await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf" },
    checkpointFile: cp,
    storage: mockStorage(),
  });
  const empty = mockStorage(); // a fresh bucket: nothing exists
  const r = await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf" },
    checkpointFile: cp,
    storage: empty,
  });
  assert.equal(r.counts.uploaded, 1);
  assert.equal(r.counts.skipped, 0);
});

test("an occupied target of UNKNOWN origin is a conflict, never an overwrite", async () => {
  // The object may be a live clinical document. Overwriting is the one thing
  // this job must never do.
  const dir = delivery({ [NAME(1)]: "hello" });
  const cp = path.join(tmp(), "cp.jsonl");
  const storage = mockStorage({ existing: new Set(["t/a.pdf"]) });
  const r = await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf" },
    checkpointFile: cp,
    storage,
  });
  assert.equal(r.counts.conflicts, 1);
  assert.equal(r.counts.uploaded, 0);
  assert.equal(r.conflicts[0].reason, "target_exists_unknown_origin");
  assert.ok(!storage.calls.some(([m]) => m === "upload"), "must not have uploaded");
});

test("a target whose bytes CHANGED since we uploaded is a conflict", async () => {
  const dir = delivery({ [NAME(1)]: "hello" });
  const cp = path.join(tmp(), "cp.jsonl");
  const storage = mockStorage();
  const mapping = { [NAME(1)]: "t/a.pdf" };
  await copyAttachments({ source: directorySource(dir), mapping, checkpointFile: cp, storage });
  fs.writeFileSync(path.join(dir, NAME(1)), "DIFFERENT");
  const r = await copyAttachments({ source: directorySource(dir), mapping, checkpointFile: cp, storage });
  assert.equal(r.counts.conflicts, 1);
  assert.equal(r.conflicts[0].reason, "digest_changed_since_upload");
});

test("a mapped file ABSENT from the delivery is a FAILURE, not a skip", async () => {
  // The importer would write an attachment row pointing at nothing, and
  // storage_path being NOT NULL makes that look perfectly healthy.
  const dir = delivery({ [NAME(1)]: "hello" });
  const cp = path.join(tmp(), "cp.jsonl");
  const r = await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf", [NAME(9)]: "t/missing.pdf" },
    checkpointFile: cp,
    storage: mockStorage(),
  });
  assert.equal(r.counts.failures, 1);
  assert.equal(r.failures[0].reason, "not_in_delivery");
});

test("an upload error is recorded and the run CONTINUES", async () => {
  const dir = delivery({ [NAME(1)]: "a", [NAME(2)]: "b" });
  const cp = path.join(tmp(), "cp.jsonl");
  const r = await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf", [NAME(2)]: "t/b.pdf" },
    checkpointFile: cp,
    storage: mockStorage({ failOn: "t/a.pdf" }),
    concurrency: 1,
  });
  assert.equal(r.counts.failures, 1);
  assert.equal(r.counts.uploaded, 1);
  assert.match(r.failures[0].reason, /UploadError/);
});

test("NO FILENAME appears in any conflict or failure entry - only line and sha256", async () => {
  const dir = delivery({ [NAME(1)]: "hello" });
  const cp = path.join(tmp(), "cp.jsonl");
  const r = await copyAttachments({
    source: directorySource(dir),
    mapping: { [NAME(1)]: "t/a.pdf", [NAME(9)]: "t/missing.pdf" },
    checkpointFile: cp,
    storage: mockStorage({ existing: new Set(["t/a.pdf"]) }),
  });
  const printed = JSON.stringify({ conflicts: r.conflicts, failures: r.failures, counts: r.counts });
  assert.equal(printed.match(/ZZV\d{3}/g), null, "a filename reached the report");
  for (const e of [...r.conflicts, ...r.failures]) {
    assert.ok(typeof e.line === "number");
    assert.ok("sha256" in e);
  }
});

test("reads a ZIP source entry by entry, inflating without buffering the archive", async () => {
  const { execFileSync } = await import("node:child_process");
  const stage = tmp();
  const inner = path.join(stage, "docs");
  fs.mkdirSync(inner);
  fs.writeFileSync(path.join(inner, NAME(1)), "zipped-content");
  const zip = path.join(tmp(), "d.zip");
  execFileSync("zip", ["-qr", zip, "docs"], { cwd: stage });

  const src = zipSource(zip);
  assert.deepEqual(src.names(), [NAME(1)]);
  const cp = path.join(tmp(), "cp.jsonl");
  const storage = mockStorage();
  const r = await copyAttachments({
    source: src,
    mapping: { [NAME(1)]: "t/a.pdf" },
    checkpointFile: cp,
    storage,
  });
  src.close();
  assert.equal(r.counts.uploaded, 1);
  assert.equal(storage.uploaded.get("t/a.pdf"), "zipped-content".length);
});

test("the checkpoint survives a truncated final line", async () => {
  // Expected after a kill -9 mid-write. The entry re-uploads, which is safe
  // only because the re-upload path re-verifies existence first.
  const cp = path.join(tmp(), "cp.jsonl");
  fs.writeFileSync(cp, '{"storagePath":"t/a.pdf","sha256":"x","status":"uploaded"}\n{"storagePa');
  const { byPath } = readCheckpoint(cp);
  assert.equal(byPath.size, 1);
  assert.equal(byPath.get("t/a.pdf").line, 1);
});
