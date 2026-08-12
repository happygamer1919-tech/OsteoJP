import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * emitConfirmedNotification — the recipient rule, and the fact that it can never
 * turn a successful confirm into a reported failure.
 *
 * WHAT IT IS FOR. Reception's pedido queue is a live query on state
 * (listPendingRequests filters `status = 'scheduled'`), so a therapist accepting
 * a pedido made the row VANISH with nothing written anywhere — indistinguishable
 * from cancelled, or from never there. This fan-out is the record.
 *
 * THE ACTOR EXCLUSION IS THE LOAD-BEARING PART. Reception receives this
 * fan-out too, so without it a receptionist confirming a pedido would be
 * notified of their own click, and the queue would get noisier rather than more
 * truthful. That is why it has its own test with its own negative arm.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));

/** Rows the two SELECTs return, in call order: reception, then practitioners. */
let selectResults: { id: string }[][] = [];
let inserted: Record<string, unknown>[] | null = null;
let insertThrows: Error | null = null;

const db = {
  select: () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      where: async () => selectResults.shift() ?? [],
    };
    return chain;
  },
  insert: () => ({
    values: (v: Record<string, unknown>[]) => ({
      onConflictDoNothing: async () => {
        if (insertThrows) throw insertThrows;
        inserted = v;
        return [];
      },
    }),
  }),
};

vi.mock("@osteojp/db", () => ({
  getDbAdmin: () => db,
  appointments: {},
  patients: {},
  roles: {},
  staffNotifications: {},
  users: { id: "id", tenantId: "tenant_id", isActive: "is_active", roleId: "role_id" },
}));

import { emitConfirmedNotification } from "./centre";

const BASE = {
  tenantId: "tenant-A",
  actorUserId: "actor-1",
  appointmentId: "appt-1",
  patientId: "patient-1",
  startsAt: new Date("2026-09-01T09:00:00.000Z"),
  occurredAt: new Date("2026-09-01T08:00:00.000Z"),
};

beforeEach(() => {
  selectResults = [];
  inserted = null;
  insertThrows = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("emitConfirmedNotification", () => {
  it("writes one row per recipient, carrying the actor and the kind", async () => {
    selectResults = [[{ id: "reception-1" }, { id: "reception-2" }], [{ id: "therapist-1" }]];
    const r = await emitConfirmedNotification({ ...BASE, practitionerIds: ["therapist-1"] });
    expect(r).toEqual({ delivered: true });
    expect(inserted).toHaveLength(3);
    for (const row of inserted!) {
      expect(row.kind).toBe("confirmed");
      expect(row.actorUserId).toBe("actor-1");
      expect(row.tenantId).toBe("tenant-A");
      // A confirmation moves nothing: both instants are the appointment's start.
      expect(row.previousStartsAt).toEqual(BASE.startsAt);
      expect(row.newStartsAt).toEqual(BASE.startsAt);
    }
    expect(new Set(inserted!.map((r) => r.recipientUserId))).toEqual(
      new Set(["reception-1", "reception-2", "therapist-1"]),
    );
  });

  it("DEDUPLICATES a therapist who also holds the reception role", async () => {
    selectResults = [[{ id: "both-1" }], [{ id: "both-1" }]];
    await emitConfirmedNotification({ ...BASE, practitionerIds: ["both-1"] });
    expect(inserted).toHaveLength(1);
  });

  it("notifies BOTH assigned therapists for a dual-participant service (WF-05)", async () => {
    selectResults = [[], [{ id: "therapist-1" }, { id: "therapist-2" }]];
    await emitConfirmedNotification({
      ...BASE,
      practitionerIds: ["therapist-1", "therapist-2"],
    });
    expect(new Set(inserted!.map((r) => r.recipientUserId))).toEqual(
      new Set(["therapist-1", "therapist-2"]),
    );
  });

  it("reports delivered:false, and warns, when it reaches NOBODY", async () => {
    // A therapist confirming their own pedido in a tenant with no other active
    // reception user. Reaching nobody is a real condition, not a silent no-op.
    selectResults = [[], []];
    const r = await emitConfirmedNotification({ ...BASE, practitionerIds: ["actor-1"] });
    expect(r).toEqual({ delivered: false });
    expect(inserted).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("NEVER throws — a failed notification is not a failed confirmation", async () => {
    // The appointment is already confirmed by the time this runs. Surfacing a
    // notification failure as a confirm failure would invite reception to
    // confirm it twice.
    selectResults = [[{ id: "reception-1" }], []];
    insertThrows = new Error("connection reset");
    const r = await emitConfirmedNotification({ ...BASE, practitionerIds: [] });
    expect(r).toEqual({ delivered: false });
    expect(console.error).toHaveBeenCalled();
  });

  // ================================================================
  // THE SOURCE ARM. The mocked db above cannot see a WHERE clause, so the
  // actor exclusion — the whole reason this function differs from apps/api's —
  // is asserted on the source. Without this, deleting both `ne(...)` calls
  // would leave every test above green.
  // ================================================================
  it("excludes the actor from BOTH recipient queries", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "centre.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const fn = src.slice(src.indexOf("export async function emitConfirmedNotification"));
    expect(fn.length).toBeGreaterThan(500); // vacuous-pass guard on the slice
    const exclusions = fn.match(/ne\(users\.id,\s*args\.actorUserId\)/g) ?? [];
    expect(exclusions).toHaveLength(2);
  });
});
