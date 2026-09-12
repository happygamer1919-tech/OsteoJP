import { sql, type SQL } from "drizzle-orm";
import type { DbTx } from "./client";
import { guestIntakeSchemaPresent } from "./guest-intake";

/**
 * INTAKE-01 (staff side) - every statement the staff side runs against
 * `guest_clinical_intakes`: the two READS the staff screens use, and the two
 * statements the retention job issues. Here and not in apps/web because of
 * CLAUDE.md ("Database access: only through packages/db. No raw SQL in app
 * code"); apps/web holds the capability checks, the `runScoped` wrapping and the
 * job's orchestration, and a guard there asserts it holds no SQL of its own.
 *
 * A SEPARATE FILE FROM `guest-intake.ts` (fork A's detector and write) so the
 * two halves of INTAKE-01 can land in either order without touching each other.
 *
 * RAW SQL, BECAUSE THE DRIZZLE DECLARATION OF THE TABLE LANDS WITH MIGRATION
 * 0087, not before. Every statement is behind `guestIntakeSchemaPresent`, or is
 * only reachable after the caller has asked it, so a database without 0087
 * never sees one.
 *
 * NONE OF THIS WRITES `patients.contraindication_*`, and nothing may from an
 * intake answer (Strategy 2026-09-07, ruling 2).
 */

type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

/* ================================================================== */
/* The row                                                            */
/* ================================================================== */

/** 0087's enum `public.intake_answer`, label for label. */
export const INTAKE_ANSWERS = ["sim", "nao", "nao_perguntado"] as const;
export type IntakeAnswer = (typeof INTAKE_ANSWERS)[number];

/** One `guest_clinical_intakes` row, as the staff reads select it. */
export type GuestIntakeRecord = {
  guestBookingRequestId: string;
  /** YYYY-MM-DD, as stored. Never passed through a Date, so no zone can shift it. */
  dateOfBirth: string;
  reason: string;
  healthConditions: string | null;
  medication: string | null;
  fallsAccidents: string | null;
  surgeries: string | null;
  pacemaker: IntakeAnswer;
  pregnancy: IntakeAnswer;
  consentVersion: string;
  /** ISO 8601, UTC. */
  consentAt: string;
  /** ISO 8601, UTC. When the intake ARRIVED; the retention clock runs on it. */
  createdAt: string;
};

function isIntakeAnswer(value: unknown): value is IntakeAnswer {
  return typeof value === "string" && (INTAKE_ANSWERS as readonly string[]).includes(value);
}

/**
 * Narrows one raw row. It REFUSES rather than coerces: an answer label this file
 * does not know is a schema change nobody carried here, and guessing its words
 * would put a claim on a clinical screen that nobody made.
 *
 * THE ERROR NAMES THE FIELD, NEVER THE VALUE. The value is an Article 9 answer.
 */
export function parseGuestIntakeRow(raw: Record<string, unknown>): GuestIntakeRecord {
  const str = (key: string): string => {
    const v = raw[key];
    if (typeof v !== "string") throw new Error(`guest intake row: ${key} is not text`);
    return v;
  };
  const optional = (key: string): string | null => {
    const v = raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") throw new Error(`guest intake row: ${key} is not text`);
    return v;
  };
  const answer = (key: string): IntakeAnswer => {
    const v = raw[key];
    if (!isIntakeAnswer(v)) throw new Error(`guest intake row: ${key} is not a known intake_answer label`);
    return v;
  };
  return {
    guestBookingRequestId: str("guest_booking_request_id"),
    dateOfBirth: str("date_of_birth"),
    reason: str("reason"),
    healthConditions: optional("health_conditions"),
    medication: optional("medication"),
    fallsAccidents: optional("falls_accidents"),
    surgeries: optional("surgeries"),
    pacemaker: answer("pacemaker"),
    pregnancy: answer("pregnancy"),
    consentVersion: str("consent_version"),
    consentAt: str("consent_at"),
    createdAt: str("created_at"),
  };
}

/* ================================================================== */
/* The two staff reads                                                */
/* ================================================================== */
//
// THEY TAKE THE SCOPED TRANSACTION, AND THE TYPE SAYS SO. Pass the `tx` that
// `withTenantContext` (apps/web: `runScoped`) hands you: it runs as
// `authenticated` under the viewer's claims, so 0087's SELECT policy decides the
// rows (owner all; admin/reception by location; a therapist only after
// conversion and only for a patient they see clinically). The parameter is
// `DbTx`, not a structural executor, so the bare admin handle (`getDbAdmin()`,
// BYPASSRLS) does not type-check here. There is no app-side row filter.
//
// NOT CACHED, deliberately: Article 9 answers under one viewer's RLS.

