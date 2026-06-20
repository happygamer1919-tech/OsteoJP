/**
 * journal-sync.test.ts
 *
 * Pure filesystem test — no DB required, always runs.
 *
 * Guards against the drift that occurred when migrations 0008-0019 were
 * hand-authored and applied to prod without being registered in
 * _journal.json. If a future migration SQL file is added without a
 * matching journal entry (or vice versa), this test turns red before any
 * code ships.
 *
 * Invariants:
 *   1. Every *.sql in migrations/ (excluding meta/) has a journal entry
 *      whose tag matches the filename stem.
 *   2. Every journal entry has a matching .sql file on disk.
 *   3. idx values are contiguous: 0, 1, 2, … N-1.
 *   4. Journal entries are sorted by idx ascending.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta/_journal.json");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function loadJournal(): Journal {
  return JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as Journal;
}

function sqlFileTags(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => path.basename(f, ".sql"))
    .sort();
}

describe("migration journal sync", () => {
  it("_journal.json is valid JSON with an entries array", () => {
    const journal = loadJournal();
    expect(Array.isArray(journal.entries)).toBe(true);
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("idx values are contiguous starting at 0", () => {
    const { entries } = loadJournal();
    const idxList = entries.map((e) => e.idx);
    const expected = Array.from({ length: entries.length }, (_, i) => i);
    expect(idxList).toEqual(expected);
  });

  it("entries are sorted by idx ascending", () => {
    const { entries } = loadJournal();
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.idx).toBeGreaterThan(entries[i - 1]!.idx);
    }
  });

  it("every .sql file has a matching journal entry", () => {
    const tags = sqlFileTags();
    const journalTags = new Set(loadJournal().entries.map((e) => e.tag));
    const missing = tags.filter((t) => !journalTags.has(t));
    expect(missing).toEqual([]);
  });

  it("every journal entry has a matching .sql file on disk", () => {
    const { entries } = loadJournal();
    const onDisk = new Set(sqlFileTags());
    const missing = entries.filter((e) => !onDisk.has(e.tag)).map((e) => e.tag);
    expect(missing).toEqual([]);
  });

  it("sql file count matches journal entry count", () => {
    const tags = sqlFileTags();
    const { entries } = loadJournal();
    expect(tags.length).toBe(entries.length);
  });
});
