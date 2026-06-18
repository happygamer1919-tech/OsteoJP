import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendCheckpoint,
  loadCheckpoint,
  shouldSkip,
  type CheckpointRecord,
} from "./checkpoint";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fz-cp-"));
  file = join(dir, "checkpoint.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function rec(id: number, status: CheckpointRecord["status"]): CheckpointRecord {
  return {
    id,
    status,
    episodes: 0,
    attachmentsDiscovered: 0,
    attachmentsDownloaded: 0,
    xlsCaptured: false,
    ts: new Date().toISOString(),
  };
}

describe("checkpoint round-trip", () => {
  it("missing file loads as empty", () => {
    expect(loadCheckpoint(join(dir, "nope.jsonl")).byId.size).toBe(0);
  });

  it("appends and reloads, last record wins per id", () => {
    appendCheckpoint(file, rec(10, "error"));
    appendCheckpoint(file, rec(10, "done"));
    appendCheckpoint(file, rec(11, "absent"));
    const state = loadCheckpoint(file);
    expect(state.byId.get(10)?.status).toBe("done");
    expect(state.byId.get(11)?.status).toBe("absent");
  });

  it("tolerates a torn final line from a hard kill", () => {
    writeFileSync(file, JSON.stringify(rec(1, "done")) + "\n" + '{"id":2,"status":"do');
    const state = loadCheckpoint(file);
    expect(state.byId.get(1)?.status).toBe("done");
    expect(state.byId.has(2)).toBe(false);
  });
});

describe("shouldSkip", () => {
  it("skips done and absent, always re-attempts error and unseen ids", () => {
    appendCheckpoint(file, rec(1, "done"));
    appendCheckpoint(file, rec(2, "absent"));
    appendCheckpoint(file, rec(3, "error"));
    const state = loadCheckpoint(file);
    expect(shouldSkip(state, 1)).toBe(true);
    expect(shouldSkip(state, 2)).toBe(true);
    expect(shouldSkip(state, 3)).toBe(false); // errored → retried
    expect(shouldSkip(state, 99)).toBe(false); // never seen
  });
});
