/**
 * survey-rows.test.ts: SAT-01 (S11). ONE PATIENT'S SURVEY SENDS FOR THE FICHA:
 * WHEN THE SECTION IS OFFERED, AND THAT IT IS THE LIST'S OWN READ.
 *
 * `readPatientSurveyRows` adds no rule about who reads which send: that is the
 * database's, measured in `lib/surveys/survey-list.db.test.ts`. What is pinned
 * here is everything around the read, with the read replaced by a recorder and
 * the switch real (`lib/reminders/survey-mode.ts`, reading the real variable):
 *   - off, unset and every near-miss value: null for every role, nothing read;
 *   - canary and on: every staff role is given the read's rows, for THIS
 *     patient and with the viewer's own context;
 *   - a role without `surveys:read`, and an id that is not an id: null,
 *     nothing read;
 *   - more sends than one page: every page is read, in order, once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  /** Every send the stubbed read holds, newest first. */
  all: [] as Array<{ sendId: string }>,
  pageSize: 50,
  calls: [] as Array<{ ctx: unknown; opts: { patientId?: string | null; page?: number; month?: string | null } }>,
  /** Capabilities the matrix is made to withhold, for the one arm that needs it. */
  withheld: [] as string[],
  asked: [] as string[],
}));

// The real permission matrix, with one capability removable: every staff role
// holds `surveys:read` today, so "a role without it" cannot be found, only made.
vi.mock("@osteojp/auth", async (original) => {
  const actual = await original<typeof import("@osteojp/auth")>();
  return {
    ...actual,
    can: (role: Parameters<typeof actual.can>[0], capability: Parameters<typeof actual.can>[1]) => {
      h.asked.push(capability);
      return !h.withheld.includes(capability) && actual.can(role, capability);
    },
  };
});

vi.mock("@/lib/surveys/survey-list", () => ({
  // The list's paging, as `listSurveySends` does it: the page asked for is
  // clamped to the last one.
  listSurveySends: async (ctx: unknown, opts: { patientId?: string | null; page?: number }) => {
    h.calls.push({ ctx, opts });
    const pageCount = Math.max(1, Math.ceil(h.all.length / h.pageSize));
    const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
    return {
      rows: h.all.slice((page - 1) * h.pageSize, page * h.pageSize),
      total: h.all.length,
      page,
      pageSize: h.pageSize,
      pageCount,
    };
  },
}));

import type { Role } from "@osteojp/auth";
import { readPatientSurveyRows } from "./survey-rows";

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const ROLES: Role[] = ["owner", "admin", "reception", "therapist"];
const ctxOf = (role: Role) => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  role,
  userId: "22222222-2222-4222-8222-222222222222",
});
const sendsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ sendId: `send-${i + 1}` }));

const saved = process.env.SURVEY_SEND_MODE;
beforeEach(() => {
  h.all = sendsOf(2);
  h.pageSize = 50;
  h.calls = [];
  h.withheld = [];
  h.asked = [];
  process.env.SURVEY_SEND_MODE = "on";
});
afterEach(() => {
  if (saved === undefined) delete process.env.SURVEY_SEND_MODE;
  else process.env.SURVEY_SEND_MODE = saved;
});

describe("while the survey is switched off there is no section, and nothing is read", () => {
  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true", "1"])(
    "SURVEY_SEND_MODE=%j: null for every role",
    async (mode) => {
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      for (const role of ROLES) {
        expect(await readPatientSurveyRows(ctxOf(role), PATIENT), role).toBeNull();
      }
      expect(h.calls).toEqual([]);

      // CONTROL: the same call with the survey on reads, and returns the rows.
      process.env.SURVEY_SEND_MODE = "on";
      expect(await readPatientSurveyRows(ctxOf("owner"), PATIENT)).toHaveLength(2);
      expect(h.calls).toHaveLength(1);
    },
  );
});

describe.each(["canary", "on"])("SURVEY_SEND_MODE=%s", (mode) => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = mode;
  });

  it.each(ROLES)("%s is given the list's rows for this patient, read with their own context", async (role) => {
    const ctx = ctxOf(role);
    expect(await readPatientSurveyRows(ctx, PATIENT)).toEqual(sendsOf(2));
    expect(h.calls).toEqual([{ ctx, opts: { patientId: PATIENT, page: 1 } }]);
  });

  it("no send the viewer reads: an empty list, which is not null", async () => {
    h.all = [];
    expect(await readPatientSurveyRows(ctxOf("therapist"), PATIENT)).toEqual([]);
    expect(h.calls).toHaveLength(1);
  });

  it("the canary list of patients plays no part: the read is not asked about it", async () => {
    const savedList = process.env.SURVEY_CANARY_PATIENT_IDS;
    try {
      process.env.SURVEY_CANARY_PATIENT_IDS = "99999999-9999-4999-8999-999999999999";
      expect(await readPatientSurveyRows(ctxOf("reception"), PATIENT)).toHaveLength(2);
    } finally {
      if (savedList === undefined) delete process.env.SURVEY_CANARY_PATIENT_IDS;
      else process.env.SURVEY_CANARY_PATIENT_IDS = savedList;
    }
  });
});

it("a role without surveys:read gets no section, and nothing is read", async () => {
  h.withheld = ["surveys:read"];
  for (const role of ROLES) expect(await readPatientSurveyRows(ctxOf(role), PATIENT), role).toBeNull();
  expect(h.calls).toEqual([]);
  // It was this capability that was asked for, and no other.
  expect([...new Set(h.asked)]).toEqual(["surveys:read"]);

  // CONTROL: with the matrix as it is, the same roles read.
  h.withheld = [];
  for (const role of ROLES) expect(await readPatientSurveyRows(ctxOf(role), PATIENT), role).toHaveLength(2);
});

it.each(["", "not-an-id", `${PATIENT} or true`, "4444aaaa-4444-4444-8444-44444444bbb"])(
  "an id that is not an id (%j) gets no section, and nothing is read",
  async (id) => {
    expect(await readPatientSurveyRows(ctxOf("owner"), id)).toBeNull();
    expect(h.calls).toEqual([]);
  },
);

it("more sends than one page: every page is read once, in order, and every send is returned", async () => {
  h.pageSize = 3;
  h.all = sendsOf(8);
  const rows = await readPatientSurveyRows(ctxOf("owner"), PATIENT);
  expect(rows).toEqual(sendsOf(8));
  expect(h.calls.map((c) => c.opts)).toEqual([
    { patientId: PATIENT, page: 1 },
    { patientId: PATIENT, page: 2 },
    { patientId: PATIENT, page: 3 },
  ]);
});

it("exactly one full page is read once, not twice", async () => {
  h.pageSize = 3;
  h.all = sendsOf(3);
  expect(await readPatientSurveyRows(ctxOf("owner"), PATIENT)).toEqual(sendsOf(3));
  expect(h.calls).toHaveLength(1);
});
