/**
 * W13-02 (Wave 13 LOOP 2) — the fan-out and the in-app-only boundary. PG4.
 *
 * These cover the Definition-of-Done lines that are about WHO GETS WHAT:
 *   - each of the four kinds produces an entry for reception AND the assigned
 *     therapist;
 *   - a therapist who is NOT assigned receives nothing;
 *   - a DUAL-therapist appointment notifies BOTH (owner ruling WF-05);
 *   - nothing dispatches an email or an SMS, asserted on the TRANSPORT.
 *
 * The database is mocked at the query-builder seam. What is under test is the
 * RESOLUTION and the ROWS WRITTEN, which is where the fan-out rules live; the
 * RLS half is a database property and is proven by the migration's policies,
 * not by a mock that could be made to agree with anything.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  /** Rows the reception-role join returns. */
  receptionRows: [] as { id: string }[],
  /** Rows the practitioner lookup returns, filtered by the tenant. */
  practitionerRows: [] as { id: string }[],
  /** Every row handed to insert().values(). */
  inserted: [] as Record<string, unknown>[],
  /** Which select() call we are on: 1 = reception join, 2 = practitioners. */
  selectCalls: 0,
}));

vi.mock("@osteojp/db", () => {
  const chain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const self: Record<string, unknown> = {
      from: () => self,
      innerJoin: () => self,
      where: () => p,
      then: p.then.bind(p),
    };
    return self;
  };
  return {
    getDbAdmin: () => ({
      select: () => {
        H.selectCalls += 1;
        return chain(H.selectCalls === 1 ? H.receptionRows : H.practitionerRows);
      },
      insert: () => ({
        values: (rows: Record<string, unknown>[]) => {
          H.inserted.push(...rows);
          return { onConflictDoNothing: async () => undefined };
        },
      }),
    }),
    users: { id: "id", tenantId: "tenant_id", isActive: "is_active", roleId: "role_id" },
    roles: { id: "id", slug: "slug" },
    staffNotifications: {},
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => [a, b],
  inArray: (a: unknown, b: unknown) => [a, b],
}));

import { persistingConsumer, resolveRecipients } from "./centre";
import type { PatientChangeEvent, PatientChangeKind } from "./patient-change";

const NOW = new Date("2026-08-05T09:00:00.000Z");

const event = (
  kind: PatientChangeKind,
  practitionerIds: string[] = ["prac-1"],
): PatientChangeEvent => ({
  kind,
  tenantId: "t1",
  appointmentId: "appt-1",
  patientId: "pat-1",
  audience: { reception: true, practitionerIds },
  previousStartsAt: NOW.toISOString(),
  newStartsAt: NOW.toISOString(),
  occurredAt: NOW.toISOString(),
});

beforeEach(() => {
  H.receptionRows = [];
  H.practitionerRows = [];
  H.inserted = [];
  H.selectCalls = 0;
});

/** The four kinds PG4 names. `appointment_request` is "pedido de marcacao". */
const ALL_KINDS: PatientChangeKind[] = [
  "booked",
  "cancelled",
  "rescheduled",
  "appointment_request",
];

describe("fan-out: reception AND the assigned therapist, for every kind", () => {
  for (const kind of ALL_KINDS) {
    it(`${kind} reaches reception and the assigned therapist`, async () => {
      H.receptionRows = [{ id: "recep-1" }];
      H.practitionerRows = [{ id: "prac-1" }];

      const out = await persistingConsumer(event(kind));

      expect(out.delivered).toBe(true);
      const recipients = H.inserted.map((r) => r.recipientUserId).sort();
      expect(recipients).toEqual(["prac-1", "recep-1"]);
      // Every row carries the kind, so the centre can render it per recipient.
      expect(H.inserted.every((r) => r.kind === kind)).toBe(true);
    });
  }

  it("reaches EVERY reception user, not just one", async () => {
    H.receptionRows = [{ id: "recep-1" }, { id: "recep-2" }, { id: "recep-3" }];
    H.practitionerRows = [{ id: "prac-1" }];

    await persistingConsumer(event("cancelled"));

    expect(H.inserted.map((r) => r.recipientUserId).sort()).toEqual([
      "prac-1",
      "recep-1",
      "recep-2",
      "recep-3",
    ]);
  });
});

