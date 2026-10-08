import { beforeEach, describe, expect, it, vi } from "vitest";

// SAT-01. THE THREE LISTS ARE ONE LIST. `HARD_DELETE_CLASSES` names the classes,
// `hardDeletePatient` (./actions.ts) counts them to refuse, and
// `getPatientHardDeleteBlockers` (./queries.ts) counts them for the danger
// zone. The read zips its counts onto the class list BY POSITION, so a read out
// of order shows the operator a true number under the wrong name. This suite
// records which table each of the two reads, in order, against a mocked
// transaction, and compares both with the class list.
//
// What a mock cannot say is what each read's WHERE matches or what RLS lets the
// caller count: ./hard-delete-survey.db.test.ts says that for the two survey
// classes, on a real database.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({
  verifyDeletePassword: vi.fn(async () => true),
}));

import { getTableName, type Table } from "drizzle-orm";
import { requireRequestContext, runScoped } from "../auth/context";
import type { RequestContext } from "../auth/context";
import { hardDeletePatient } from "./actions";
import { HARD_DELETE_CLASSES, type HardDeleteClass } from "./hard-delete-preflight";
import { getPatientHardDeleteBlockers } from "./queries";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const owner: RequestContext = { tenantId: "tenant-A", role: "owner", userId: "owner-1" };

/**
 * The table each class is counted in. A `Record` over the class type, so a
 * class added to the list without a table here does not typecheck.
 */
const TABLE_OF: Record<HardDeleteClass, string> = {
  clinicalRecords: "clinical_records",
  clinicalEpisodes: "clinical_episodes",
  appointments: "appointments",
  appointmentNotes: "appointment_notes",
  patientNoteRevisions: "patient_note_revisions",
  invoices: "invoices",
  attachments: "attachments",
  formSubmissions: "patient_form_submissions",
  analyticsEvents: "analytics_events",
  // Merge losers are patients rows that name this patient as their survivor.
  mergeLosers: "patients",
  surveySends: "appointment_survey_sends",
  surveyAnswers: "appointment_survey_responses",
};

const EXPECTED_TABLES = HARD_DELETE_CLASSES.map((key) => TABLE_OF[key]);

/**
 * A transaction that records the table of every select, in the order the
 * selects are built, and answers the k-th select with `rowsFor(k)`. Awaitable
 * directly (the counts) and through `.limit()` (the action's snapshot).
 */
function recordingTx(rowsFor: (index: number) => unknown[]) {
  const tables: string[] = [];
  const tx = {
    select: () => ({
      from: (table: Table) => {
        const index = tables.push(getTableName(table)) - 1;
        const rows = rowsFor(index);
        return {
          where: () => ({
            limit: async () => rows,
            then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) =>
              Promise.resolve(rows).then(res, rej),
          }),
        };
      },
    }),
    delete: () => ({ where: () => ({ returning: async () => [{ id: "patient-1" }] }) }),
  };
  return { tx, tables };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(owner);
});

describe("hard delete: the class list, the action and the danger-zone read count the same classes in the same order", () => {
  it("the class list ends with the two survey classes, sends before answers", () => {
    expect(EXPECTED_TABLES).toHaveLength(12);
    expect(EXPECTED_TABLES.slice(-2)).toEqual([
      "appointment_survey_sends",
      "appointment_survey_responses",
    ]);
  });

  it("hardDeletePatient reads its snapshot, then the twelve classes in list order", async () => {
    const { tx, tables } = recordingTx((index) =>
      index === 0 ? [{ id: "patient-1", patientNumber: 42, deletedAt: null }] : [{ n: 0 }],
    );
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeletePatient("patient-1", "correct-horse");
    expect(r).toEqual({ ok: true, id: "patient-1" });
    expect(tables).toEqual(["patients", ...EXPECTED_TABLES]);
  });

  it("getPatientHardDeleteBlockers reads the twelve classes in list order, and labels each count by its position", async () => {
    // The k-th read answers k + 1, so every class has a count no other class
    // has: a count under the wrong key cannot pass.
    const { tx, tables } = recordingTx((index) => [{ n: index + 1 }]);
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));

    const blockers = await getPatientHardDeleteBlockers("patient-1");
    expect(tables).toEqual(EXPECTED_TABLES);
    expect(blockers.counts).toEqual(
      HARD_DELETE_CLASSES.map((key, index) => ({ key, count: index + 1 })),
    );
    expect(blockers.counts.find((c) => c.key === "surveySends")).toEqual({
      key: "surveySends",
      count: 11,
    });
    expect(blockers.counts.find((c) => c.key === "surveyAnswers")).toEqual({
      key: "surveyAnswers",
      count: 12,
    });
  });

  it("a survey send alone, and a survey answer alone, makes hasOtherReferences true", async () => {
    for (const key of ["surveySends", "surveyAnswers"] as const) {
      const at = HARD_DELETE_CLASSES.indexOf(key);
      const { tx } = recordingTx((index) => [{ n: index === at ? 1 : 0 }]);
      mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));

      const blockers = await getPatientHardDeleteBlockers("patient-1");
      expect(blockers.hasClinicalRecords, key).toBe(false);
      expect(blockers.hasOtherReferences, key).toBe(true);
      expect(blockers.counts.filter((c) => c.count > 0), key).toEqual([{ key, count: 1 }]);
    }
  });
});

// The drift guard of ./queries.ts: the number of reads against the number of
// classes. Shown to be live by giving the read a class list one class short.
describe("hard delete: the drift guard between the class list and the reads", () => {
  it("passes with the lists as they are: twelve reads for twelve classes", async () => {
    const { tx, tables } = recordingTx(() => [{ n: 0 }]);
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));

    const blockers = await getPatientHardDeleteBlockers("patient-1");
    expect(tables).toHaveLength(HARD_DELETE_CLASSES.length);
    expect(blockers.counts).toHaveLength(HARD_DELETE_CLASSES.length);
  });

  it("refuses when the class list is one class short of the reads", async () => {
    vi.resetModules();
    vi.doMock("./hard-delete-preflight", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./hard-delete-preflight")>();
      return { ...actual, HARD_DELETE_CLASSES: actual.HARD_DELETE_CLASSES.slice(0, -1) };
    });
    try {
      const context = await import("../auth/context");
      const { tx } = recordingTx(() => [{ n: 0 }]);
      vi.mocked(context.requireRequestContext).mockResolvedValue(owner);
      vi.mocked(context.runScoped).mockImplementation((_ctx, cb) =>
        Promise.resolve(cb(tx as never)),
      );
      const drifted = await import("./queries");
      await expect(drifted.getPatientHardDeleteBlockers("patient-1")).rejects.toThrow(
        /12 reads for 11 classes - the two lists have drifted/,
      );
    } finally {
      vi.doUnmock("./hard-delete-preflight");
      vi.resetModules();
    }
  });
});
