/**
 * CARE-02c: addBookedTherapistsToCareTeam against a fake transaction.
 *
 * What a fake CAN prove, and it is the part a real database cannot be made to
 * show on demand: a failure inside the care-team write never escapes into the
 * booking, a role the policy refuses never reaches the database at all, and a
 * therapist's booking puts only the therapist's own row in the statement. The
 * real INSERT, its conflict target and RLS are measured in
 * apps/web/lib/scheduling/care-team-booking.db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  audits: [] as { action: string; entityType: string; entityId?: string | null; metadata?: unknown }[],
  shared: [] as { id: string }[],
  rows: [] as Record<string, unknown>[],
  /** What RETURNING yields: the rows the INSERT really wrote. */
  written: [] as { id: string; patientId: string; userId: string }[],
  valuesSeen: [] as Record<string, unknown>[][],
  conflictSeen: [] as unknown[],
  transactionCalls: 0,
  failWith: null as Error | null,
}));

vi.mock("./audit", () => ({
  writeAudit: async (_tx: unknown, _actor: unknown, entry: Record<string, unknown>) => {
    h.audits.push(entry as never);
  },
}));
vi.mock("@/lib/scheduling/shared-resources", () => ({
  listSharedResourcesTx: async () => h.shared,
}));

// 0098's helper decides whether a therapist's OWN row is attempted at all
// (care-team-auto.ts). Present by default here; one arm below turns it off.
const helper = vi.hoisted(() => ({ present: true, calls: 0 }));
vi.mock("../patients/care-team-reads-gate", () => ({
  careTeamClinicHelperPresentOn: vi.fn(async () => {
    helper.calls += 1;
    return helper.present;
  }),
}));

import { addBookedTherapistsToCareTeam } from "./care-team-auto";

const sp = {
  select: () => ({ from: () => ({ where: async () => h.rows }) }),
  insert: () => ({
    values: (v: Record<string, unknown>[]) => {
      h.valuesSeen.push(v);
      return {
        onConflictDoNothing: (cfg: unknown) => {
          h.conflictSeen.push(cfg);
          return { returning: async () => h.written };
        },
      };
    },
  }),
};

const tx = {
  transaction: async (fn: (s: typeof sp) => Promise<unknown>) => {
    h.transactionCalls += 1;
    if (h.failWith) throw h.failWith;
    return fn(sp);
  },
} as never;

const actor = (role: string) => ({ tenantId: "t1", role, userId: "actor-1" }) as never;
const T0 = new Date("2027-03-10T10:00:00.000Z");

beforeEach(() => {
  h.audits.length = 0;
  h.shared = [];
  h.rows = [
    {
      id: "a1",
      startsAt: T0,
      patientId: "pA",
      patientTwoId: null,
      practitionerId: "t1",
      practitionerTwoId: null,
    },
  ];
  h.written = [{ id: "ct-1", patientId: "pA", userId: "t1" }];
  h.valuesSeen.length = 0;
  h.conflictSeen.length = 0;
  h.transactionCalls = 0;
  h.failWith = null;
});