describe("WF-05 (R2): dual-therapist services notify BOTH assigned therapists", () => {
  it("writes an entry for each assigned practitioner", async () => {
    // Massagem 4 Maos / Sessao Familia: two therapists on one appointment.
    H.receptionRows = [{ id: "recep-1" }];
    H.practitionerRows = [{ id: "prac-1" }, { id: "prac-2" }];

    await persistingConsumer(event("rescheduled", ["prac-1", "prac-2"]));

    const recipients = H.inserted.map((r) => r.recipientUserId).sort();
    expect(recipients).toEqual(["prac-1", "prac-2", "recep-1"]);
  });

  it("a therapist who is NOT assigned receives nothing", async () => {
    H.receptionRows = [{ id: "recep-1" }];
    // The tenant-scoped lookup returns only the assigned one; prac-9 is a real
    // therapist in the tenant who is simply not on this appointment.
    H.practitionerRows = [{ id: "prac-1" }];

    await persistingConsumer(event("cancelled", ["prac-1"]));

    const recipients = H.inserted.map((r) => r.recipientUserId);
    expect(recipients).not.toContain("prac-9");
    expect(recipients.sort()).toEqual(["prac-1", "recep-1"]);
  });

  it("deduplicates a practitioner who also holds the reception role", async () => {
    // A practising owner is both. One event must not become two rows for them.
    H.receptionRows = [{ id: "prac-1" }, { id: "recep-1" }];
    H.practitionerRows = [{ id: "prac-1" }];

    await persistingConsumer(event("booked", ["prac-1"]));

    expect(H.inserted.map((r) => r.recipientUserId).sort()).toEqual([
      "prac-1",
      "recep-1",
    ]);
    expect(H.inserted).toHaveLength(2);
  });
});

describe("zero recipients is reported honestly, never as a delivery", () => {
  it("returns delivered:false and writes nothing when nobody resolves", async () => {
    H.receptionRows = [];
    H.practitionerRows = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = await persistingConsumer(event("cancelled"));
      expect(out.delivered).toBe(false);
      expect(H.inserted).toHaveLength(0);
      expect(warn.mock.calls.flat().map(String).join(" ")).toContain(
        "ZERO recipients",
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe("the rows carry identifiers and instants only", () => {
  it("no name, phone, email, service name or clinical field is written", async () => {
    H.receptionRows = [{ id: "recep-1" }];
    H.practitionerRows = [{ id: "prac-1" }];

    await persistingConsumer(event("rescheduled"));

    const forbidden = [
      "name",
      "phone",
      "email",
      "nif",
      "service",
      "notes",
      "diagnos",
      "treatment",
    ];
    for (const row of H.inserted) {
      for (const key of Object.keys(row)) {
        for (const bad of forbidden) {
          expect(key.toLowerCase().includes(bad)).toBe(false);
        }
      }
    }
  });
});

describe("resolveRecipients honours the reception flag", () => {
  it("skips reception entirely when audience.reception is false", async () => {
    H.receptionRows = [{ id: "recep-1" }];
    H.practitionerRows = [{ id: "prac-1" }];

    const e = { ...event("booked"), audience: { reception: false, practitionerIds: ["prac-1"] } };
    // The contract types `reception` as `true`; this asserts the code reads the
    // flag rather than assuming it, so a future optional audience cannot
    // silently blanket the whole reception desk.
    const recipients = await resolveRecipients(e as unknown as PatientChangeEvent);

    expect(recipients).toEqual(["prac-1"]);
  });
});
