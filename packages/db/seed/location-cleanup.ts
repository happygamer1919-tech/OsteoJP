/**
 * W2-03 — Location data cleanup (live-DB data op, archive/rename + one authorized repoint).
 *
 * Brings the `locations` table to exactly TWO active clinics — Castelo Branco
 * and Linda-a-Velha — carried on the FIXTURE ids so all appointment FK history
 * stays valid, everything else archived, NOTHING deleted.
 *
 * Owner ruling (DECISIONS.md 2026-07-03): the manual rows `OsteoJP(LV)` /
 * `OsteoJP(CB)` are the SAME physical clinics as the LV / CB fixtures. A
 * one-time repoint of the 2 appointments on the manual LV row to the LV fixture
 * id is authorized as an explicit scope expansion (appointments.location_id,
 * those 2 rows only, identified by id). All data synthetic, owner-confirmed.
 *
 * SAFETY: target resolved + confirmed by ./seed-guard (SEED_DEV_CONFIRM opt-in +
 * PROD_REFS blocklist); env preloaded by ./load-env (SEED_DEV_CONFIRM stays a
 * shell-only opt-in). Runs inside a single transaction. Idempotent: every write
 * is WHERE-guarded to touch only rows that still need the change, so a second
 * run reports zero delta. NEVER prints credentials or connection strings.
 *
 * Usage:
 *   SEED_DEV_CONFIRM=<ref parsed from DATABASE_URL> \
 *   pnpm --filter @osteojp/db exec tsx seed/location-cleanup.ts
 */
import postgres from "postgres";
import { loadSeedEnv } from "./load-env";
import { resolveSeedDatabaseUrl } from "./seed-guard";
import { LOC_LAV, LOC_CB, LOC_MTN } from "./dev-ids";

// Manual in-app rows (created outside the fixtures), identified by id per the
// owner ruling ("those rows only, identified by id").
const MANUAL_CB = "98d3d73e-a42d-42b2-a609-d518c032210c";
const MANUAL_LV = "196a8769-2d3c-4d26-8fd4-2e4a8f46d2b6";

// The clinic's chosen names for the two surviving (fixture) rows.
const NAME_LV = "OsteoJP (LV)";
const NAME_CB = "OsteoJP (CB)";

const EXPECTED_IDS = [LOC_LAV, LOC_CB, LOC_MTN, MANUAL_CB, MANUAL_LV].sort();

type LocRow = { id: string; name: string; is_active: boolean; appts: number };

async function recon(sql: postgres.Sql): Promise<LocRow[]> {
  const rows = (await sql`
    select l.id::text as id, l.name, l.is_active,
      (select count(*)::int from appointments a where a.location_id = l.id) as appts
    from locations l
    order by l.is_active desc, l.name`) as unknown as LocRow[];
  console.log("locations (id | active | appts | name):");
  for (const r of rows) {
    console.log(`  ${r.id} | act=${r.is_active} | appts=${String(r.appts).padStart(3)} | ${r.name}`);
  }
  const total = rows.reduce((n, r) => n + r.appts, 0);
  console.log(`  rows=${rows.length}  total appts on locations=${total}`);
  return rows;
}

