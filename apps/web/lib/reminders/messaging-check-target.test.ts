/**
 * THE ONE APPOINTMENT READ THE DELIVERY TEST MAKES IS TENANT-SCOPED.
 *
 * `loadMessagingCheckTarget` is fed an id the owner TYPED. If it read through
 * an unscoped handle, or under another tenant's claim, an id from another
 * clinic would answer with that clinic's row, and the refusal built on it
 * would say something about an appointment the caller may not see.
 *
 * What RLS does with the claim is a property of the database, and
 * `messaging-check-target.db.test.ts` proves it there, against two real
 * tenants. This file proves the half a database test cannot see from the
 * outside: WHICH seam the read goes through and WHICH tenant it is handed. It
 * fails if the scoped wrapper is swapped for the admin handle, if the read
 * stops using the transaction the wrapper hands it, or if the wrong tenant is
 * passed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** Every tenant the scoped wrapper was opened for, in order. */
  contexts: [] as string[],
  /** Every query built on the transaction the wrapper handed over. */
  queries: [] as { columns: string[]; table: unknown; where: unknown; limit: number }[],
  /** How many times an UNSCOPED handle was asked for. */
  unscoped: 0,
  rows: [] as { status: string; origin: string }[],
}));

vi.mock("server-only", () => ({}));

// The scoped seam, replaced by a recorder. It hands the callback a transaction
// that records the one query and answers with the fixture rows.
vi.mock("./context", () => ({
  withReminderTenantContext: async (tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    h.contexts.push(tenantId);
    const tx = {
      select: (columns: Record<string, unknown>) => ({
        from: (table: unknown) => ({
          where: (where: unknown) => ({
            limit: async (limit: number) => {
              h.queries.push({ columns: Object.keys(columns), table, where, limit });
              return h.rows;
            },
          }),
        }),
      }),
    };
    return fn(tx);
  },
}));

// The real schema, with every way of reaching the database WITHOUT a tenant
// claim turned into a counted failure.
vi.mock("@osteojp/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/db")>();
  const refuse = () => {
    h.unscoped += 1;
    throw new Error("an unscoped database handle was used");
  };
  return { ...actual, getDbAdmin: refuse, getDb: refuse, withTenantContext: refuse };
});

import { appointments } from "@osteojp/db";
import { loadMessagingCheckTarget } from "./messaging-check-target";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APPOINTMENT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  h.contexts.length = 0;
  h.queries.length = 0;
  h.unscoped = 0;
  h.rows = [{ status: "scheduled", origin: "patient_portal" }];
});

describe("loadMessagingCheckTarget", () => {
  it("opens the scoped context ONCE, for the tenant it was given and no other", async () => {
    await loadMessagingCheckTarget(TENANT, APPOINTMENT);
    expect(h.contexts).toEqual([TENANT]);

    await loadMessagingCheckTarget(OTHER_TENANT, APPOINTMENT);
    expect(h.contexts).toEqual([TENANT, OTHER_TENANT]);
  });

  it("runs its query ON the transaction the scoped context handed over", async () => {
    await loadMessagingCheckTarget(TENANT, APPOINTMENT);
    // One query, and it was recorded by the scoped transaction: a read through
    // any other handle would leave this list empty.
    expect(h.queries).toHaveLength(1);
    expect(h.unscoped).toBe(0);
  });

  it("reads status and origin of ONE appointment, by its id, and nothing else", async () => {
    await loadMessagingCheckTarget(TENANT, APPOINTMENT);
    const [query] = h.queries;
    expect(query.table).toBe(appointments);
    expect(query.columns.sort()).toEqual(["origin", "status"]);
    expect(query.limit).toBe(1);
    // The filter, rendered: the id column equals the id that was passed.
    const rendered = new PgDialect().sqlToQuery(query.where as SQL);
    expect(rendered.sql).toBe('"appointments"."id" = $1');
    expect(rendered.params).toEqual([APPOINTMENT]);
  });

  it("answers the row, or null when the scoped read sees none", async () => {
    expect(await loadMessagingCheckTarget(TENANT, APPOINTMENT)).toEqual({
      status: "scheduled",
      origin: "patient_portal",
    });
    // What RLS answers for another tenant's id: no row. Never an error and
    // never a default the caller could mistake for a real appointment.
    h.rows = [];
    expect(await loadMessagingCheckTarget(TENANT, APPOINTMENT)).toBeNull();
  });

  it("the module has no other route to the database", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "messaging-check-target.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain('import { appointments } from "@osteojp/db";');
    expect(source).toContain('import { withReminderTenantContext } from "./context";');
    expect(source).toMatch(/withReminderTenantContext\(tenantId, async \(tx\) =>/);
    expect(source).not.toMatch(/getDbAdmin|getDb\b|withTenantContext\(|\bsql`/);
    // Four imports and no more: server-only, the operator, the table, the seam.
    expect(source.match(/^import /gm)).toHaveLength(4);
  });
});
