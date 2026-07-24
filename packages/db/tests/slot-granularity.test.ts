/**
 * slot-granularity.test.ts — DB-gated proof for W12-29 (migration 0041:
 * locations.slot_granularity_min).
 *
 * Pins the column default (30) and the exact generate_series step semantics the
 * portal booking generator (listOpenSlots, apps/api store.ts) uses: the slot
 * step = the location's slot_granularity_min, coalesced to 30. So a location at
 * 30 is UNCHANGED (portal-safe) and a location at 60 yields hourly starts.
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

const T = randomUUID();
const LOC_30 = randomUUID(); // explicit 30 (LV — unchanged)
const LOC_60 = randomUUID(); // explicit 60 (CB — hourly)
const LOC_DEFAULT = randomUUID(); // no explicit value -> default 30

describe.skipIf(!live)("locations.slot_granularity_min (0041) — per-location slot step", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${T}, 'Slot Gran', ${`slotgran-${T}`})`;
    await sql`insert into locations (id, tenant_id, name, slot_granularity_min) values (${LOC_30}, ${T}, 'Linda-a-Velha', 30)`;
    await sql`insert into locations (id, tenant_id, name, slot_granularity_min) values (${LOC_60}, ${T}, 'Castelo Branco', 60)`;
    await sql`insert into locations (id, tenant_id, name) values (${LOC_DEFAULT}, ${T}, 'Nova')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id = ${T}`;
    await sql.end();
  });

  it("defaults to 30 for a location that does not set it", async () => {
    const rows = await sql<{ g: number }[]>`select slot_granularity_min as g from locations where id = ${LOC_DEFAULT}`;
    expect(rows[0]?.g).toBe(30);
  });

  // Mirrors the listOpenSlots step: a 30-min-duration booking across a
  // 09:00-11:00 window (upper bound = 11:00 - 30min = 10:30) stepped by the
  // location's coalesced granularity.
  const startCount = (locId: string) =>
    sql<{ n: number }[]>`
      select count(*)::int as n
      from generate_series(
        timestamp '2026-09-03 09:00',
        timestamp '2026-09-03 11:00' - make_interval(mins => 30),
        make_interval(mins => coalesce(
          (select l.slot_granularity_min from locations l where l.id = ${locId} and l.tenant_id = ${T}), 30)::int)
      ) as g`;

  it("granularity 30 -> 30-min starts (09:00, 09:30, 10:00, 10:30 = 4)", async () => {
    const rows = await startCount(LOC_30);
    expect(rows[0]?.n).toBe(4);
  });

  it("granularity 60 -> hourly starts (09:00, 10:00 = 2)", async () => {
    const rows = await startCount(LOC_60);
    expect(rows[0]?.n).toBe(2);
  });

  it("a location with no explicit value falls back to 30 (identical to LV)", async () => {
    const rows = await startCount(LOC_DEFAULT);
    expect(rows[0]?.n).toBe(4);
  });
});
