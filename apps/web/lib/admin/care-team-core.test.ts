/**
 * CARE-02b and CARE-02c: the pure rules behind "booking a therapist puts them on
 * the care team once, with a notice". The database half (the INSERT, its
 * conflict target, RLS) is measured against a real Postgres in
 * apps/web/lib/scheduling/care-team-booking.db.test.ts; this file pins the
 * decisions that need none.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES } from "@osteojp/auth";

import {
  CARE_TEAM_AUTO_ACTION,
  CARE_TEAM_ENTITY_TYPE,
  canWriteCareTeamUnderCurrentPolicy,
  careTeamCandidates,
  careTeamNotices,
  careTeamSource,
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

describe("canWriteCareTeamUnderCurrentPolicy agrees with 0091's insert policy", () => {
  /**
   * The roles `patient_care_team_insert` admits, READ FROM THE MIGRATION rather
   * than restated here. If the policy or the capability moves without the other,
   * this reddens: the alternative is an RLS refusal inside a booking (a role
   * the app thinks may write) or a silent skip (a role the policy would admit).
   */
  function insertPolicyRoles(): string[] {
    const file = readFileSync(
      join(__dirname, "..", "..", "..", "..", "packages", "db", "migrations", "0091_care_team.sql"),
      "utf8",
    );
    const start = file.indexOf('CREATE POLICY "patient_care_team_insert"');
    expect(start).toBeGreaterThan(-1);
    const body = file.slice(start, file.indexOf(";", start));
    const arr = body.match(/ARRAY\[([^\]]+)\]/);
    expect(arr).not.toBeNull();
    return [...arr![1]!.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!).sort();
  }

  it("the migration's insert policy admits exactly owner and reception (the reader itself works)", () => {
    expect(insertPolicyRoles()).toEqual(["owner", "reception"]);
  });

  it("the app writes for exactly the roles the policy admits, and skips every other role", () => {
    const writes = ROLES.filter((r) => canWriteCareTeamUnderCurrentPolicy(r)).sort();
    expect(writes).toEqual(insertPolicyRoles());
  });

  it("a therapist's own booking and an admin's booking skip the write (the reported gap)", () => {
    expect(canWriteCareTeamUnderCurrentPolicy("therapist")).toBe(false);
    expect(canWriteCareTeamUnderCurrentPolicy("admin")).toBe(false);
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
