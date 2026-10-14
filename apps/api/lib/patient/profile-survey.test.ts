/**
 * profile-survey.test.ts: SAT-01 (S8), the patient's own survey switch in the
 * profile library, against a recording transaction.
 *
 * WHAT THIS FILE CAN SAY, AND WHAT IT CANNOT. It reads the real switch module
 * through the real environment variable, so it says for which patient the
 * switch is offered, and it records what `getOwnProfile` and
 * `updateOwnProfile` ask the transaction for: which columns are selected, which
 * are set, and whether the survey statement is issued at all. It cannot say
 * that the database lets the patient do it, or stops another patient: that is
 * `profile-survey.db.test.ts`, against real rows as the real `patient` role.
 *
 * The ids below are made up. No real patient id is in this repository.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runAsPatient } = vi.hoisted(() => ({ runAsPatient: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ runAsPatient }));

import { getOwnProfile, ownSurveySwitchOffered, toProfileDTO, updateOwnProfile } from "./profile";

const LISTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOT_LISTED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TENANT = "11111111-1111-4111-8111-111111111111";
const principal = (patientId: string) => ({ tenantId: TENANT, patientId, userId: "u-1" });

const ROW = {
  fullName: "Paciente Fixture",
  email: "paciente@fixture.test",
  phone: null,
  address: null,
  postalCode: null,
  city: null,
  reminderSmsEnabled: true,
  reminderEmailEnabled: false,
};

type Recorded = {
  /** The keys of every `select({...})`, in order. */
  selects: string[][];
  /** The keys of every `update().set({...})`, in order. */
  sets: string[][];
  /** How many raw statements were executed. */
  executes: number;
  /** Each raw statement as the database would receive it: text and parameters. */
  statements: { sql: string; params: unknown[] }[];
};

/** A transaction that records what it is asked and answers every read with `row`. */
function recordingTx(row: Record<string, unknown> | null) {
  const seen: Recorded = { selects: [], sets: [], executes: 0, statements: [] };
  const read = (fields: Record<string, unknown>) => {
    seen.selects.push(Object.keys(fields));
    const b: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit"]) b[m] = () => b;
    // Answer with exactly the selected keys, as a database would.
    const answer = row ? [Object.fromEntries(Object.keys(fields).map((k) => [k, row[k]]))] : [];
    b.then = (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(answer).then(ok, no);
    return b;
  };
  const tx = {
    select: read,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        seen.sets.push(Object.keys(values));
        return { where: async () => undefined };
      },
    }),
    execute: async (statement: SQL) => {
      seen.executes += 1;
      const { sql, params } = new PgDialect().sqlToQuery(statement);
      seen.statements.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return [];
    },
  };
  runAsPatient.mockImplementation(async (_p: unknown, fn: (t: unknown) => unknown) => fn(tx));
  return seen;
}

const saved = { mode: process.env.SURVEY_SEND_MODE, list: process.env.SURVEY_CANARY_PATIENT_IDS };
function setSwitch(mode: string | undefined, list?: string) {
  if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
  else process.env.SURVEY_SEND_MODE = mode;
  if (list === undefined) delete process.env.SURVEY_CANARY_PATIENT_IDS;
  else process.env.SURVEY_CANARY_PATIENT_IDS = list;
}

beforeEach(() => setSwitch(undefined));
afterEach(() => setSwitch(saved.mode, saved.list));

/** Every setting under which THIS patient is not offered the switch. */
const NOT_OFFERED: { name: string; mode: string | undefined; list?: string; patient: string }[] = [
  { name: "unset", mode: undefined, patient: LISTED },
  { name: "off", mode: "off", patient: LISTED },
  { name: "off, with the patient on the list", mode: "off", list: LISTED, patient: LISTED },
  { name: "unset, with the patient on the list", mode: undefined, list: LISTED, patient: LISTED },
  { name: "a near-miss of on (ON)", mode: "ON", patient: LISTED },
  { name: "a near-miss of on (trailing space)", mode: "on ", patient: LISTED },
  { name: "a near-miss of on (true)", mode: "true", patient: LISTED },
  { name: "a near-miss of canary (Canary)", mode: "Canary", list: LISTED, patient: LISTED },
  { name: "empty", mode: "", patient: LISTED },
  { name: "canary, no list", mode: "canary", patient: LISTED },
  { name: "canary, an empty list", mode: "canary", list: "", patient: LISTED },
  { name: "canary, the patient not on the list", mode: "canary", list: LISTED, patient: NOT_LISTED },
];

/** Every setting under which THIS patient is offered it. */
const OFFERED: { name: string; mode: string; list?: string; patient: string }[] = [
  { name: "on", mode: "on", patient: LISTED },
  { name: "on, a patient on no list", mode: "on", list: LISTED, patient: NOT_LISTED },
  { name: "canary, the patient on the list", mode: "canary", list: `${NOT_LISTED},${LISTED}`, patient: LISTED },
  { name: "canary, the list in another letter case", mode: "canary", list: LISTED.toUpperCase(), patient: LISTED },
];

