/**
 * CARE-02b and CARE-02c: the pure rules behind "booking a therapist puts them on
 * the care team once, with a notice". The database half (the INSERT, its
 * conflict target, RLS) is measured against a real Postgres in
 * apps/web/lib/scheduling/care-team-booking.db.test.ts; this file pins the
 * decisions that need none.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES } from "@osteojp/auth";

import {
  CARE_TEAM_AUTO_ACTION,
  CARE_TEAM_ENTITY_TYPE,
  careTeamCandidates,
  careTeamNotices,
  careTeamSource,
  careTeamWriteReach,
  type BookedAppointment,
  type CareTeamAddition,
} from "./care-team-core";

const T0 = new Date("2027-03-10T10:00:00.000Z");
const T1 = new Date("2027-03-17T10:00:00.000Z");
const T2 = new Date("2027-03-24T10:00:00.000Z");

const appt = (over: Partial<BookedAppointment> & { appointmentId: string }): BookedAppointment => ({
  startsAt: T0,
  patientIds: ["pA"],
  practitionerIds: ["t1"],
  ...over,
});

describe("careTeamCandidates: which (patient, therapist) pairs a booking adds", () => {
  it("one appointment, one patient, one therapist: one pair, pointing at that appointment", () => {
    expect(careTeamCandidates([appt({ appointmentId: "a1" })])).toEqual([
      { patientId: "pA", userId: "t1", appointmentId: "a1", startsAt: T0 },
    ]);
  });

  it("BOTH practitioner slots count: a Terapeuta 2 joins too", () => {
    const out = careTeamCandidates([appt({ appointmentId: "a1", practitionerIds: ["t1", "t2"] })]);
    expect(out.map((c) => c.userId).sort()).toEqual(["t1", "t2"]);
  });

  it("BOTH patient slots count: the therapist joins the second participant's team as well", () => {
    const out = careTeamCandidates([appt({ appointmentId: "a1", patientIds: ["pA", "pB"] })]);
    expect(out.map((c) => c.patientId).sort()).toEqual(["pA", "pB"]);
  });

  it("empty slots are ignored, never turned into a pair", () => {
    const out = careTeamCandidates([
      appt({ appointmentId: "a1", patientIds: ["pA", null], practitionerIds: ["t1", undefined, ""] }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("a SHARED RESOURCE (NESA) is not a therapist and never joins automatically", () => {
    const out = careTeamCandidates(
      [appt({ appointmentId: "a1", practitionerIds: ["t1", "nesa"] })],
      new Set(["nesa"]),
    );
    expect(out.map((c) => c.userId)).toEqual(["t1"]);
  });

  it("a NESA-only booking adds nobody", () => {
    const out = careTeamCandidates(
      [appt({ appointmentId: "a1", practitionerIds: ["nesa"] })],
      new Set(["nesa"]),
    );
    expect(out).toEqual([]);
  });

  it("a recurring series is ONE pair, named by its EARLIEST occurrence whatever the input order", () => {
    const out = careTeamCandidates([
      appt({ appointmentId: "a3", startsAt: T2 }),
      appt({ appointmentId: "a1", startsAt: T0 }),
      appt({ appointmentId: "a2", startsAt: T1 }),
    ]);
    expect(out).toEqual([{ patientId: "pA", userId: "t1", appointmentId: "a1", startsAt: T0 }]);
  });

  it("the same therapist named twice on one row is one pair", () => {
    const out = careTeamCandidates([appt({ appointmentId: "a1", practitionerIds: ["t1", "t1"] })]);
    expect(out).toHaveLength(1);
  });
});

describe("careTeamSource: automatic exactly when an auto-assign audit names the row", () => {
  it("names the row -> automatic; does not -> manual", () => {
    const auto = new Set(["row-2"]);
    expect(careTeamSource("row-2", auto)).toBe("automatic");
    expect(careTeamSource("row-1", auto)).toBe("manual");
  });

  it("with no audit rows at all (every row before CARE-02c) everything is manual", () => {
    expect(careTeamSource("legacy", new Set())).toBe("manual");
  });

  it("the audit vocabulary is distinct from CARE-01's manual action", () => {
    expect(CARE_TEAM_AUTO_ACTION).toBe("care_team.auto_assign");
    expect(CARE_TEAM_AUTO_ACTION).not.toBe("care_team.assign");
    expect(CARE_TEAM_ENTITY_TYPE).toBe("patient_care_team");
  });
});

describe("careTeamNotices: first time only, never the actor, one per booking", () => {
  const add = (over: Partial<CareTeamAddition>): CareTeamAddition => ({
    patientId: "pA",
    userId: "t1",
    appointmentId: "a1",
    startsAt: T0,
    careTeamId: "row",
    ...over,
  });

  it("one addition, one notice to that therapist, about that appointment and patient", () => {
    expect(careTeamNotices([add({})], "reception")).toEqual([
      { recipientUserId: "t1", appointmentId: "a1", patientId: "pA", startsAt: T0 },
    ]);
  });

  it("no additions (the therapist was already on the team) means no notice at all", () => {
    expect(careTeamNotices([], "reception")).toEqual([]);
  });

  it("the actor is never notified of their own booking", () => {
    expect(careTeamNotices([add({ userId: "owner-who-treats" })], "owner-who-treats")).toEqual([]);
  });

  it("two patients on one booking add one therapist twice: ONE notice, naming the first patient", () => {
    const out = careTeamNotices(
      [add({ patientId: "pA", careTeamId: "r1" }), add({ patientId: "pB", careTeamId: "r2" })],
      "reception",
    );
    expect(out).toEqual([{ recipientUserId: "t1", appointmentId: "a1", patientId: "pA", startsAt: T0 }]);
  });

  it("two therapists on one booking: one notice each", () => {
    const out = careTeamNotices([add({ userId: "t1" }), add({ userId: "t2" })], "reception");
    expect(out.map((n) => n.recipientUserId).sort()).toEqual(["t1", "t2"]);
  });
});

describe("careTeamWriteReach agrees with 0091's and 0098's insert policies", () => {
  const REPO = join(__dirname, "..", "..", "..", "..");

  /** The statement that sets `patient_care_team_insert`'s check, whitespace folded. */
  function insertPolicyStatement(file: string, verb: "CREATE" | "ALTER"): string {
    const text = readFileSync(file, "utf8");
    const start = text.indexOf(`${verb} POLICY "patient_care_team_insert"`);
    expect(start, `${file} sets no patient_care_team_insert`).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf(";", start)).replace(/\s+/g, " ");
  }

  /** The roles named inside `ARRAY[...]`: the policy's unconditional arm. */
  function anyRowRoles(statement: string): string[] {
    const arr = statement.match(/ARRAY\[([^\]]+)\]/);
    expect(arr).not.toBeNull();
    return [...arr![1]!.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!).sort();
  }

  /**
   * The roles named by a single `jwt_role() ) = '<role>'::text` equality: the
   * own-row arm. Each must sit beside the three conjuncts that make a row the
   * caller's own booking's, or the reader refuses to call it an own-row arm.
   */
  function ownRowRoles(statement: string): string[] {
    const roles = [...statement.matchAll(/jwt_role\(\) \) = '([a-z_]+)'::text/g)].map((m) => m[1]!);
    if (roles.length > 0) {
      expect(statement).toContain("(user_id = ( SELECT auth.uid() ))");
      expect(statement).toContain("(assigned_by = ( SELECT auth.uid() ))");
      expect(statement).toContain(
        "(patient_id = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))",
      );
    }
    return roles.sort();
  }

  /**
   * 0098, WHEREVER IT IS, OR NOWHERE. Held, it is the pending file; promoted,
   * it is migrations/0098_*. The promotion changes no byte, so the same reader
   * reads both. Two copies is a failure, at collection.
   *
   * NOWHERE IS THE APP HALF. By the owner's ruling of 2026-09-27 the app half
   * of CARE-02a merges as its own PR BEFORE the PR that carries 0098, so main
   * holds this test and no 0098 between the two merges. The arms below then
   * NAME that state in their titles and assert what is true of such a tree,
   * never a pass by absence: nothing in migrations or migrations-pending but
   * 0091 sets `patient_care_team_insert`, so 0091's policy is the one this
   * tree ships, and the app's therapist own-row reach is AHEAD of it by design.
   * 0091 refuses that row, and the writer's savepoint confines the refusal so
   * the booking stands, which care-team-booking.db.test.ts asserts on a
   * database without 0098. Once 0098 is in the tree the same arms read it and
   * assert it, with no edit.
   */
  function file0098(): string | null {
    const found = [
      ...readdirSync(join(REPO, "packages", "db", "migrations-pending"))
        .filter((f) => f.endsWith("_care02a_care_team_reads.sql"))
        .map((f) => join(REPO, "packages", "db", "migrations-pending", f)),
      ...readdirSync(join(REPO, "packages", "db", "migrations"))
        .filter((f) => f.endsWith("_care02a_care_team_reads.sql"))
        .map((f) => join(REPO, "packages", "db", "migrations", f)),
    ];
    if (found.length > 1) {
      throw new Error(`0098 (care02a_care_team_reads) must exist at most once, found ${found.length}: ${found.join(", ")}`);
    }
    return found[0] ?? null;
  }

  const file0091 = () => join(REPO, "packages", "db", "migrations", "0091_care_team.sql");

  /** Every .sql in migrations and migrations-pending, other than 0091, that sets the insert policy. */
  function otherInsertPolicyFiles(): string[] {
    return ["migrations", "migrations-pending"].flatMap((dir) =>
      readdirSync(join(REPO, "packages", "db", dir))
        .filter((f) => f.endsWith(".sql") && f !== "0091_care_team.sql")
        .filter((f) => readFileSync(join(REPO, "packages", "db", dir, f), "utf8").includes('POLICY "patient_care_team_insert"'))
        .map((f) => `${dir}/${f}`),
    );
  }

  const F0098 = file0098();
  const TREE =
    F0098 === null
      ? "0098 NOT IN THIS TREE (the app half, merged ahead of its migration)"
      : `0098 IN THIS TREE (${F0098.slice(REPO.length + 1)})`;

  it("0091's insert policy admits exactly owner and reception, with no own-row arm (the reader itself works)", () => {
    const st = insertPolicyStatement(file0091(), "CREATE");
    expect(anyRowRoles(st)).toEqual(["owner", "reception"]);
    expect(ownRowRoles(st)).toEqual([]);
  });

  it(
    F0098 === null
      ? `${TREE}: no file but 0091 sets patient_care_team_insert, so 0091's policy is the one this tree ships`
      : `${TREE}: 0098 keeps owner and reception on the any-row arm and adds the therapist on an own-row arm`,
    () => {
      if (F0098 === null) {
        expect(otherInsertPolicyFiles()).toEqual([]);
        return;
      }
      const st = insertPolicyStatement(F0098, "ALTER");
      expect(anyRowRoles(st)).toEqual(["owner", "reception"]);
      expect(ownRowRoles(st)).toEqual(["therapist"]);
    },
  );

  it(`${TREE}: the app writes ANY row for exactly the any-row roles of 0091${F0098 === null ? "" : " and of 0098"}`, () => {
    const any = ROLES.filter((r) => careTeamWriteReach(r) === "any").sort();
    expect(any).toEqual(anyRowRoles(insertPolicyStatement(file0091(), "CREATE")));
    if (F0098 !== null) expect(any).toEqual(anyRowRoles(insertPolicyStatement(F0098, "ALTER")));
  });

  it(
    F0098 === null
      ? `${TREE}: the app writes an OWN row for the therapist alone, which 0091 refuses (the savepoint confines it; the booking stands)`
      : `${TREE}: the app writes an OWN row for exactly 0098's own-row roles`,
    () => {
      const own = ROLES.filter((r) => careTeamWriteReach(r) === "own").sort();
      if (F0098 === null) {
        expect(own).toEqual(["therapist"]);
        expect(ownRowRoles(insertPolicyStatement(file0091(), "CREATE"))).toEqual([]);
        return;
      }
      expect(own).toEqual(ownRowRoles(insertPolicyStatement(F0098, "ALTER")));
    },
  );

  it(`${TREE}: every other role writes nothing: admin stays excluded, as both migrations rule`, () => {
    expect(careTeamWriteReach("admin")).toBe("none");
    const named = new Set(
      F0098 === null
        ? [...anyRowRoles(insertPolicyStatement(file0091(), "CREATE")), "therapist"]
        : [
            ...anyRowRoles(insertPolicyStatement(F0098, "ALTER")),
            ...ownRowRoles(insertPolicyStatement(F0098, "ALTER")),
          ],
    );
    for (const r of ROLES) {
      if (!named.has(r)) expect(careTeamWriteReach(r), r).toBe("none");
    }
  });
});

describe("the headers point at the DB test that exists", () => {
  it("every *.db.test.ts the care-team unit headers name is a real file", () => {
    const repo = join(__dirname, "..", "..", "..", "..");
    const missing: string[] = [];
    for (const f of ["care-team-core.test.ts", "care-team-auto.test.ts"]) {
      const header = readFileSync(join(__dirname, f), "utf8").split("*/")[0]!;
      const named = header.match(/[\w./-]+\.db\.test\.ts/g) ?? [];
      if (named.length === 0) missing.push(`${f}: names no DB test`);
      for (const n of named) if (!existsSync(join(repo, n))) missing.push(`${f}: ${n}`);
    }
    expect(missing).toEqual([]);
  });
});
