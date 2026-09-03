/**
 * W13-04 — `listPendingRequests`, the reception confirm queue's READ.
 *
 * What is asserted here is the SHAPE the builder emits: which table it starts
 * from, which join makes it a list of pedidos, which predicate keeps a pedido
 * pending, and that one appointment can only produce one queue entry. The
 * DATABASE's answer to the same query — the status exclusions and the
 * per-recipient RLS confinement — is proven separately and against real
 * Postgres in packages/db/tests/pedido-queue.db.test.ts, because neither can be
 * proven by inspecting a query builder.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const H = vi.hoisted(() => ({
  rows: [] as unknown[],
  /** Every `where(...)` predicate, in call order. */
  predicates: [] as unknown[],
  /** Column maps handed to select(). */
  selections: [] as Record<string, unknown>[],
  /** Join specs, in call order: ["inner"|"left", predicate]. */
  joins: [] as [string, unknown][],
  orderBys: [] as unknown[],
}));

vi.mock("server-only", () => ({}));

vi.mock("@osteojp/db", () => ({
  staffNotifications: {
    id: "n.id",
    kind: "n.kind",
    appointmentId: "n.appointment_id",
    patientId: "n.patient_id",
    previousStartsAt: "n.previous_starts_at",
    newStartsAt: "n.new_starts_at",
    occurredAt: "n.occurred_at",
    readAt: "n.read_at",
  },
  appointments: {
    id: "a.id",
    startsAt: "a.starts_at",
    endsAt: "a.ends_at",
    status: "a.status",
    practitionerId: "a.practitioner_id",
    locationId: "a.location_id",
    patientId: "a.patient_id",
    origin: "a.origin",
    createdAt: "a.created_at",
  },
  patients: { id: "p.id", fullName: "p.full_name" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ op: "and", a }),
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  asc: (a: unknown) => ({ op: "asc", a }),
  desc: (a: unknown) => ({ op: "desc", a }),
  isNull: (a: unknown) => ({ op: "isNull", a }),
  sql: Object.assign((strings: TemplateStringsArray) => ({ op: "sql", text: strings.join("") }), {}),
}));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_ctx: unknown, cb: (tx: unknown) => unknown) =>
    cb({
      select: (cols: Record<string, unknown>) => {
        H.selections.push(cols);
        const chain: Record<string, unknown> = {
          from: () => chain,
          innerJoin: (_t: unknown, p: unknown) => {
            H.joins.push(["inner", p]);
            return chain;
          },
          leftJoin: (_t: unknown, p: unknown) => {
            H.joins.push(["left", p]);
            return chain;
          },
          where: (p: unknown) => {
            H.predicates.push(p);
            return chain;
          },
          orderBy: (o: unknown) => {
            H.orderBys.push(o);
            return chain;
          },
          limit: () => Promise.resolve(H.rows),
        };
        return chain;
      },
    }),
  ),
}));

import { listPendingRequests } from "./centre";

const ctx = { tenantId: "tenant-A", role: "reception", userId: "user-1" } as never;

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  notificationId: "n-1",
  appointmentId: "a-1",
  patientId: "p-1",
  patientName: "Paciente Um",
  startsAt: new Date("2026-09-01T09:00:00.000Z"),
  endsAt: new Date("2026-09-01T10:00:00.000Z"),
  practitionerId: "t-1",
  locationId: "l-1",
  requestedAt: new Date("2026-08-30T08:00:00.000Z"),
  ...over,
});

const flat = (p: unknown): string =>
  JSON.stringify(p, (_k, v) => (v instanceof Date ? v.toISOString() : v));

beforeEach(() => {
  H.rows = [];
  H.predicates = [];
  H.selections = [];
  H.joins = [];
  H.orderBys = [];
});

describe("the queue is derived from the appointment_request notification", () => {
  it("selects on appointments.origin, NOT on the notification kind. SR-31", async () => {
    // THE SOURCE MOVED. The queue used to ask the notification whether a pedido
    // existed, so a lost best-effort emit made one invisible. It now asks the
    // appointment, which is written inside the patient's own transaction.
    await listPendingRequests(ctx);
    expect(flat(H.predicates)).toContain("a.origin");
    expect(flat(H.predicates)).toContain("patient_portal");
  });

  it("still narrows the NOTIFICATION join by kind, so an unrelated one cannot attach", async () => {
    // The notification is still joined for its instant; the kind predicate moved
    // from the WHERE into the join condition, where it now belongs.
    await listPendingRequests(ctx);
    const left = H.joins.filter(([k]) => k === "left");
    expect(flat(left)).toContain("appointment_request");
    expect(flat(left)).toContain("n.kind");
  });

  it("has NO inner join at all - appointments is the FROM table now", async () => {
    // A pedido without its appointment is not a thing that can exist any more:
    // the appointment IS the row. There is nothing left to inner join.
    await listPendingRequests(ctx);
    expect(H.joins.filter(([k]) => k === "inner")).toHaveLength(0);
  });

  it("LEFT joins the notification, and that single letter is the whole change", async () => {
    // INNER before SR-31: a pedido whose emit was lost had no notification row,
    // so the join dropped it and reception was never told. LEFT keeps it.
    await listPendingRequests(ctx);
    const left = H.joins.filter(([k]) => k === "left");
    expect(flat(left)).toContain("n.appointment_id");
  });

  it("LEFT joins patients, so a removed patient does not drop the pedido", async () => {
    await listPendingRequests(ctx);
    // TWO left joins now: patients, and the notification that is no longer
    // load-bearing. Both must be LEFT, and neither may be INNER.
    const left = H.joins.filter(([k]) => k === "left");
    expect(left).toHaveLength(2);
    expect(flat(left)).toContain("p.id");
  });
});

