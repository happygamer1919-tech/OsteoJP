import { sql, type SQL } from "drizzle-orm";

/**
 * INTAKE-01 - IS THE GUEST CLINICAL INTAKE TABLE ON THIS DATABASE YET?
 *
 * `public.guest_clinical_intakes` arrives with migration 0087, which is HELD
 * until the owner applies it. The application half of INTAKE-01 merges BEFORE
 * that apply, so every path that reads or writes the table must be INERT until
 * the table exists: the guest catalog reports `intakeEnabled: false`, the portal
 * renders today's four steps, and the guest route refuses a body that carries an
 * intake. Shipped against a database without the table, any statement naming it
 * would fail with 42P01 - on production, and in CI, whose database is built from
 * supabase/migrations.
 *
 * SAME SHAPE AS `shared-resource.ts` (SCHED-17), deliberately. One question,
 * asked of information_schema, cached per process and ASYMMETRICALLY: "present"
 * never becomes false again, so it is kept for the life of the process; "absent"
 * is re-asked after a minute, so an apply takes effect on the running deployment
 * without a redeploy.
 *
 * `information_schema.tables` lists tables the CALLING role holds a privilege
 * on. 0087 grants SELECT to authenticated and patient and SELECT, INSERT to
 * service_role, and getDbAdmin connects as the owner, so every caller in this
 * repository qualifies.
 *
 * RAW SQL, NOT A DRIZZLE TABLE. The Drizzle declaration of the table lands with
 * the migration PR, not before, so nothing here imports one.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export async function guestIntakeSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select exists (
      select 1 from information_schema.tables
       where table_schema = 'public'
         and table_name = 'guest_clinical_intakes'
    ) as present
  `)) as unknown as ReadonlyArray<{ present: boolean }>;
  if (rows[0]?.present === true) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetGuestIntakeSchemaCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}

/**
 * What the guest route may write. The two safety questions carry only `sim` or
 * `nao` here: 0087's enum has a third value, `nao_perguntado`, and the guest
 * form can never produce it (Strategy 2026-09-07, ruling 2). It exists for rows
 * that arrive by any other route, and no such route writes through this type.
 */
export type GuestIntakeAnswer = "sim" | "nao";

export type GuestClinicalIntakeInsert = {
  tenantId: string;
  guestBookingRequestId: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
  reason: string;
  healthConditions: string | null;
  medication: string | null;
  fallsAccidents: string | null;
  surgeries: string | null;
  pacemaker: GuestIntakeAnswer;
  pregnancy: GuestIntakeAnswer;
  consentVersion: string;
};

/**
 * The ONE write of an intake row, inside the caller's transaction.
 *
 * THREE CONSENT VALUES ON ONE ROW (WF-19), and two of them are set HERE rather
 * than read from anything the caller supplied: `consent_ticked` is the literal
 * `true`, because the route only reaches this write when the tick was checked on
 * the server, and `consent_at` is the database's `now()`, because a timestamp
 * from the request body would be a claim by the client about when consent
 * happened. The third, the version label, is validated by the route against
 * INTAKE_CONSENT_VERSIONS before this is called.
 *
 * NO RETURNING. Nothing is read back, so the statement is an INSERT and nothing
 * else.
 *
 * It never writes `patients.contraindication_*`, and nothing may, from an intake
 * answer (ruling 2: "the person said so" is not "a clinician confirmed it").
 */
export async function insertGuestClinicalIntake(
  db: SqlExecutor,
  row: GuestClinicalIntakeInsert,
): Promise<void> {
  await db.execute(sql`
    insert into public.guest_clinical_intakes (
      tenant_id, guest_booking_request_id, date_of_birth, reason,
      health_conditions, medication, falls_accidents, surgeries,
      pacemaker, pregnancy, consent_ticked, consent_at, consent_version
    ) values (
      ${row.tenantId}::uuid, ${row.guestBookingRequestId}::uuid, ${row.dateOfBirth}::date, ${row.reason},
      ${row.healthConditions}, ${row.medication}, ${row.fallsAccidents}, ${row.surgeries},
      ${row.pacemaker}::public.intake_answer, ${row.pregnancy}::public.intake_answer,
      true, now(), ${row.consentVersion}
    )
  `);
}
