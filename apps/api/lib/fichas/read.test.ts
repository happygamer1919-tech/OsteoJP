import { describe, expect, it, vi, beforeEach } from "vitest";

// read.ts is `server-only`; neutralize the guard for the node test.
vi.mock("server-only", () => ({}));

const { runAsPatient } = vi.hoisted(() => ({ runAsPatient: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ runAsPatient }));

import { listOwnFichas, PATIENT_VISIBLE_STATUSES } from "./read";

const SENTINEL = "PRIVATE_NOTE_LEAK";

// A fake tx whose select chain resolves to the given rows.
function fakeTxReturning(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  };
  return { select: () => chain };
}

const PRINCIPAL = { tenantId: "t-A", patientId: "p-1", userId: "sub-1" };

beforeEach(() => runAsPatient.mockReset());

describe("listOwnFichas", () => {
  it("runs through runAsPatient (self-scope) and REDACTS each row", async () => {
    const rows = [
      {
        id: "rec-1",
        status: "signed",
        version: 1,
        episodeId: "ep-1",
        createdAt: new Date("2026-05-20T09:30:00Z"),
        signedAt: new Date("2026-05-21T16:00:00Z"),
        data: { private_notes: SENTINEL, diagnosis: "x" },
      },
    ];
    runAsPatient.mockImplementation((...args: unknown[]) => {
      const fn = args[1];
      // Guard the spurious zero-arg spy call @osteojp/db import provokes.
      if (typeof fn !== "function") return undefined;
      return (fn as (tx: unknown) => unknown)(fakeTxReturning(rows));
    });

    const fichas = await listOwnFichas(PRINCIPAL);

    expect(runAsPatient).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fichas)).not.toContain(SENTINEL);
    expect(JSON.stringify(fichas)).not.toContain("private_notes");
    expect(fichas[0].data).toEqual({});
    expect(fichas[0].id).toBe("rec-1");
  });

  it("gates on finalized statuses only (no drafts/in-review)", () => {
    expect(PATIENT_VISIBLE_STATUSES).toEqual(["locked", "signed"]);
    expect(PATIENT_VISIBLE_STATUSES).not.toContain("draft");
  });
});