describe("a pedido is pending on the LIFECYCLE axis only", () => {
  it("keeps appointments whose status is scheduled", async () => {
    await listPendingRequests(ctx);
    expect(flat(H.predicates)).toContain("a.status");
    expect(flat(H.predicates)).toContain("scheduled");
  });

  it("never reads or writes appointment_confirmation_state", async () => {
    // The corrected-axis ruling: the confirmation axis answers "did the patient
    // reply to the reminder" and belongs to the Twilio webhook. Selecting it
    // here would be the first step to conflating the two.
    await listPendingRequests(ctx);
    expect(flat(H.selections)).not.toContain("confirmation");
    expect(flat(H.predicates)).not.toContain("confirmation");

    const source = readFileSync(join(__dirname, "centre.ts"), "utf-8");
    expect(source).not.toMatch(/confirmationState/);
  });
});

describe("the queue is a worklist, not a log", () => {
  it("orders by the appointment start, soonest first", async () => {
    await listPendingRequests(ctx);
    expect(flat(H.orderBys)).toContain('"op":"asc"');
    expect(flat(H.orderBys)).toContain("a.starts_at");
  });

  it("returns ONE entry per appointment, keeping the earliest request", async () => {
    // Two notification rows for one pedido (a re-emit with a different instant
    // slips past 0055's unique index). Reception must see one decision.
    H.rows = [
      entry({ notificationId: "n-late", requestedAt: new Date("2026-08-31T08:00:00.000Z") }),
      entry({ notificationId: "n-early", requestedAt: new Date("2026-08-30T08:00:00.000Z") }),
    ];

    const out = await listPendingRequests(ctx);

    expect(out).toHaveLength(1);
    expect(out[0].notificationId).toBe("n-early");
  });

  it("keeps distinct appointments and sorts them by start", async () => {
    H.rows = [
      entry({
        notificationId: "n-2",
        appointmentId: "a-2",
        startsAt: new Date("2026-09-02T09:00:00.000Z"),
      }),
      entry({ notificationId: "n-1", appointmentId: "a-1" }),
    ];

    const out = await listPendingRequests(ctx);

    expect(out.map((r) => r.appointmentId)).toEqual(["a-1", "a-2"]);
  });
});

describe("the queue carries no clinical content", () => {
  it("selects identifiers, instants and the joined patient name only", async () => {
    await listPendingRequests(ctx);
    const cols = Object.keys(H.selections[0] ?? {});
    expect(cols.sort()).toEqual(
      [
        "appointmentId",
        "endsAt",
        "locationId",
        "notificationId",
        "patientId",
        "patientName",
        "practitionerId",
        "requestedAt",
        "startsAt",
      ].sort(),
    );
    // A service name identifies a treatment type — the same exclusion the
    // notification centre itself makes, for the same reason.
    expect(flat(H.selections)).not.toContain("service");
  });

  it("the window comes from the APPOINTMENT, not from the notification", async () => {
    // A patient may reschedule a pedido before reception opens the queue. The
    // notification is an immutable record of what happened then; reception must
    // act on the appointment as it stands now.
    await listPendingRequests(ctx);
    const sel = H.selections[0] as Record<string, string>;
    expect(sel.startsAt).toBe("a.starts_at");
    expect(sel.endsAt).toBe("a.ends_at");
    expect(sel.startsAt).not.toBe("n.new_starts_at");
  });
});

describe("the pt-PT copy for the queue exists and does not promise the slot", () => {
  const strings = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "..", "..", "packages/i18n/src/strings.pt.json"), "utf-8"),
  ) as Record<string, string>;

  it("every requests.* key used by the surface is present in pt-PT", () => {
    for (const key of [
      "requests.title",
      "requests.subtitle",
      "requests.empty",
      "requests.emptyHint",
      "requests.confirm",
      "requests.slotNotHeld",
      "requests.error.conflict",
      "requests.error.notFound",
      "requests.error.forbidden",
      "requests.error.generic",
    ]) {
      expect(strings[key], `missing pt-PT string: ${key}`).toBeTruthy();
    }
  });

  it("the conflict failure tells reception the pedido is STILL PENDING", () => {
    // Option B's whole failure path: no write happened, so the pedido has not
    // been lost and reception is the one who proposes an alternative.
    expect(strings["requests.error.conflict"]).toMatch(/pendente/i);
  });

  it("the patient-facing pedido copy states the slot is not reserved yet", () => {
    const portal = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "..", "packages/i18n/src/portal/strings.pt.json"),
        "utf-8",
      ),
    ) as { booking: Record<string, string> };

    // Owner ruling option B: a pedido must not promise the slot.
    expect(portal.booking.pending_body).toMatch(/só fica reservado depois de confirmado/i);
    expect(portal.booking.step_info_pending).toMatch(/só fica reservado depois de confirmado/i);
  });
});
