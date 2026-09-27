/**
 * CARE-01 — the capability gate on assigning a care team, and the audit that
 * follows a real change.
 *
 * ==========================================================================
 * THE GATE IS THE FEATURE
 * ==========================================================================
 * A therapist who could assign themselves to a patient would be granting
 * themselves that patient's entire appointment history. Reception is in the loop
 * precisely so that decision is somebody else's, so "therapist is refused" is
 * not a permission detail here - it is the property the whole design rests on.
 *
 * The database refuses the same write through `patient_care_team`'s policies,
 * and the RLS suite measures that independently. This file measures the APP
 * layer, which is the one a caller reaches first.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  /** Rows the fake transaction pretends to hold. */
  live: [] as { patientId: string; userId: string }[],
  audits: [] as { action: string; entityType: string; entityId?: string | null; metadata?: unknown }[],
  inserted: [] as Record<string, unknown>[],
  updatedRows: 1,
  userExists: true,
  /** CARE-02c: care-team row ids an auto-assign audit names (they read "automatic"). */
  autoIds: [] as string[],
  /** CARE-02c: what listCareTeam's join returns. */
  listed: [] as { id: string; userId: string; fullName: string; assignedAt: Date }[],
}));

vi.mock("./audit", () => ({
  writeAudit: async (_tx: unknown, _actor: unknown, entry: Record<string, unknown>) => {
    h.audits.push(entry as never);
  },
}));

vi.mock("@osteojp/db", () => ({
  patientCareTeam: { __t: "care", id: "id", patientId: "patient_id", userId: "user_id", assignedAt: "assigned_at", removedAt: "removed_at" },
  users: { __t: "users", id: "id", fullName: "full_name" },
  auditLog: { __t: "audit", entityId: "entity_id", entityType: "entity_type", action: "action" },
}));

/** An awaitable result that also answers `.limit(n)`, the two shapes the module chains. */
function result<T>(rows: T[]) {
  return Object.assign(Promise.resolve(rows), { limit: async () => rows });
}

// The transaction seam. `from(table)` decides what a read returns, so the ORDER
// of reads inside a function does not matter - an earlier version of this mock
// counted selects, and it broke the moment removeTherapist gained a read.
vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_actor: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: () => ({
        from: (table: { __t: string }) => ({
          innerJoin: () => ({
            where: () => ({ orderBy: async () => h.listed }),
          }),
          where: () => {
            if (table.__t === "users") return result(h.userExists ? [{ id: "u1" }] : []);
            if (table.__t === "audit") return result(h.autoIds.map((id) => ({ id })));
            return result(h.live.map((l) => ({ id: `${l.patientId}:${l.userId}` })));
          },
        }),
      }),
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          h.inserted.push(row);
        },
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => (h.updatedRows > 0 ? [{ id: "row" }] : []),
          }),
        }),
      }),
    };
    return fn(tx);
  },
}));

import { assignTherapist, listCareTeam, removeTherapist } from "./care-team";

const actor = (role: string) => ({ tenantId: "t1", role, userId: "actor1" }) as never;