// Dates leave as ISO text, never as driver values: drizzle's postgres-js driver
// hands timestamps back as the server's text format, which `Date` does not parse
// reliably, and a `date` through a Date can shift a day with the zone.
const INTAKE_COLUMNS = sql`
  i.guest_booking_request_id::text                                             as guest_booking_request_id,
  to_char(i.date_of_birth, 'YYYY-MM-DD')                                       as date_of_birth,
  i.reason                                                                     as reason,
  i.health_conditions                                                          as health_conditions,
  i.medication                                                                 as medication,
  i.falls_accidents                                                            as falls_accidents,
  i.surgeries                                                                  as surgeries,
  i.pacemaker::text                                                            as pacemaker,
  i.pregnancy::text                                                            as pregnancy,
  i.consent_version                                                            as consent_version,
  to_char(i.consent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')    as consent_at,
  to_char(i.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')    as created_at
`;

async function recordsOf(tx: DbTx, query: SQL): Promise<GuestIntakeRecord[]> {
  const rows = (await tx.execute(query)) as unknown as ReadonlyArray<Record<string, unknown>>;
  return rows.map(parseGuestIntakeRow);
}

/**
 * BESIDE THE REQUEST: the intakes attached to these guest requests, keyed by
 * request id.
 *
 * `null` MEANS THE FEATURE IS OFF (0087 not applied); an empty map means it is on
 * and none of these requests has an intake the viewer may read. The queue
 * renders the two differently.
 */
export async function listGuestIntakesForRequests(
  tx: DbTx,
  requestIds: readonly string[],
): Promise<Map<string, GuestIntakeRecord> | null> {
  if (!(await guestIntakeSchemaPresent(tx))) return null;
  const byRequest = new Map<string, GuestIntakeRecord>();
  if (requestIds.length === 0) return byRequest;
  const ids = sql.join(
    requestIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const records = await recordsOf(
    tx,
    sql`select ${INTAKE_COLUMNS}
          from public.guest_clinical_intakes i
         where i.guest_booking_request_id in (${ids})`,
  );
  for (const r of records) byRequest.set(r.guestBookingRequestId, r);
  return byRequest;
}

/**
 * LATER, ON THE FICHA: every intake whose request was converted to this patient,
 * newest first. Ruling 1 (ask everyone, resolve at conversion) means there can be
 * more than one, each dated, none overwriting another. Empty both when 0087 is
 * not applied and when there is none.
 */
export async function listGuestIntakesForPatient(
  tx: DbTx,
  patientId: string,
): Promise<GuestIntakeRecord[]> {
  if (!(await guestIntakeSchemaPresent(tx))) return [];
  return recordsOf(
    tx,
    sql`select ${INTAKE_COLUMNS}
          from public.guest_clinical_intakes i
          join public.guest_booking_requests r
            on r.id = i.guest_booking_request_id
           and r.tenant_id = i.tenant_id
         where r.converted_patient_id = ${patientId}::uuid
         order by i.created_at desc`,
  );
}

/* ================================================================== */
/* The retention job's two statements                                 */
/* ================================================================== */
//
// THESE TAKE THE ADMIN CONNECTION (`getDbAdmin()`), which connects as the
// database owner. 0087 revokes EXECUTE on `purge_expired_guest_intakes` from
// anon, authenticated, patient AND service_role, so only its owner may run it;
// that is on purpose and nothing here works around it. The caller
// (apps/web/lib/guest-intake/retention.ts) checks `guestIntakeSchemaPresent`
// first and calls neither while the table is absent.
//
// Which intakes go is decided entirely inside the function (seven days by
// ARRIVAL, request never converted, answers deleted and request kept, one audit
// row each). Nothing here predicates on anything, and in particular not on
// `converted_appointment_id`.

/** Every tenant, active or not: a suspended clinic's guest answers still expire. */
export async function listTenantIdsForRetention(db: SqlExecutor): Promise<string[]> {
  const rows = (await db.execute(
    sql`select id::text as id from public.tenants order by id`,
  )) as unknown as ReadonlyArray<{ id: string }>;
  return rows.map((r) => r.id);
}

/** One tenant per call (CLAUDE.md rule 3). The tenant id is BOUND, never interpolated. */
export async function purgeTenantGuestIntakes(db: SqlExecutor, tenantId: string): Promise<number> {
  const rows = (await db.execute(
    sql`select public.purge_expired_guest_intakes(${tenantId}::uuid) as purged`,
  )) as unknown as ReadonlyArray<{ purged: number | string | null }>;
  const n = Number(rows[0]?.purged);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("purge_expired_guest_intakes returned no count");
  }
  return n;
}
