/**
 * Seed — availability_templates (working hours) for the dev environment.
 *
 * Tenant: 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
 *
 * Gives every seeded practitioner realistic weekly working windows so the
 * read-only availability query (getTherapistAvailability) returns non-empty
 * working/free intervals on dev. Without this, that query has no working
 * windows to subtract bookings from and its live verification degrades to unit
 * tests only.
 *
 * Fixed IDs (de000008-*) make this idempotent via onConflictDoNothing; the
 * availability_templates_dedupe_uq natural-key unique constraint is a second
 * guard, so a re-run inserts nothing new.
 *
 * Shape (confirmed against packages/db/src/schema.ts):
 *   user_id -> users.id, location_id -> locations.id, weekday smallint
 *   0=Sun..6=Sat (JS Date.getDay()), start_time/end_time Lisbon wall-clock,
 *   valid_from/valid_until nullable (open-ended here), is_active bool,
 *   tenant-scoped.
 *
 * Run after dev-reference.ts (needs users + locations).
 *
 * The row builder (SCHEDULES / buildRows) is a pure export so availability-dev.test.ts
 * can assert its shape without a database; the DB write only runs when this file
 * is executed directly (SAFETY: target confirmed by ./seed-guard).
 *
 * Usage:
 *   DATABASE_URL=<dev-service-role-url> pnpm --filter @osteojp/db seed:availability:dev
 */

import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { availabilityTemplates } from "../src/schema";
import {
  LOC_LAV, LOC_CB, LOC_MTN,
  USR_1, USR_2, USR_3, USR_4, USR_5,
} from "./dev-ids";
import { resolveSeedDatabaseUrl } from "./seed-guard";

export const TENANT_ID = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

// ─── Weekly schedules ─────────────────────────────────────────────────────────
// Weekday: 1=Mon .. 5=Fri (JS getDay). A shift is [start, end] Lisbon wall-clock.
// Location assignment mirrors the appointments-dev practitioner map so a
// therapist's availability lines up with where they actually see patients.
// Deliberately varied so downstream verification hits multiple cases:
//   - USR_1: standard Mon–Fri two-shift day (morning + afternoon lunch gap)
//   - USR_2: split across two locations; short single shift at the second
//   - USR_3: Mon–Fri two-shift with off-the-hour boundaries (08:30 / 13:30)
//   - USR_4: part-time — three days, single shift
//   - USR_5: admin who also practices — light single-shift cover, one per clinic

export type Shift = readonly [string, string];
export type Rule = {
  userId: string;
  locationId: string;
  weekdays: readonly number[];
  shifts: readonly Shift[];
};

export const SCHEDULES: readonly Rule[] = [
  // USR_1 Dr. André Costa — Linda-a-Velha, Mon–Fri, two shifts
  { userId: USR_1, locationId: LOC_LAV, weekdays: [1, 2, 3, 4, 5], shifts: [["09:00", "13:00"], ["14:00", "18:00"]] },

  // USR_2 Dra. Sofia Mendes — LAV Mon/Wed/Fri (two shifts); CB Tue/Thu (short single shift)
  { userId: USR_2, locationId: LOC_LAV, weekdays: [1, 3, 5], shifts: [["09:00", "13:00"], ["14:00", "17:00"]] },
  { userId: USR_2, locationId: LOC_CB,  weekdays: [2, 4],    shifts: [["10:00", "14:00"]] },

  // USR_3 Dr. Bernardo Figueira — Castelo Branco, Mon–Fri, two shifts (off-the-hour)
  { userId: USR_3, locationId: LOC_CB, weekdays: [1, 2, 3, 4, 5], shifts: [["08:30", "12:30"], ["13:30", "17:30"]] },

  // USR_4 Dra. Inês Carmo — Montemor-o-Novo, part-time Mon/Wed/Fri, single shift
  { userId: USR_4, locationId: LOC_MTN, weekdays: [1, 3, 5], shifts: [["09:00", "14:00"]] },

  // USR_5 Dr. Rui Correia (admin, practices all locations) — light multi-location cover
  { userId: USR_5, locationId: LOC_LAV, weekdays: [1], shifts: [["15:00", "18:00"]] },
  { userId: USR_5, locationId: LOC_CB,  weekdays: [3], shifts: [["09:00", "12:00"]] },
  { userId: USR_5, locationId: LOC_MTN, weekdays: [5], shifts: [["14:00", "17:00"]] },
];

// Stable per-user UUID: de000008-<userSeq>-<rowSeq>-0000-000000000000.
const USER_SEQ: Record<string, number> = {
  [USR_1]: 1, [USR_2]: 2, [USR_3]: 3, [USR_4]: 4, [USR_5]: 5,
};
function makeId(userId: string, rowSeq: number): string {
  const u = (USER_SEQ[userId] ?? 0).toString(16).padStart(4, "0");
  const r = rowSeq.toString(16).padStart(4, "0");
  return `de000008-${u}-${r}-0000-000000000000`;
}

export type AvailabilityRow = {
  id: string;
  tenantId: string;
  userId: string;
  locationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
};

/** Expand SCHEDULES into one row per (rule, weekday, shift). Pure — no DB. */
export function buildRows(): AvailabilityRow[] {
  const rows: AvailabilityRow[] = [];
  const perUserSeq: Record<string, number> = {};

  for (const rule of SCHEDULES) {
    for (const weekday of rule.weekdays) {
      for (const [startTime, endTime] of rule.shifts) {
        const seq = (perUserSeq[rule.userId] = (perUserSeq[rule.userId] ?? 0) + 1);
        rows.push({
          id: makeId(rule.userId, seq),
          tenantId: TENANT_ID,
          userId: rule.userId,
          locationId: rule.locationId,
          weekday,
          startTime,
          endTime,
          validFrom: null,
          validUntil: null,
          isActive: true,
        });
      }
    }
  }
  return rows;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

async function seed() {
  const DATABASE_URL = resolveSeedDatabaseUrl();

  const sql = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  const rows = buildRows();
  console.log(`Seeding ${rows.length} availability templates → tenant ${TENANT_ID}…`);

  const result = await db
    .insert(availabilityTemplates)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: availabilityTemplates.id });

  const inserted = result.length;
  const skipped = rows.length - inserted;
  console.log(`Done. inserted=${inserted} skipped=${skipped} total=${rows.length}`);

  await sql.end();
}

// Run the DB write only when executed directly (tsx seed/availability-dev.ts),
// never on import — so the test can pull in buildRows without a DATABASE_URL.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
