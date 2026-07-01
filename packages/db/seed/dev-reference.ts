/**
 * Seed — reference data for the dev environment (tenant, roles, locations,
 * services, users/therapists, form templates).
 *
 * Tenant: 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
 *
 * All IDs are fixed so every table is idempotent via onConflictDoNothing.
 *
 * SAFETY: target is resolved and confirmed by ./seed-guard (SEED_DEV_CONFIRM
 * opt-in + PROD_REFS blocklist).
 *
 * Usage:
 *   DATABASE_URL=<dev-service-role-url> \
 *   SEED_TENANT_ID=3a2d0711-fbdb-4ce9-b940-b6a87e3d3560 \
 *   pnpm --filter @osteojp/db seed:dev:reference
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { tenants, roles, locations, services, users } from "../src/schema";
import { loadFormTemplates } from "./form-templates";
import { resolveSeedDatabaseUrl } from "./seed-guard";
import {
  ROLE_OWNER, ROLE_ADMIN, ROLE_THERAPIST, ROLE_RECEPTION,
  LOC_LAV, LOC_CB, LOC_MTN,
  SVC_OST, SVC_FIS, SVC_MAS, SVC_PIL, SVC_NES,
  USR_1, USR_2, USR_3, USR_4, USR_5,
} from "./dev-ids";

// Re-export so consumers that previously imported from here still work.
export {
  ROLE_OWNER, ROLE_ADMIN, ROLE_THERAPIST, ROLE_RECEPTION,
  LOC_LAV, LOC_CB, LOC_MTN,
  SVC_OST, SVC_FIS, SVC_MAS, SVC_PIL, SVC_NES,
  USR_1, USR_2, USR_3, USR_4, USR_5,
};

const TENANT_ID = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

const DATABASE_URL = resolveSeedDatabaseUrl();

// ─── Loader ───────────────────────────────────────────────────────────────────

async function seed() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  // ── Tenant ──
  console.log("Seeding tenant…");
  await db
    .insert(tenants)
    .values({
      id: TENANT_ID,
      name: "OsteoJP",
      slug: "osteojp-dev",
      nif: "500000000",
      status: "active",
      settings: {},
    })
    .onConflictDoNothing();

  // ── Roles ──
  console.log("Seeding roles…");
  await db
    .insert(roles)
    .values([
      { id: ROLE_OWNER,     tenantId: TENANT_ID, slug: "owner",     name: "Owner" },
      { id: ROLE_ADMIN,     tenantId: TENANT_ID, slug: "admin",     name: "Administrador" },
      { id: ROLE_THERAPIST, tenantId: TENANT_ID, slug: "therapist", name: "Terapeuta" },
      { id: ROLE_RECEPTION, tenantId: TENANT_ID, slug: "reception", name: "Recepção" },
    ])
    .onConflictDoNothing();

  // ── Locations ──
  console.log("Seeding locations…");
  await db
    .insert(locations)
    .values([
      { id: LOC_LAV, tenantId: TENANT_ID, name: "Linda-a-Velha", address: "Rua da Liberdade, 1, Linda-a-Velha", phone: "+351214190000" },
      { id: LOC_CB,  tenantId: TENANT_ID, name: "Castelo Branco", address: "Rua Fernando Namora, 1, Castelo Branco", phone: "+351272300000" },
      { id: LOC_MTN, tenantId: TENANT_ID, name: "Montemor-o-Novo", address: "Praça Central, 1, Montemor-o-Novo", phone: "+351266890000" },
    ])
    .onConflictDoNothing();

  // ── Services (null locationId = available at all locations) ──
  console.log("Seeding services…");
  await db
    .insert(services)
    .values([
      { id: SVC_OST, tenantId: TENANT_ID, name: "Osteopatia",          durationMin: 60, priceCents: 6000 },
      { id: SVC_FIS, tenantId: TENANT_ID, name: "Fisioterapia",        durationMin: 45, priceCents: 4500 },
      { id: SVC_MAS, tenantId: TENANT_ID, name: "Massagem Terapêutica", durationMin: 60, priceCents: 5000 },
      { id: SVC_PIL, tenantId: TENANT_ID, name: "Pilates Terapêutico", durationMin: 60, priceCents: 4000 },
      { id: SVC_NES, tenantId: TENANT_ID, name: "NESA",                durationMin: 60, priceCents: 7000 },
    ])
    .onConflictDoNothing();

  // ── Users / therapists ──
  // Resolve role IDs by (tenant, slug) from whatever role rows actually exist
  // for this tenant. The fixture role IDs above are only authoritative when this
  // seed created the roles; a DB whose roles were seeded elsewhere (e.g.
  // supabase/seed.sql with random UUIDs) is handled identically — the users
  // attach to the existing role IDs instead of the skipped fixture IDs.
  const roleRows = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(eq(roles.tenantId, TENANT_ID));
  const roleIdBySlug = new Map(roleRows.map((r) => [r.slug, r.id]));
  const roleId = (slug: string): string => {
    const id = roleIdBySlug.get(slug);
    if (!id) {
      console.error(`Seed failed: role slug "${slug}" not found for tenant ${TENANT_ID}.`);
      process.exit(1);
    }
    return id;
  };

  console.log("Seeding users…");
  await db
    .insert(users)
    .values([
      { id: USR_1, tenantId: TENANT_ID, roleId: roleId("therapist"), email: "andre.costa@osteojp-dev.pt",      fullName: "Dr. André Costa",       isActive: true },
      { id: USR_2, tenantId: TENANT_ID, roleId: roleId("therapist"), email: "sofia.mendes@osteojp-dev.pt",     fullName: "Dra. Sofia Mendes",      isActive: true },
      { id: USR_3, tenantId: TENANT_ID, roleId: roleId("therapist"), email: "bernardo.figueira@osteojp-dev.pt", fullName: "Dr. Bernardo Figueira", isActive: true },
      { id: USR_4, tenantId: TENANT_ID, roleId: roleId("therapist"), email: "ines.carmo@osteojp-dev.pt",       fullName: "Dra. Inês Carmo",        isActive: true },
      { id: USR_5, tenantId: TENANT_ID, roleId: roleId("admin"),     email: "rui.correia@osteojp-dev.pt",      fullName: "Dr. Rui Correia",        isActive: true },
    ])
    .onConflictDoNothing();

  // ── Form templates ──
  console.log("Seeding form templates…");
  const loaded = await loadFormTemplates(db, TENANT_ID);
  console.log(`  form templates: ${loaded.length} upserted`);

  console.log("dev-reference seed complete.");
  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
