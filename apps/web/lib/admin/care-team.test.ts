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
}));

vi.mock("./audit", () => ({
  writeAudit: async (_tx: unknown, _actor: unknown, entry: Record<string, unknown>) => {
    h.audits.push(entry as never);
  },
}));

vi.mock("@osteojp/db", () => ({
  patientCareTeam: { id: "id", patientId: "patient_id", userId: "user_id", assignedAt: "assigned_at", removedAt: "removed_at" },
  users: { id: "id", fullName: "full_name" },
}));

// The transaction seam. Each builder returns the shape the module chains onto.
vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_actor: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    // TWO SELECTS RUN HERE AND THEY MUST ANSWER DIFFERENTLY. The first asks
    // whether the therapist exists; the second asks whether they are ALREADY on
    // the team. A mock that returns one row for both makes `assignTherapist`
    // take its idempotent early return, so no insert and no audit happen and the
    // test reads as a broken product. (It did, on the first run of this file.)
    let selects = 0;
    const tx = {
      select: () => {
        selects += 1;
        const first = selects === 1;
        return {
          from: () => ({
            innerJoin: () => ({ where: () => ({ orderBy: async () => [] }) }),
            where: () => ({
              limit: async () =>
                first
                  ? h.userExists
                    ? [{ id: "u1" }]
                    : []
                  : h.live.map((l) => ({ id: `${l.patientId}:${l.userId}` })),
            }),
          }),
        };
      },
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

import { assignTherapist, removeTherapist } from "./care-team";

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
    h.updatedRows = 0;
    await removeTherapist(actor("reception"), "p1", "u1");
    expect(h.audits).toHaveLength(0);
  });

  it("a THERAPIST cannot remove either", async () => {
    await expect(removeTherapist(actor("therapist"), "p1", "u1")).rejects.toThrow();
    expect(h.audits).toHaveLength(0);
  });
});
