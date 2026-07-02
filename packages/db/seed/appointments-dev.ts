/**
 * Seed — appointment history for 50 dev patients across the three clinic
 * locations, spanning roughly the last 6 and next 2 months from 2026-06-19.
 *
 * Tenant: 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
 *
 * Fixed appointment IDs make this idempotent via onConflictDoNothing.
 * Run after dev-reference.ts and patients-dev.ts.
 *
 * SAFETY: target is resolved and confirmed by ./seed-guard (SEED_DEV_CONFIRM
 * opt-in + PROD_REFS blocklist).
 *
 * Usage:
 *   DATABASE_URL=<dev-service-role-url> pnpm --filter @osteojp/db seed:appointments:dev
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appointments } from "../src/schema";
import {
  LOC_LAV, LOC_CB, LOC_MTN,
  SVC_OST, SVC_FIS, SVC_MAS, SVC_PIL, SVC_NES,
} from "./dev-ids";
import { resolveDevUsers } from "./dev-users";
import { loadSeedEnv } from "./load-env";
import { resolveSeedDatabaseUrl } from "./seed-guard";

const TENANT_ID = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

loadSeedEnv();
const DATABASE_URL = resolveSeedDatabaseUrl();

// ─── Patient IDs (same fixed UUIDs as patients-dev.ts) ────────────────────────
// Indices 0-24: Linda-a-Velha patients
// Indices 25-49: Castelo Branco patients

const PATIENT_IDS: readonly string[] = [
  "0fe2d970-48e7-4031-9a89-cf19fcc2e284", // 0  Maria João Silva         LAV
  "69ccbe13-9f86-4928-8d94-435ba6f35d03", // 1  António Manuel Costa     LAV
  "cae30d86-af77-4e61-b79c-57f94f62d471", // 2  Ana Luísa Ferreira       LAV
  "ddb9d1f5-8e59-4a5f-81e3-494f4e9e0695", // 3  Carlos Alberto Rodrigues LAV
  "707f4dc0-a455-4a35-806a-516a44dc8a2c", // 4  Susana Isabel Martins    LAV
  "fa3f78c4-057b-4e3f-b3e3-1e37372cf1ac", // 5  Paulo Alexandre Sousa    LAV
  "348a53fd-b99c-4572-ab7a-7a1ad1f7d482", // 6  Filipa Margarida Gonçalves LAV
  "0e8cfd18-7670-4a49-86e2-021c30189ec9", // 7  Rui Miguel Carvalho      LAV
  "dd7f2909-bb1f-4f27-a212-e2d004a4f39c", // 8  Inês Catarina Lopes      LAV
  "50c7c4d3-4b37-4bf0-b62b-0cfb131d82e3", // 9  João Pedro Alves         LAV
  "48b9fcb7-d5b0-4546-b13e-1b172e06eaf5", // 10 Beatriz Alexandra Santos LAV
  "db53ead3-fcf1-47ac-a225-0dd4ebf0c14c", // 11 Nuno Ricardo Pereira     LAV
  "9a703fa5-0551-4f00-80ae-e27dbc320fca", // 12 Catarina Sofia Matos     LAV
  "2a85ed37-56ac-491d-8939-99c678730f19", // 13 Hugo Filipe Teixeira     LAV
  "a208a2ee-2e0e-4f9e-adcc-090664ae6ed0", // 14 Margarida Leonor Nunes   LAV
  "40a02d7b-4b71-44ea-9321-6b45f9c7da75", // 15 Ricardo José Oliveira    LAV
  "77d37dd2-7ab7-460c-b15b-f8f3190828f7", // 16 Sara Filomena Pinto      LAV
  "9be6de48-a919-4f82-8d88-22bc64a8145d", // 17 Marco António Fernandes  LAV
  "97bf93d2-793c-49d5-a4bc-8136947d8d04", // 18 Joana Cristina Ribeiro   LAV
  "d3c1e7dc-66ae-4d74-88bd-21494b28fe7b", // 19 Diogo Alexandre Cruz     LAV
  "932c1040-ec09-47ab-9352-82cc34d62b8e", // 20 Liliana Patrícia Gomes   LAV
  "bad42b62-4ed5-45d9-b666-9e00c80c33d2", // 21 Tiago Filipe Henriques   LAV
  "5dc24f5a-434f-402b-867c-07baace1a16d", // 22 Mónica Isabel Correia    LAV
  "65a8419b-a982-4e22-b01a-40f9f165b07a", // 23 Vítor Manuel Barbosa     LAV
  "5e88b11d-de8b-4092-8abf-f8fcd58e05ef", // 24 Daniela Sofia Monteiro   LAV
  "cc82ffec-2d2c-441a-b2a9-2edb6dfe0176", // 25 Fernando Jorge Mendes    CB
  "ceb05564-9a29-4dba-9a3c-28ab7aa7cecc", // 26 Paula Cristina Vieira    CB
  "62034369-26a0-4f8a-b679-b36917bd0a80", // 27 Luís Filipe Cardoso      CB
  "d1573d09-f0e6-4f10-9755-4302b610185c", // 28 Cristina Maria Moreira   CB
  "a4dcca0a-2a01-4bd9-9b4b-5ac7dac1c6c7", // 29 André Luís Fonseca      CB
  "27526e1a-2ef0-4f2b-996c-8473400811ed", // 30 Vera Lúcia Simões        CB
  "133e04e8-8aca-4a29-b3a1-4bb3e544e33c", // 31 Hélder António Ramos     CB
  "d85dccc2-3941-47d4-82c9-2d94af970617", // 32 Cláudia Isabel Esteves   CB
  "b09919d8-4fd4-4897-8e92-e9c8bf9c103c", // 33 Pedro Miguel Cunha       CB
  "039507aa-1757-4336-bd13-d754c3035503", // 34 Teresa Raquel Marques    CB
  "67ac8805-cd06-47bd-84be-c91fcac462fc", // 35 Sérgio Alexandre Branco  CB
  "09bee31a-1a85-4c2a-93fe-7daf29596230", // 36 Patrícia Manuela Leite   CB
  "219c379d-bb41-4f98-af66-5fab4ebd777e", // 37 Joaquim Manuel Pires     CB
  "9d8be306-08b7-46c0-8a36-7e0fee0c882a", // 38 Alexandra Filipa Coelho  CB
  "34a259d4-c112-489e-bf7a-c2fdf41abf88", // 39 Bruno Alexandre Ferraz   CB
  "cf41a621-32d5-4f5a-8649-b035f503dee4", // 40 Vanessa Sofia Leal       CB
  "1cc83f13-427e-43ea-bd8e-9f014f5b7e2e", // 41 Gonçalo Nuno Baptista    CB
  "7e0e64c5-352f-44f2-9321-b0e2e2c4a221", // 42 Raquel Isabel Antunes    CB
  "f4023ee3-471b-4e5a-98f6-31675616a993", // 43 Miguel Ângelo Tavares    CB
  "4b03dda1-76e0-4aae-ba93-eb86362c81da", // 44 Sónia Cristina Peixoto   CB
  "98314f59-9f73-478a-b44c-a7b03a2cad1a", // 45 Artur Filipe Nascimento  CB
  "780ede8c-1409-43cc-a0a0-7859b9a204b8", // 46 Elisa Maria Figueiredo   CB
  "0ae117f7-7cd6-40d7-a1b8-0c7856a2d6c8", // 47 Nelson Jorge Pacheco     CB
  "ace7f7be-0936-4aa3-9e11-67201fca3fe7", // 48 Célia Marisa Valente     CB
  "5a66f8b7-85e4-4f05-bbe8-49997b11a88b", // 49 Álvaro Filipe Machado    CB
];

// ─── Deterministic appointment generation ─────────────────────────────────────

type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

const SERVICES = [SVC_OST, SVC_FIS, SVC_MAS, SVC_PIL, SVC_NES] as const;

// Per-location practitioner pools, by USR_1..5 order. Filled at seed time from
// the users' REAL ids resolved by email (FA-1), never from fixture constants.
type TherapistPools = {
  lav: readonly string[];
  cb: readonly string[];
  mtn: readonly string[];
};

// Reference date: 2026-06-19 noon UTC
const SEED_DATE = new Date("2026-06-19T12:00:00Z");
const PAST_DAYS = 183;  // ~6 months
const FUTURE_DAYS = 62; // ~2 months
const TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS;

function pick<T>(arr: readonly T[], idx: number): T {
  return arr[idx % arr.length] as T;
}

function makeApptId(pi: number, ai: number): string {
  return `de000007-${pi.toString(16).padStart(4, "0")}-${ai.toString(16).padStart(4, "0")}-0000-000000000000`;
}

function buildAppointments(therapists: TherapistPools) {
  const { lav: LAV_THERAPISTS, cb: CB_THERAPISTS, mtn: MTN_THERAPISTS } = therapists;

  type ApptRow = {
    id: string;
    tenantId: string;
    patientId: string;
    practitionerId: string;
    locationId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
  };

  const rows: ApptRow[] = [];

  for (let pi = 0; pi < PATIENT_IDS.length; pi++) {
    const patientId = PATIENT_IDS[pi] as string;
    const isLAV = pi < 25;
    const numAppts = 3 + (pi % 6); // 3-8 per patient

    for (let ai = 0; ai < numAppts; ai++) {
      // Spread evenly across the full date range with per-patient jitter
      const rawOffset = Math.floor((ai / numAppts) * TOTAL_DAYS) + (pi * 3 + ai * 7) % 11;
      const dayOffset = -PAST_DAYS + rawOffset;

      const d = new Date(SEED_DATE);
      d.setUTCDate(d.getUTCDate() + dayOffset);

      // Shift weekends to Monday
      const dow = d.getUTCDay();
      if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
      if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);

      // Hour in range 9–18
      const hour = 9 + ((pi + ai * 2) % 10);
      d.setUTCHours(hour, 0, 0, 0);

      // Location + practitioner assignment
      let locationId: string;
      let practitionerId: string;

      if (isLAV) {
        if (ai % 7 === 5) {
          // occasional cross to CB
          locationId = LOC_CB;
          practitionerId = pick(CB_THERAPISTS, pi + ai);
        } else if (ai % 11 === 10) {
          // rare visit to MTN
          locationId = LOC_MTN;
          practitionerId = pick(MTN_THERAPISTS, pi + ai);
        } else {
          locationId = LOC_LAV;
          practitionerId = pick(LAV_THERAPISTS, pi + ai);
        }
      } else {
        const p = pi - 25;
        if ((p + ai) % 6 === 5) {
          // occasional visit to MTN
          locationId = LOC_MTN;
          practitionerId = pick(MTN_THERAPISTS, pi + ai);
        } else if ((p + ai) % 9 === 8) {
          // occasional visit to LAV
          locationId = LOC_LAV;
          practitionerId = pick(LAV_THERAPISTS, pi + ai);
        } else {
          locationId = LOC_CB;
          practitionerId = pick(CB_THERAPISTS, pi + ai);
        }
      }

      // Service
      const serviceId = pick(SERVICES, pi + ai * 2);
      const durationMin = serviceId === SVC_FIS ? 45 : 60;

      const startsAt = new Date(d);
      const endsAt = new Date(d.getTime() + durationMin * 60_000);

      // Status
      let status: AppointmentStatus;
      const isPast = startsAt < SEED_DATE;
      if (isPast) {
        const roll = (pi * 7 + ai * 11) % 10;
        if (roll < 6)      status = "completed";
        else if (roll < 8) status = "cancelled";
        else               status = "no_show";
      } else {
        status = (pi + ai) % 3 === 2 ? "confirmed" : "scheduled";
      }

      rows.push({
        id: makeApptId(pi, ai),
        tenantId: TENANT_ID,
        patientId,
        practitionerId,
        locationId,
        serviceId,
        startsAt,
        endsAt,
        status,
      });
    }
  }

  return rows;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

async function seed() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  // Resolve USR_1..5 to their REAL ids by (tenant, email); practitioner_id FKs
  // flow from here, never a fixture constant (FA-1).
  const { ids } = await resolveDevUsers(db, TENANT_ID);
  const [U1, U2, U3, U4, U5] = ids;
  const rows = buildAppointments({
    lav: [U1, U2, U5],
    cb: [U2, U3, U5],
    mtn: [U4, U5],
  });
  console.log(`Seeding ${rows.length} appointments → tenant ${TENANT_ID}…`);

  // Insert in batches of 100 to stay within postgres parameter limits
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const result = await db
      .insert(appointments)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: appointments.id });
    inserted += result.length;
  }

  const skipped = rows.length - inserted;
  console.log(`Done. inserted=${inserted} skipped=${skipped} total=${rows.length}`);

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