describe("who may manage a care team", () => {
  beforeEach(() => {
    h.audits.length = 0;
    h.inserted.length = 0;
    h.live.length = 0;
    h.updatedRows = 1;
    h.userExists = true;
  });

  it("A THERAPIST IS REFUSED, which is the whole point of the gate", async () => {
    await expect(assignTherapist(actor("therapist"), "p1", "u1")).rejects.toThrow();
    expect(h.inserted).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it("AN ADMIN IS REFUSED: the dispatch narrowed the spec to reception and owner", async () => {
    // docs/design/SPEC-care-team.md proposes admin as well. The ruling does not,
    // and where they differ the ruling wins. Pinned so a later reading of the
    // spec cannot quietly widen it.
    await expect(assignTherapist(actor("admin"), "p1", "u1")).rejects.toThrow();
    expect(h.inserted).toHaveLength(0);
  });

  it("RECEPTION may assign, and the change is audited", async () => {
    await assignTherapist(actor("reception"), "p1", "u1");
    expect(h.inserted).toHaveLength(1);
    expect(h.audits).toEqual([
      {
        action: "care_team.assign",
        entityType: "patient_care_team",
        entityId: "p1",
        metadata: { therapistId: "u1" },
      },
    ]);
  });

  it("THE OWNER may assign too", async () => {
    await assignTherapist(actor("owner"), "p1", "u1");
    expect(h.inserted).toHaveLength(1);
  });

  it("an unknown therapist id is refused before any write", async () => {
    h.userExists = false;
    await expect(assignTherapist(actor("reception"), "p1", "nope")).rejects.toThrow();
    expect(h.inserted).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it("the audit metadata carries IDS, never a name", async () => {
    await assignTherapist(actor("reception"), "p1", "u1");
    const meta = h.audits[0]!.metadata as Record<string, string>;
    for (const v of Object.values(meta)) {
      expect(v).not.toMatch(/\s/); // the PII contract refuses whitespace
      expect(v.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("removal", () => {
  beforeEach(() => {
    h.audits.length = 0;
    h.updatedRows = 1;
    h.autoIds.length = 0;
    h.live.length = 0;
    h.live.push({ patientId: "p1", userId: "u1" });
  });

  it("RECEPTION may remove, and it is audited", async () => {
    await removeTherapist(actor("reception"), "p1", "u1");
    expect(h.audits).toEqual([
      {
        action: "care_team.remove",
        entityType: "patient_care_team",
        entityId: "p1",
        metadata: { therapistId: "u1" },
      },
    ]);
  });

  it("removing somebody who is NOT on the team writes no audit row", async () => {
    // An audit trail that records non-events is one nobody reads.
    h.live.length = 0;
    h.updatedRows = 0;
    await removeTherapist(actor("reception"), "p1", "u1");
    expect(h.audits).toHaveLength(0);
  });

  it("CARE-02c: an AUTOMATIC entry is refused, before any write", async () => {
    // The panel shows no Remover on an automatic entry; this is the same rule
    // where a hand-built form post cannot reach past it.
    h.autoIds.push("p1:u1");
    await expect(removeTherapist(actor("reception"), "p1", "u1")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(h.audits).toHaveLength(0);
  });

  it("CARE-02c: a MANUAL entry is still removable when another row is automatic", async () => {
    h.autoIds.push("some-other-row");
    await removeTherapist(actor("reception"), "p1", "u1");
    expect(h.audits).toHaveLength(1);
  });

  it("a THERAPIST cannot remove either", async () => {
    await expect(removeTherapist(actor("therapist"), "p1", "u1")).rejects.toThrow();
    expect(h.audits).toHaveLength(0);
  });
});

describe("CARE-02c: the list says which entries a booking wrote", () => {
  beforeEach(() => {
    h.autoIds.length = 0;
    h.listed.length = 0;
  });

  it("labels each row by its own id: automatic when an auto-assign audit names it, manual otherwise", async () => {
    const at = new Date("2026-09-20T10:00:00Z");
    h.listed.push(
      { id: "row-manual", userId: "u1", fullName: "Terapeuta Um", assignedAt: at },
      { id: "row-auto", userId: "u2", fullName: "Terapeuta Dois", assignedAt: at },
    );
    h.autoIds.push("row-auto");
    const team = await listCareTeam(actor("reception"), "p1");
    expect(team).toEqual([
      { userId: "u1", fullName: "Terapeuta Um", assignedAt: at, source: "manual" },
      { userId: "u2", fullName: "Terapeuta Dois", assignedAt: at, source: "automatic" },
    ]);
  });

  it("every row written before CARE-02c reads as manual (no audit names it)", async () => {
    h.listed.push({ id: "legacy", userId: "u1", fullName: "Terapeuta Um", assignedAt: new Date() });
    const team = await listCareTeam(actor("owner"), "p1");
    expect(team.map((m) => m.source)).toEqual(["manual"]);
  });

  it("a therapist still cannot read the list through this function", async () => {
    await expect(listCareTeam(actor("therapist"), "p1")).rejects.toThrow();
  });
});
