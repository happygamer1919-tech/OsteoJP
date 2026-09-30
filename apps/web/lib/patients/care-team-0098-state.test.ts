import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("../auth/context", () => ({ runScoped: vi.fn() }));

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

import { CARE_TEAM_CLINIC_HELPER } from "./care-team-reads-gate";
import { care0098State } from "./care-team-0098-state";

/**
 * CARE-02a (0098 v2): the contract the apps/web DB-gated "0098:" arms stand
 * on. They assert whichever profile the database owes, so this reader is the
 * only thing between "0098 is not here yet" and "0098 is broken", and it must
 * never let a broken or missing 0098 through as the pre-0098 profile:
 *
 *   OK        the helper and all three SELECT policies naming it: applied.
 *   OK        neither, and 0098 not promoted: not applied, REPORTED as such.
 *   FAIL      anything in between (half applied), or a policy missing.
 *   FAIL      not applied once any file in packages/db/migrations defines the
 *             helper: from the promotion on, the pre-0098 answer is refused.
 */
type Policy = { tablename: string; policyname: string; names_helper: boolean };
const ALL: Array<[string, string]> = [
  ["patients", "patients_select"],
  ["clinical_records", "clinical_records_select"],
  ["patient_care_team", "patient_care_team_select"],
];

function database(helper: boolean, naming: number, present = ALL.length) {
  const policies: Policy[] = ALL.slice(0, present).map(([t, p], i) => ({
    tablename: t,
    policyname: p,
    names_helper: i < naming,
  }));
  let call = 0;
  const seen: SQL[] = [];
  return {
    seen,
    execute: async (q: SQL) => {
      seen.push(q);
      return call++ === 0 ? [{ present: helper }] : policies;
    },
  };
}

const MAIN = { "0093_patient_rgpd_acceptances.sql": "create table ..." };
const PROMOTED = {
  ...MAIN,
  "0098_care02a_care_team_reads.sql": `CREATE OR REPLACE FUNCTION public.${CARE_TEAM_CLINIC_HELPER}() ...`,
};

describe("care0098State: which 0098 the database has, and whether it may lack it", () => {
  beforeEach(() => {
    disk.files = { ...MAIN };
  });

  it("OK: the helper and all three policies naming it is APPLIED", async () => {
    const s = await care0098State(database(true, 3));
    expect(s).toMatchObject({ applied: true, promoted: false });
    expect(s.detail).toMatch(/^0098 APPLIED/);
  });

  it("OK, AND SAID OUT LOUD: neither, before promotion, is NOT APPLIED and the detail says the run proves nothing about 0098", async () => {
    const s = await care0098State(database(false, 0));
    expect(s).toMatchObject({ applied: false, promoted: false });
    expect(s.detail).toMatch(/^0098 NOT APPLIED/);
    expect(s.detail).toMatch(/proves nothing about 0098/);
  });

  it("FAIL: the helper without every policy naming it is HALF applied", async () => {
    for (const naming of [0, 1, 2]) {
      await expect(care0098State(database(true, naming))).rejects.toThrow(/HALF APPLIED/);
    }
  });

  it("FAIL: policies naming a helper that is absent is HALF applied too", async () => {
    await expect(care0098State(database(false, 1))).rejects.toThrow(/HALF APPLIED/);
  });

  it("FAIL: a missing SELECT policy is unreadable, never 'not applied'", async () => {
    await expect(care0098State(database(false, 0, 2))).rejects.toThrow(/UNREADABLE/);
  });

  it("FAIL: once a migration in packages/db/migrations defines the helper, a database without it is refused", async () => {
    disk.files = { ...PROMOTED };
    await expect(care0098State(database(false, 0))).rejects.toThrow(/PROMOTED .* DOES NOT HAVE IT/);
  });

  it("OK: promoted AND applied is the post-promotion profile, and names the promoted file", async () => {
    disk.files = { ...PROMOTED };
    const s = await care0098State(database(true, 3));
    expect(s).toMatchObject({ applied: true, promoted: true });
    expect(s.detail).toContain("0098_care02a_care_team_reads.sql");
  });
});
