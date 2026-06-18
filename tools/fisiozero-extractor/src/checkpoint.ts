// tools/fisiozero-extractor/src/checkpoint.ts
//
// Resume/idempotency checkpoint — the extractor's OWN local store, deliberately
// NOT the tenant-scoped 0014 migration ledger (see docs/DECISIONS.md 2026-06-18,
// conflicts C2/C4). Append-only JSON Lines: one line per processed id, written
// after the patient's archive + manifest are fully on disk. A kill mid-run loses
// at most the in-flight patient; on restart that id simply has no line and is
// re-archived (idempotent overwrite).
//
// States: pending (implicit — no row yet), done, absent (deleted/gapped id),
// error (failed after retries).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type CheckpointStatus = "done" | "absent" | "error";

export type CheckpointRecord = {
  id: number;
  status: CheckpointStatus;
  episodes: number;
  attachmentsDiscovered: number;
  attachmentsDownloaded: number;
  xlsCaptured: boolean;
  /** PII-free reason code on error (never raw source values). */
  errorCode?: string;
  ts: string;
};

/** Parsed checkpoint state: last record wins per id. */
export type CheckpointState = {
  byId: Map<number, CheckpointRecord>;
};

/** Read the checkpoint file into memory. Missing file → empty state. */
export function loadCheckpoint(path: string): CheckpointState {
  const byId = new Map<number, CheckpointRecord>();
  if (!existsSync(path)) return { byId };
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: CheckpointRecord;
    try {
      rec = JSON.parse(trimmed) as CheckpointRecord;
    } catch {
      continue; // tolerate a torn final line from a hard kill
    }
    if (typeof rec.id === "number") byId.set(rec.id, rec);
  }
  return { byId };
}

/**
 * Should this id be skipped on resume? Per the dispatch, ONLY `done` and `absent`
 * are terminal and skipped. `error` (and a never-seen id) is always re-attempted —
 * re-archiving is idempotent, so retrying a previously-failed id is safe.
 */
export function shouldSkip(state: CheckpointState, id: number): boolean {
  const rec = state.byId.get(id);
  if (!rec) return false;
  return rec.status === "done" || rec.status === "absent";
}

/** Append one record to the checkpoint file (creating parent dirs as needed). */
export function appendCheckpoint(path: string, record: CheckpointRecord): void {
  const dir = dirname(path);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
}
