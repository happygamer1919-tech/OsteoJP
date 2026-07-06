/**
 * Data op — set the dev therapists' working hours to the REAL clinic schedule
 * (W3-09, DECISIONS 2026-07-05): Mon–Fri 08:00–20:00, Sat 09:00–13:00.
 *
 * This is a GUARDED, IDEMPOTENT data op on the shared dev Supabase project
 * (synthetic data, owner-authorized) — NOT a migration and NOT app code. It
 * reconciles `availability_templates` for the five seeded dev therapists toward
 * the real schedule WITHOUT hard-deleting anything (deletions are
 * owner-confirmable, CLAUDE.md):
 *
 *   1. UPSERT the target rows — each therapist gets Mon–Fri 08:00–20:00 (single
 *      shift) + Sat 09:00–13:00 at their PRIMARY location (their first-assigned
 *      location in availability-dev.ts). Stable ids `de000009-<seq>-<weekday>-…`
 *      + onConflictDoNothing → a re-run inserts nothing.
 *   2. ARCHIVE (is_active=false) every OTHER availability_templates row for those
 *      therapists (the old varied shifts) — never deleted. Filtered on
 *      `is_active = true`, so a re-run archives nothing.
 *
 * Idempotence = zero delta between two consecutive runs (DECISIONS 2026-07-02).
 *
 * Weekday convention (confirmed vs schema + getTherapistAvailability):
 *   0=Sun … 6=Sat (JS Date.getDay()), so Mon=1..Fri=5, Sat=6.
 *
 * SAFETY: target confirmed by ./seed-guard (SEED_DEV_CONFIRM must equal the
 * project ref parsed from DATABASE_URL). Never prints credentials.
 *
 * Usage:
 *   SEED_DEV_CONFIRM=<ref> pnpm --filter @osteojp/db seed:working-hours:dev
 */

import { fileURLToPath } from "node:url";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { availabilityTemplates } from "../src/schema";
import { LOC_CB, LOC_LAV, LOC_MTN } from "./dev-ids";
import { resolveDevUsers } from "./dev-users";
import { loadSeedEnv } from "./load-env";
import { resolveSeedDatabaseUrl } from "./seed-guard";

export const TENANT_ID = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

// Real clinic schedule (DECISIONS 2026-07-05).
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5] as const; // 1=Mon..5=Fri
const SATURDAY = 6; // 6=Sat
const MON_FRI_SHIFT = ["08:00", "20:00"] as const;
const SAT_SHIFT = ["09:00", "13:00"] as const;

// Primary location per therapist seq (their first-assigned location in
// availability-dev.ts). A therapist can't be in two places at once, so the real
// schedule lands at ONE location; their other-location rows are archived.
export const PRIMARY_LOCATION: Readonly<Record<number, string>> = {
  1: LOC_LAV, // Dr. André Costa
  2: LOC_LAV, // Dra. Sofia Mendes
  3: LOC_CB, //  Dr. Bernardo Figueira
  4: LOC_MTN, // Dra. Inês Carmo
  5: LOC_LAV, // Dr. Rui Correia (admin who also practices)
};

// Stable id `de000009-<seq>-<weekday>-0000-…`, keyed on the therapist seq (1..5)
// and weekday (1..6), so it is identical across runs → the upsert is idempotent.
function makeId(userSeq: number, weekday: number): string {
  const u = userSeq.toString(16).padStart(4, "0");
  const w = weekday.toString(16).padStart(4, "0");
  return `de000009-${u}-${w}-0000-000000000000`;
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

/**
 * The target rows: for each therapist seq 1..5, Mon–Fri 08:00–20:00 + Sat
 * 09:00–13:00 at their primary location. Pure — no DB — so the test can assert
 * the shape (CHECK invariants: weekday 0–6, start<end) without a database.
 */
export function buildTargetRows(userIdBySeq: (seq: number) => string): AvailabilityRow[] {
  const rows: AvailabilityRow[] = [];
  for (const [seqStr, locationId] of Object.entries(PRIMARY_LOCATION)) {
    const seq = Number(seqStr);
    const base = {
      tenantId: TENANT_ID,
      userId: userIdBySeq(seq),
      locationId,
      validFrom: null,
      validUntil: null,
      isActive: true,
    };
    for (const weekday of WEEKDAYS_MON_FRI) {
      rows.push({ ...base, id: makeId(seq, weekday), weekday, startTime: MON_FRI_SHIFT[0], endTime: MON_FRI_SHIFT[1] });
    }
    rows.push({ ...base, id: makeId(seq, SATURDAY), weekday: SATURDAY, startTime: SAT_SHIFT[0], endTime: SAT_SHIFT[1] });
  }
  return rows;
}

async function run() {
  loadSeedEnv();
  const DATABASE_URL = resolveSeedDatabaseUrl();

  const sql = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  const { userIdBySeq, ids: userIds } = await resolveDevUsers(db, TENANT_ID);
  const rows = buildTargetRows(userIdBySeq);
  const targetIds = rows.map((r) => r.id);

  // 1. Upsert the target rows — idempotent (stable ids + do-nothing on conflict).
  const inserted = await db
    .insert(availabilityTemplates)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: availabilityTemplates.id });

  // 2. Archive every OTHER row for these therapists (never delete). The
  //    is_active=true filter makes this a no-op on a re-run.
  const archived = await db
    .update(availabilityTemplates)
    .set({ isActive: false })
    .where(
      and(
        eq(availabilityTemplates.tenantId, TENANT_ID),
        inArray(availabilityTemplates.userId, userIds),
        eq(availabilityTemplates.isActive, true),
        notInArray(availabilityTemplates.id, targetIds),
      ),
    )
    .returning({ id: availabilityTemplates.id });

  console.log(
    `working-hours-real: target=${rows.length} inserted=${inserted.length} ` +
      `skipped=${rows.length - inserted.length} archived=${archived.length}`,
  );

  await sql.end();
}

// DB write only when executed directly (never on import → the test can pull in
// buildTargetRows without a DATABASE_URL).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("working-hours-real failed:", err);
    process.exit(1);
  });
}
