/**
 * Wave 08 (W8-01a) — LOCAL dry-run of the canonical catalog seed.
 *
 * Applies CATALOG_SERVICES + per-location prices + CATALOG_PACKS
 * (wave08-catalog.ts) to a FRESH, disposable test tenant on the LOCAL DB
 * (127.0.0.1:54322), prints the row counts, and prints the exact catalog table
 * that goes to the owner for the CATALOG OWNER CONFIRMATION halt. Then it
 * deletes the test tenant (cascade) so local stays clean.
 *
 * SYNTHETIC ONLY — never targets the cloud. The authorized cloud write reuses
 * the SAME wave08-catalog.ts data, by the same offered-only-where-priced model,
 * ONLY after the owner confirms this table and the PROD_DATABASE_URL_DIRECT-free
 * manual apply path is used.
 *
 * Usage: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *        pnpm --filter @osteojp/db exec tsx seed/wave08-catalog-dryrun.ts
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  CATALOG_SERVICES,
  CATALOG_PACKS,
  type CatalogLocation,
} from "./wave08-catalog";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required (local: postgresql://postgres:postgres@127.0.0.1:54322/postgres)");
  process.exit(2);
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error("REFUSED: dry-run targets LOCAL only (127.0.0.1). Never the cloud.");
  process.exit(2);
}

const eur = (cents: number) => (cents / 100).toFixed(2);

async function main() {
  const sql = postgres(url!, { max: 1 });
  const tenant = randomUUID();
  const locIds: Record<CatalogLocation, string> = { LAV: randomUUID(), CB: randomUUID() };
  try {
    await sql`insert into tenants (id, name, slug) values (${tenant}, 'W8-01a Dry-run', ${`w8-dryrun-${tenant}`})`;
    await sql`insert into locations (id, tenant_id, name) values (${locIds.LAV}, ${tenant}, 'Linda-a-Velha')`;
    await sql`insert into locations (id, tenant_id, name) values (${locIds.CB}, ${tenant}, 'Castelo Branco')`;

    // Services — canonical row per distinct name; base price_cents NULL (offered
    // ONLY where an active service_location_prices row exists).
    const serviceIdByName = new Map<string, string>();
    let priceRows = 0;
    for (const svc of CATALOG_SERVICES) {
      const id = randomUUID();
      serviceIdByName.set(svc.name, id);
      await sql`insert into services (id, tenant_id, name, duration_min, price_cents)
                values (${id}, ${tenant}, ${svc.name}, ${svc.durationMin ?? 60}, null)`;
      for (const p of svc.prices) {
        await sql`insert into service_location_prices (tenant_id, service_id, location_id, price_cents)
                  values (${tenant}, ${id}, ${locIds[p.location]}, ${p.priceCents})`;
        priceRows++;
      }
    }

    // Packs — resolve base service by name; location-scoped.
    let packRows = 0;
    for (const pk of CATALOG_PACKS) {
      const baseId = serviceIdByName.get(pk.baseServiceName);
      if (!baseId) {
        throw new Error(`pack "${pk.name}" references unknown base service "${pk.baseServiceName}"`);
      }
      await sql`insert into service_packs (tenant_id, base_service_id, location_id, name, session_count, price_cents)
                values (${tenant}, ${baseId}, ${locIds[pk.location]}, ${pk.name}, ${pk.sessionCount}, ${pk.priceCents})`;
      packRows++;
    }

    // Counts read back from the DB (authoritative).
    const sRows = await sql<{ n: number }[]>`select count(*)::int as n from services where tenant_id = ${tenant}`;
    const pRows = await sql<{ n: number }[]>`select count(*)::int as n from service_location_prices where tenant_id = ${tenant}`;
    const kRows = await sql<{ n: number }[]>`select count(*)::int as n from service_packs where tenant_id = ${tenant}`;
    const sCount = sRows[0]?.n ?? 0;
    const pCount = pRows[0]?.n ?? 0;
    const kCount = kRows[0]?.n ?? 0;

    console.log("\n=== W8-01a LOCAL DRY-RUN ROW COUNTS ===");
    console.log(`services (canonical rows):        ${sCount}`);
    console.log(`service_location_prices (offers): ${pCount}  (expected ${priceRows})`);
    console.log(`service_packs (pack definitions): ${kCount}  (expected ${packRows})`);

    console.log("\n=== CATALOG (as it will be written) — SERVICES ===");
    console.log("name | location | price (EUR)");
    for (const svc of CATALOG_SERVICES) {
      for (const p of svc.prices) {
        console.log(`${svc.name} | ${p.location === "LAV" ? "Linda-a-Velha" : "Castelo Branco"} | ${eur(p.priceCents)}`);
      }
    }
    console.log("\n=== CATALOG — PACKS (type=pack) ===");
    console.log("name | location | sessions | price (EUR) | base service");
    for (const pk of CATALOG_PACKS) {
      console.log(`${pk.name} | ${pk.location === "LAV" ? "Linda-a-Velha" : "Castelo Branco"} | ${pk.sessionCount} | ${eur(pk.priceCents)} | ${pk.baseServiceName}`);
    }
    console.log("");
  } finally {
    // Clean up the disposable tenant (cascade removes services/prices/packs).
    await sql`delete from tenants where id = ${tenant}`;
    await sql.end();
    console.log("(dry-run test tenant deleted — local clean)");
  }
}

main().catch((e) => {
  console.error("dry-run failed:", e.message);
  process.exit(1);
});