describe("ownSurveySwitchOffered: for which patient the switch exists", () => {
  it.each(NOT_OFFERED)("not offered: $name", ({ mode, list, patient }) => {
    setSwitch(mode, list);
    expect(ownSurveySwitchOffered(principal(patient))).toBe(false);
  });

  it.each(OFFERED)("offered: $name", ({ mode, list, patient }) => {
    setSwitch(mode, list);
    expect(ownSurveySwitchOffered(principal(patient))).toBe(true);
  });
});

describe("getOwnProfile: the survey switch is in the profile only when offered", () => {
  it.each(NOT_OFFERED)("not offered ($name): the column is not read and the key is absent", async ({ mode, list, patient }) => {
    setSwitch(mode, list);
    const seen = recordingTx({ ...ROW, id: patient, surveyEnabled: false });
    const profile = await getOwnProfile(principal(patient));
    expect(profile).not.toBeNull();
    expect(profile).not.toHaveProperty("surveyEnabled");
    expect(seen.selects).toHaveLength(1);
    expect(seen.selects[0]).not.toContain("surveyEnabled");
    // The profile is otherwise whole: the reminder switches are there.
    expect(profile).toMatchObject({ reminderSmsEnabled: true, reminderEmailEnabled: false });
  });

  it.each(OFFERED)("offered ($name): the key carries the stored value, off or on", async ({ mode, list, patient }) => {
    setSwitch(mode, list);
    for (const stored of [false, true]) {
      const seen = recordingTx({ ...ROW, id: patient, surveyEnabled: stored });
      const profile = await getOwnProfile(principal(patient));
      expect(seen.selects[0]).toContain("surveyEnabled");
      expect(profile).toMatchObject({ surveyEnabled: stored, reminderSmsEnabled: true, reminderEmailEnabled: false });
    }
  });

  it("the mapping never invents the key: a row without the column gives a profile without it", () => {
    const dto = toProfileDTO({ ...ROW, id: LISTED });
    expect(dto).not.toHaveProperty("surveyEnabled");
    expect(toProfileDTO({ ...ROW, id: LISTED, surveyEnabled: false })).toHaveProperty("surveyEnabled", false);
  });
});

describe("updateOwnProfile: the survey switch is written only when offered, and alone", () => {
  it.each(NOT_OFFERED)("not offered ($name): no statement sets it, and the answer carries no key", async ({ mode, list, patient }) => {
    setSwitch(mode, list);
    const seen = recordingTx({ ...ROW, id: patient, surveyEnabled: true });
    const profile = await updateOwnProfile(principal(patient), { surveyEnabled: false });
    expect(seen.executes).toBe(0);
    expect(seen.sets).toEqual([]);
    expect(profile).not.toHaveProperty("surveyEnabled");
  });

  it("not offered, beside another field: the other field is set and the switch is not", async () => {
    setSwitch("off");
    const seen = recordingTx({ ...ROW, id: LISTED });
    await updateOwnProfile(principal(LISTED), { city: "Oeiras", surveyEnabled: false });
    expect(seen.sets).toEqual([["city"]]);
    expect(seen.executes).toBe(0);
  });

  it.each(OFFERED)("offered ($name): one statement of its own, and no reminder switch is set", async ({ mode, list, patient }) => {
    setSwitch(mode, list);
    for (const value of [false, true]) {
      const seen = recordingTx({ ...ROW, id: patient, surveyEnabled: value });
      const profile = await updateOwnProfile(principal(patient), { surveyEnabled: value });
      expect(seen.executes).toBe(1);
      // The typed update, the one that can name the reminder switches, did not run.
      expect(seen.sets).toEqual([]);
      expect(profile).toMatchObject({ surveyEnabled: value });
    }
  });

  it("the survey statement, whole: one column set, the session's own patient and tenant in its condition", async () => {
    // The row policy already confines the patient role to its own row (proven
    // in profile-survey.db.test.ts). The statement says so itself as well, and
    // this pins every word of it: nothing else is set, nothing else is aimed at.
    setSwitch("on");
    for (const value of [false, true]) {
      const seen = recordingTx({ ...ROW, id: LISTED, surveyEnabled: value });
      await updateOwnProfile(principal(LISTED), { surveyEnabled: value });
      expect(seen.statements).toEqual([
        {
          sql:
            'update "patients" set "survey_enabled" = $1 ' +
            'where "patients"."id" = $2::uuid and "patients"."tenant_id" = $3::uuid',
          params: [value, LISTED, TENANT],
        },
      ]);
    }
  });

  it("offered, beside the reminder switches: each is set by its own statement", async () => {
    setSwitch("on");
    const seen = recordingTx({ ...ROW, id: LISTED, surveyEnabled: false });
    await updateOwnProfile(principal(LISTED), { reminderSmsEnabled: false, surveyEnabled: false });
    expect(seen.sets).toEqual([["reminderSmsEnabled"]]);
    expect(seen.executes).toBe(1);
  });

  it("a reminder switch alone never issues the survey statement, offered or not", async () => {
    for (const mode of ["off", "on"]) {
      setSwitch(mode);
      const seen = recordingTx({ ...ROW, id: LISTED, surveyEnabled: true });
      await updateOwnProfile(principal(LISTED), { reminderEmailEnabled: true });
      expect(seen.sets).toEqual([["reminderEmailEnabled"]]);
      expect(seen.executes).toBe(0);
    }
  });
});