async function main(): Promise<void> {
  loadSeedEnv();
  const databaseUrl = resolveSeedDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log("=== RECON (before) ===");
    const before = await recon(sql);

    // ── Preconditions (HALT on any mismatch) ─────────────────────────────────
    const ids = before.map((r) => r.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_IDS)) {
      throw new Error(
        `HALT: locations row set differs from expected.\n  expected ids: ${EXPECTED_IDS.join(", ")}\n  actual ids:   ${ids.join(", ")}`,
      );
    }
    const by = (id: string): LocRow => before.find((r) => r.id === id)!;
    const manualLvAppts = by(MANUAL_LV).appts;
    const manualCbAppts = by(MANUAL_CB).appts;
    if (manualCbAppts !== 0) {
      throw new Error(`HALT: manual CB row expected 0 appts, found ${manualCbAppts}.`);
    }
    // First run: 2 appts on manual LV. After the repoint (idempotent re-run): 0.
    if (manualLvAppts !== 2 && manualLvAppts !== 0) {
      throw new Error(
        `HALT: manual LV row expected 2 appts (pre) or 0 (already repointed), found ${manualLvAppts}.`,
      );
    }
    // Capture the exact appointment ids to be repointed (evidence + scope proof).
    const toRepoint = (await sql`
      select id::text as id from appointments where location_id = ${MANUAL_LV} order by id`) as unknown as {
      id: string;
    }[];
    console.log(
      `\nAppointments on manual LV (${MANUAL_LV}) to repoint -> LV fixture (${LOC_LAV}): ${
        toRepoint.length === 0 ? "(none — already repointed)" : toRepoint.map((r) => r.id).join(", ")
      }`,
    );

    // ── Mutations (single transaction, each WHERE-guarded => idempotent) ──────
    const delta = await sql.begin(async (tx) => {
      // 1) Repoint the manual-LV appointments to the LV fixture (authorized).
      const repointed = (await tx`
        update appointments set location_id = ${LOC_LAV}
        where location_id = ${MANUAL_LV} returning id`) as unknown as { id: string }[];

      // 2) Reactivate + rename the LV fixture (only if it still needs it).
      const lv = (await tx`
        update locations set is_active = true, name = ${NAME_LV}
        where id = ${LOC_LAV} and (is_active is distinct from true or name is distinct from ${NAME_LV})
        returning id`) as unknown as { id: string }[];

      // 3) Reactivate + rename the CB fixture.
      const cb = (await tx`
        update locations set is_active = true, name = ${NAME_CB}
        where id = ${LOC_CB} and (is_active is distinct from true or name is distinct from ${NAME_CB})
        returning id`) as unknown as { id: string }[];

      // 4) Archive the Montemor fixture + both manual rows (only the still-active).
      const archived = (await tx`
        update locations set is_active = false
        where id in (${LOC_MTN}, ${MANUAL_CB}, ${MANUAL_LV}) and is_active = true
        returning id`) as unknown as { id: string }[];

      return {
        repointed: repointed.length,
        lvRenamed: lv.length,
        cbRenamed: cb.length,
        archived: archived.length,
      };
    });

    console.log(
      `\n=== APPLIED (rows changed) ===\n  appointments repointed: ${delta.repointed}\n  LV fixture reactivate+rename: ${delta.lvRenamed}\n  CB fixture reactivate+rename: ${delta.cbRenamed}\n  rows archived: ${delta.archived}`,
    );

    console.log("\n=== RECON (after) ===");
    const after = await recon(sql);

    // ── Post-conditions (HALT if not the target state) ───────────────────────
    if (after.length !== before.length) {
      throw new Error(`HALT: row count changed (${before.length} -> ${after.length}) — a delete occurred.`);
    }
    const active = after.filter((r) => r.is_active).sort((a, b) => a.id.localeCompare(b.id));
    const activeIds = active.map((r) => r.id).sort();
    if (JSON.stringify(activeIds) !== JSON.stringify([LOC_CB, LOC_LAV].sort())) {
      throw new Error(
        `HALT: expected exactly the two fixture ids active, got: ${activeIds.join(", ")}`,
      );
    }
    const afterBy = (id: string): LocRow => after.find((r) => r.id === id)!;
    if (afterBy(LOC_LAV).name !== NAME_LV || afterBy(LOC_CB).name !== NAME_CB) {
      throw new Error("HALT: fixtures not renamed to the chosen clinic names.");
    }
    if (afterBy(MANUAL_LV).appts !== 0 || afterBy(MANUAL_CB).appts !== 0) {
      throw new Error("HALT: a manual row still carries appointments after repoint.");
    }
    const totalBefore = before.reduce((n, r) => n + r.appts, 0);
    const totalAfter = after.reduce((n, r) => n + r.appts, 0);
    if (totalBefore !== totalAfter) {
      throw new Error(`HALT: total appointment count changed (${totalBefore} -> ${totalAfter}).`);
    }

    const zeroDelta =
      delta.repointed === 0 && delta.lvRenamed === 0 && delta.cbRenamed === 0 && delta.archived === 0;
    console.log(
      `\n=== RESULT ===\n  active rows: ${active.map((r) => `${r.name} (${r.appts} appts)`).join(", ")}\n  total appts unchanged: ${totalAfter}\n  this run was a ${zeroDelta ? "ZERO-DELTA no-op (idempotent re-run)" : "mutation"}.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
