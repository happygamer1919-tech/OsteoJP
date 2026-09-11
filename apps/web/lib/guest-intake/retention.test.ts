import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { resetGuestIntakeSchemaCache } from "@osteojp/db";
import {
  RETENTION_LOG_PREFIX,
  runGuestIntakeRetention,
  type StepRunner,
} from "./retention";

/**
 * INTAKE-01 - the retention driver against a FAKE executor that records every
 * statement. The real SQL is proven in retention.db.test.ts; this suite proves
 * the ORCHESTRATION: nothing is called while the table is absent, one call per
 * tenant with the tenant bound as a parameter, and a log line of counts only.
 */

const dialect = new PgDialect();

function fakeDb(opts: { present: boolean; tenants: string[]; purged: Record<string, number> }) {
  const statements: { text: string; params: unknown[] }[] = [];
  const db = {
    execute: async (q: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(q);
      statements.push({ text, params });
      if (text.includes("information_schema.tables")) return [{ present: opts.present }];
      if (text.includes("from public.tenants")) return opts.tenants.map((id) => ({ id }));
      if (text.includes("purge_expired_guest_intakes")) {
        return [{ purged: opts.purged[params[0] as string] ?? 0 }];
      }
      throw new Error("unexpected statement");
    },
  };
  return { db, statements };
}

const T1 = "aaaaaaaa-0000-4000-8000-000000000001";
const T2 = "aaaaaaaa-0000-4000-8000-000000000002";

beforeEach(() => resetGuestIntakeSchemaCache());

describe("0087 NOT APPLIED: the job touches nothing", () => {
  it("answers table_absent after ONE statement, the catalogue check", async () => {
    const { db, statements } = fakeDb({ present: false, tenants: [T1], purged: { [T1]: 3 } });
    const lines: string[] = [];
    const out = await runGuestIntakeRetention(db, { log: (l) => lines.push(l) });
    expect(out).toEqual({ ran: false, reason: "table_absent" });
    expect(statements).toHaveLength(1);
    expect(statements.some((s) => s.text.includes("purge_expired_guest_intakes"))).toBe(false);
    expect(statements.some((s) => s.text.includes("tenants"))).toBe(false);
    expect(lines).toEqual([`${RETENTION_LOG_PREFIX} table absent`]);
  });

  it("negative control: with the table present the same harness DOES see the purge", async () => {
    const { db, statements } = fakeDb({ present: true, tenants: [T1], purged: {} });
    await runGuestIntakeRetention(db, { log: () => {} });
    expect(statements.some((s) => s.text.includes("purge_expired_guest_intakes"))).toBe(true);
  });
});

describe("0087 APPLIED: one call per tenant, counts summed", () => {
  it("calls the function once per tenant, the tenant BOUND, never interpolated", async () => {
    const { db, statements } = fakeDb({ present: true, tenants: [T1, T2], purged: { [T1]: 2, [T2]: 0 } });
    const out = await runGuestIntakeRetention(db, { log: () => {} });
    expect(out).toEqual({ ran: true, tenants: 2, purged: 2 });
    const purges = statements.filter((s) => s.text.includes("purge_expired_guest_intakes"));
    expect(purges.map((p) => p.params)).toEqual([[T1], [T2]]);
    for (const p of purges) {
      expect(p.text).toContain("$1::uuid");
      expect(p.text).not.toContain(T1);
      expect(p.text).not.toContain(T2);
    }
  });

  it("no tenants: ran, zero of each, and no purge call", async () => {
    const { db, statements } = fakeDb({ present: true, tenants: [], purged: {} });
    expect(await runGuestIntakeRetention(db, { log: () => {} })).toEqual({ ran: true, tenants: 0, purged: 0 });
    expect(statements.some((s) => s.text.includes("purge_expired_guest_intakes"))).toBe(false);
  });

  it("every unit of work is a named step, one per tenant, so a failure retries one tenant", async () => {
    const { db } = fakeDb({ present: true, tenants: [T1, T2], purged: {} });
    const ids: string[] = [];
    const step: StepRunner = (id, fn) => {
      ids.push(id);
      return fn();
    };
    await runGuestIntakeRetention(db, { step, log: () => {} });
    expect(ids).toEqual(["check-table", "list-tenants", `purge-tenant-${T1}`, `purge-tenant-${T2}`]);
  });

  it("a failing tenant fails the run loudly rather than reporting a short count", async () => {
    const { db } = fakeDb({ present: true, tenants: [T1], purged: {} });
    await expect(
      runGuestIntakeRetention(db, {
        log: () => {},
        purgeTenant: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
  });
});

describe("the log line is counts only", () => {
  const COUNTS_ONLY = new RegExp(
    `^${RETENTION_LOG_PREFIX.replace(/[[\]]/g, "\\$&")} (table absent|tenants=\\d+ purged=\\d+)$`,
  );

  it("one line per run, and it matches the counts-only shape", async () => {
    const { db } = fakeDb({ present: true, tenants: [T1, T2], purged: { [T1]: 5 } });
    const lines: string[] = [];
    await runGuestIntakeRetention(db, { log: (l) => lines.push(l) });
    expect(lines).toEqual([`${RETENTION_LOG_PREFIX} tenants=2 purged=5`]);
    for (const l of lines) {
      expect(l).toMatch(COUNTS_ONLY);
      expect(l).not.toContain(T1);
    }
  });

  it("negative control: the shape refuses a line carrying a tenant id", () => {
    expect(`${RETENTION_LOG_PREFIX} tenants=2 purged=5 tenant=${T1}`).not.toMatch(COUNTS_ONLY);
  });
});
