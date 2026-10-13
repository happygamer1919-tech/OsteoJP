import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";

/**
 * The migrations directory, as the state reader sees it. Each test sets which
 * files exist and what they say; the real directory is not read.
 */
const disk = vi.hoisted(() => ({ files: {} as Record<string, string> }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: vi.fn(() => Object.keys(disk.files)),
    readFileSync: vi.fn((p: string) => {
      const name = String(p).split(/[\\/]/).pop()!;
      if (!(name in disk.files)) throw new Error(`no such file in the fake migrations dir: ${name}`);
      return disk.files[name]!;
    }),
  };
});

import { EPISODE_PATIENT_TENANT_KEY } from "./episode-key-refusal";
import { episodeKeyState } from "./episode-key-state";

/**
 * REG-03: the contract the schema-aware arms stand on. They assert whichever
 * refusal the database owes, so this reader must never report a broken or
 * missing key as "not carried":
 *
 *   OK        a validated foreign key of that name to clinical_episodes: carried.
 *   OK        no constraint of that name, and no promoted migration names it:
 *             not carried, REPORTED as such.
 *   FAIL      a constraint of that name that is anything else (half there).
 *   FAIL      not carried once any file in packages/db/migrations names the key.
 */
type Row = { contype: string; validated: boolean; referenced: string };
const KEY_ROW: Row = { contype: "f", validated: true, referenced: "clinical_episodes" };

function database(rows: Row[]) {
  const seen: SQL[] = [];
  return {
    seen,
    execute: async (q: SQL) => {
      seen.push(q);
      return rows;
    },
  };
}

const MAIN = { "0102_sat01_satisfaction_survey.sql": "create table ..." };
const PROMOTED = { ...MAIN, "9999_the_key.sql": `ALTER TABLE x ADD CONSTRAINT ${EPISODE_PATIENT_TENANT_KEY} ...` };

describe("episodeKeyState: whether the database carries the episode key, and whether it may lack it", () => {
  beforeEach(() => {
    disk.files = { ...MAIN };
  });

  it("OK: a validated foreign key of that name to clinical_episodes is CARRIED", async () => {
    const db = database([KEY_ROW]);
    const s = await episodeKeyState(db);
    expect(s).toMatchObject({ carried: true, promoted: false });
    expect(s.detail).toMatch(/^THE DATABASE CARRIES /);
    expect(db.seen).toHaveLength(1);
  });

  it("OK: the catalogue may answer with the schema-qualified table name", async () => {
    expect((await episodeKeyState(database([{ ...KEY_ROW, referenced: "public.clinical_episodes" }]))).carried).toBe(true);
  });

  it("OK: no constraint of that name, and nothing promoted, is NOT CARRIED, and the line says so", async () => {
    const s = await episodeKeyState(database([]));
    expect(s).toMatchObject({ carried: false, promoted: false });
    expect(s.detail).toMatch(/^THE DATABASE DOES NOT CARRY /);
    expect(s.detail).toContain("says nothing about the key itself");
  });

  it("OK: carried and promoted names the file", async () => {
    disk.files = { ...PROMOTED };
    const s = await episodeKeyState(database([KEY_ROW]));
    expect(s).toMatchObject({ carried: true, promoted: true });
    expect(s.detail).toContain("9999_the_key.sql");
  });

  it("FAIL: a constraint of that name that is not validated, not a foreign key, or to another table THROWS", async () => {
    for (const row of [
      { ...KEY_ROW, validated: false },
      { ...KEY_ROW, contype: "c" },
      { ...KEY_ROW, contype: "u" },
      { ...KEY_ROW, referenced: "patients" },
      { ...KEY_ROW, referenced: "other.clinical_episodes" },
    ]) {
      await expect(episodeKeyState(database([row])), JSON.stringify(row)).rejects.toThrow(/HALF THERE/);
    }
  });

  it("FAIL: more than one constraint of that name THROWS", async () => {
    await expect(episodeKeyState(database([KEY_ROW, KEY_ROW]))).rejects.toThrow(/STATE UNREADABLE/);
  });

  it("FAIL: not carried once a promoted migration names the key THROWS, and names the file", async () => {
    disk.files = { ...PROMOTED };
    await expect(episodeKeyState(database([]))).rejects.toThrow(/IS PROMOTED \(9999_the_key\.sql names /);
  });

  it("a file that is not .sql, or a .sql that does not name the key, promotes nothing", async () => {
    disk.files = { ...MAIN, "notes.md": EPISODE_PATIENT_TENANT_KEY, "9998_other.sql": "create index ..." };
    expect(await episodeKeyState(database([]))).toMatchObject({ carried: false, promoted: false });
  });
});
