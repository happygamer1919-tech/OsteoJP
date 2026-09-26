/**
 * CARE-02c: addBookedTherapistsToCareTeam against a fake transaction.
 *
 * What a fake CAN prove, and it is the part a real database cannot be made to
 * show on demand: a failure inside the care-team write never escapes into the
 * booking, and a role the policy refuses never reaches the database at all. The
 * real INSERT, its conflict target and RLS are measured in
 * care-team-auto.db.test.ts.
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

  it("a THERAPIST's own booking never reaches the database: 0091's insert policy would refuse it", async () => {
    const out = await addBookedTherapistsToCareTeam(tx, actor("therapist"), ["a1"]);
    expect(out).toEqual([]);
    expect(h.transactionCalls).toBe(0);
  });

  it("an ADMIN's booking skips the write for the same reason", async () => {
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
