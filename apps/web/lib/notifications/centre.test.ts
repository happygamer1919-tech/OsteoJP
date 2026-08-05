/**
 * W13-02 (Wave 13 LOOP 2) — the centre's READ half. PG4.
 *
 * Covers the Definition-of-Done lines about the DATA the centre serves:
 *   - the unread count is DERIVED FROM DATA, never a client-only counter;
 *   - marking read is idempotent and does not move an existing timestamp;
 *   - the list never selects a service name or any clinical field;
 *   - the empty and error states are staff-readable pt-PT, not a stack trace.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const H = vi.hoisted(() => ({
  rows: [] as unknown[],
  countRows: [{ n: 0 }] as { n: number }[],
  /** Every `where(...)` predicate the code built, in call order. */
  predicates: [] as unknown[],
  /** Every `set(...)` payload. */
  sets: [] as Record<string, unknown>[],
  /** Column maps handed to select(). */
  selections: [] as Record<string, unknown>[],
  updates: 0,
}));

vi.mock("server-only", () => ({}));

vi.mock("@osteojp/db", () => ({
  staffNotifications: {
    id: "id",
    kind: "kind",
    appointmentId: "appointment_id",
    patientId: "patient_id",
    previousStartsAt: "previous_starts_at",
    newStartsAt: "new_starts_at",
    occurredAt: "occurred_at",
    readAt: "read_at",
  },
  patients: { id: "id", fullName: "full_name" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ op: "and", a }),
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  desc: (a: unknown) => ({ op: "desc", a }),
  isNull: (a: unknown) => ({ op: "isNull", a }),
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({ op: "sql", text: strings.join("") }),
    {},
  ),
}));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_ctx: unknown, cb: (tx: unknown) => unknown) =>
    cb({
      select: (cols: Record<string, unknown>) => {
        H.selections.push(cols);
        const isCount = "n" in cols;
        const chain: Record<string, unknown> = {
          from: () => chain,
          leftJoin: () => chain,
          orderBy: () => chain,
          limit: () => Promise.resolve(H.rows),
          where: (p: unknown) => {
            H.predicates.push(p);
            return Promise.resolve(isCount ? H.countRows : H.rows);
          },
        };
        return chain;
      },
      update: () => ({
        set: (payload: Record<string, unknown>) => {
          H.sets.push(payload);
          return {
            where: async (p: unknown) => {
              H.predicates.push(p);
              H.updates += 1;
            },
          };
        },
      }),
    }),
  ),
}));

import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "./centre";

const ctx = { tenantId: "t1", role: "reception", userId: "u1" } as never;

beforeEach(() => {
  H.rows = [];
  H.countRows = [{ n: 0 }];
  H.predicates = [];
  H.sets = [];
  H.selections = [];
  H.updates = 0;
});

describe("the unread count is DERIVED FROM DATA", () => {
  it("is a COUNT over read_at IS NULL, not a stored or client-held number", () => {
    // The DoD forbids "a client-only counter that a reload resets". The proof
    // that it cannot be one: the count is produced by a SQL count() over a
    // NULL-check on read_at, so the badge and the list are two reads of the same
    // column and cannot disagree.
    return unreadCount(ctx).then(() => {
      const sel = H.selections.find((s) => "n" in s);
      expect(sel).toBeDefined();
      expect(String((sel as { n: { text: string } }).n.text)).toContain("count(*)");

      const pred = H.predicates.at(-1) as { op: string; a: unknown };
      expect(pred.op).toBe("isNull");
      expect(pred.a).toBe("read_at");
    });
  });

  it("returns the counted number, and 0 when the query yields no row", async () => {
    H.countRows = [{ n: 7 }];
    expect(await unreadCount(ctx)).toBe(7);

    H.countRows = [];
    expect(await unreadCount(ctx)).toBe(0);
  });
});

describe("marking read is idempotent and never rewrites history", () => {
  it("markRead only touches rows that are still unread", async () => {
    await markRead(ctx, "n1");
    expect(H.updates).toBe(1);
    // The predicate is (id = n1 AND read_at IS NULL): re-marking an already-read
    // entry matches nothing, so "when did I first see this" survives a second
    // click rather than being moved forward.
    const pred = H.predicates.at(-1) as { op: string; a: unknown[] };
    expect(pred.op).toBe("and");
    expect(JSON.stringify(pred.a)).toContain("isNull");
  });

  it("markAllRead sets read_at only where it is null", async () => {
    await markAllRead(ctx);
    const pred = H.predicates.at(-1) as { op: string; a: unknown };
    expect(pred.op).toBe("isNull");
    expect(pred.a).toBe("read_at");
  });

  it("the only column ever written is read_at", async () => {
    await markRead(ctx, "n1");
    await markAllRead(ctx);
    for (const payload of H.sets) {
      expect(Object.keys(payload)).toEqual(["readAt"]);
    }
  });
});

describe("the list carries no service name and no clinical field", () => {
  it("selects identifiers, instants and the joined patient name only", async () => {
    await listNotifications(ctx);
    const sel = H.selections.find((s) => "kind" in s);
    expect(sel).toBeDefined();

    const keys = Object.keys(sel as Record<string, unknown>);
    // The patient NAME is joined for the render; staff are entitled to it. A
    // SERVICE name is forbidden outright — several identify a treatment type.
    expect(keys).toContain("patientName");
    for (const bad of ["service", "notes", "diagnos", "treatment", "phone", "email", "nif"]) {
      expect(keys.some((k) => k.toLowerCase().includes(bad))).toBe(false);
    }
  });
});

describe("the empty and error states are staff-readable pt-PT", () => {
  const PAGE = readFileSync(
    join(__dirname, "../../app/notificacoes/page.tsx"),
    "utf8",
  );
  const PT = JSON.parse(
    readFileSync(
      join(__dirname, "../../../../packages/i18n/src/strings.pt.json"),
      "utf8",
    ),
  ) as Record<string, string>;

  it("EMPTY is rendered as its own state, distinct from a failure", () => {
    // INC-05: a broken deployment rendered "you have no appointments" for a
    // FAILED fetch, and no gate could see it. Loaded-and-empty gets its own
    // words here for exactly that reason.
    expect(PAGE).toContain('s["notifications.empty"]');
    expect(PAGE).toContain('s["notifications.emptyHint"]');
    expect(PT["notifications.empty"]).toBe("Sem notificações.");
    expect(PT["notifications.emptyHint"]).toBe(
      "As alterações feitas pelos pacientes aparecem aqui.",
    );
  });

  it("every notification string exists in pt-PT and none is an English fallback", () => {
    const keys = Object.keys(PT).filter((k) => k.startsWith("notifications."));
    expect(keys.length).toBeGreaterThanOrEqual(16);
    for (const k of keys) {
      expect(PT[k]).toBeTruthy();
      expect(PT[k]).not.toMatch(/^(TODO|FIXME|\?\?\?)/);
    }
    // A stack trace is never a user-facing string.
    expect(PT["notifications.error"]).toBe(
      "Não foi possível carregar as notificações. Atualize a página.",
    );
  });

  it("the page renders no service name", () => {
    expect(PAGE).not.toContain("serviceName");
    expect(PAGE).not.toContain("service.name");
  });
});