describe("addBookedTherapistsToCareTeam", () => {
  it("reception: writes the pair, audits it as AUTOMATIC by the row's own id, returns the addition", async () => {
    const out = await addBookedTherapistsToCareTeam(tx, actor("reception"), ["a1"]);
    expect(out).toEqual([
      { patientId: "pA", userId: "t1", appointmentId: "a1", startsAt: T0, careTeamId: "ct-1" },
    ]);
    expect(h.valuesSeen[0]).toEqual([
      { tenantId: "t1", patientId: "pA", userId: "t1", assignedBy: "actor-1" },
    ]);
    expect(h.audits).toEqual([
      {
        action: "care_team.auto_assign",
        entityType: "patient_care_team",
        entityId: "ct-1",
        metadata: { patientId: "pA", therapistId: "t1", appointmentId: "a1" },
      },
    ]);
  });

  it("targets the LIVE-unique index: ON CONFLICT on (tenant, patient, user) WHERE removed_at IS NULL", async () => {
    await addBookedTherapistsToCareTeam(tx, actor("owner"), ["a1"]);
    const cfg = h.conflictSeen[0] as { target: { name: string }[]; where: unknown };
    expect(cfg.target.map((c) => c.name)).toEqual(["tenant_id", "patient_id", "user_id"]);
    expect(cfg.where).toBeDefined();
  });

  it("ALREADY ON THE TEAM: the insert writes nothing, so no audit and no addition (first time only)", async () => {
    h.written = [];
    const out = await addBookedTherapistsToCareTeam(tx, actor("reception"), ["a1"]);
    expect(out).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("CARE-02a: a THERAPIST booking THEMSELVES writes their own row, audited as automatic (0098's own-row arm)", async () => {
    h.rows[0]!.practitionerId = "actor-1";
    h.written = [{ id: "ct-own", patientId: "pA", userId: "actor-1" }];
    const out = await addBookedTherapistsToCareTeam(tx, actor("therapist"), ["a1"]);
    expect(h.valuesSeen[0]).toEqual([
      { tenantId: "t1", patientId: "pA", userId: "actor-1", assignedBy: "actor-1" },
    ]);
    expect(out).toEqual([
      { patientId: "pA", userId: "actor-1", appointmentId: "a1", startsAt: T0, careTeamId: "ct-own" },
    ]);
    expect(h.audits.map((a) => a.entityId)).toEqual(["ct-own"]);
  });

  it("CARE-02a: a therapist's booking carries ONLY their own row: a colleague in the Terapeuta 2 slot is not written", async () => {
    // One refused pair would sink the whole INSERT, own row included, so the
    // colleague's row is never put in the statement at all.
    h.rows[0]!.practitionerId = "actor-1";
    h.rows[0]!.practitionerTwoId = "colleague";
    h.written = [{ id: "ct-own", patientId: "pA", userId: "actor-1" }];
    await addBookedTherapistsToCareTeam(tx, actor("therapist"), ["a1"]);
    expect(h.valuesSeen[0]!.map((v) => v.userId)).toEqual(["actor-1"]);
  });

  it("CARE-02a: before 0098 is applied a therapist's self-booking attempts NO own row (the insert policy would refuse it); owner and reception never ask", async () => {
    helper.present = false;
    try {
      h.rows[0]!.practitionerId = "actor-1";
      h.written = [{ id: "ct-own", patientId: "pA", userId: "actor-1" }];
      const callsBefore = helper.calls;
      const out = await addBookedTherapistsToCareTeam(tx, actor("therapist"), ["a1"]);
      expect(out).toEqual([]);
      expect(h.valuesSeen).toEqual([]);
      expect(h.audits).toEqual([]);
      expect(helper.calls).toBe(callsBefore + 1);
      // reception's reach is "any": it writes as before and never asks.
      h.written = [{ id: "ct-r", patientId: "pA", userId: "actor-1" }];
      await addBookedTherapistsToCareTeam(tx, actor("reception"), ["a1"]);
      expect(helper.calls).toBe(callsBefore + 1);
      expect(h.valuesSeen.length).toBe(1);
    } finally {
      helper.present = true;
    }
  });

  it("CARE-02a: a therapist's booking that does not name them writes nothing at all", async () => {
    // practitioner "t1" is not the actor.
    const out = await addBookedTherapistsToCareTeam(tx, actor("therapist"), ["a1"]);
    expect(out).toEqual([]);
    expect(h.valuesSeen).toEqual([]);
  });

  it("CARE-02a: both patients of a shared booking get the therapist's own row", async () => {
    h.rows[0]!.practitionerId = "actor-1";
    h.rows[0]!.patientTwoId = "pB";
    h.written = [];
    await addBookedTherapistsToCareTeam(tx, actor("therapist"), ["a1"]);
    expect(h.valuesSeen[0]!.map((v) => [v.patientId, v.userId])).toEqual([
      ["pA", "actor-1"],
      ["pB", "actor-1"],
    ]);
  });

  it("an ADMIN's booking never reaches the database: 0091 and 0098 both exclude admin", async () => {
    expect(await addBookedTherapistsToCareTeam(tx, actor("admin"), ["a1"])).toEqual([]);
    expect(h.transactionCalls).toBe(0);
  });

  it("A FAILURE NEVER ESCAPES: it returns nothing and logs the error NAME only", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.failWith = Object.assign(new Error("patient Maria Silva +351912345678"), { name: "PostgresError" });
    await expect(addBookedTherapistsToCareTeam(tx, actor("reception"), ["a1"])).resolves.toEqual([]);
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("PostgresError");
    expect(logged).not.toContain("Maria");
    expect(logged).not.toContain("912345678");
    spy.mockRestore();
  });

  it("NESA on the row is not added; the person beside it is", async () => {
    h.shared = [{ id: "nesa" }];
    h.rows[0]!.practitionerTwoId = "nesa";
    await addBookedTherapistsToCareTeam(tx, actor("reception"), ["a1"]);
    expect(h.valuesSeen[0]!.map((v) => v.userId)).toEqual(["t1"]);
  });

  it('"primary" (a reschedule) looks at the Terapeuta slot only', async () => {
    h.rows[0]!.practitionerTwoId = "t2";
    await addBookedTherapistsToCareTeam(tx, actor("reception"), ["a1"], { slots: "primary" });
    expect(h.valuesSeen[0]!.map((v) => v.userId)).toEqual(["t1"]);
  });

  it("no ids, no work", async () => {
    expect(await addBookedTherapistsToCareTeam(tx, actor("reception"), [])).toEqual([]);
    expect(h.transactionCalls).toBe(0);
  });
});
