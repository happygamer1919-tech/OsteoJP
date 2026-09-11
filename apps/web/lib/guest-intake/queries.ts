import "server-only";
import { sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { guestIntakeSchemaPresent, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { parseGuestIntakeRow, type GuestIntakeRecord } from "./view";

/**
 * INTAKE-01 (staff side) - the two staff reads of `guest_clinical_intakes`.
 *
 *   BESIDE THE REQUEST  `listGuestIntakesForRequests`, for the guest queue on
 *                       /notificacoes: the answers attached to the requests
 *                       reception is already looking at.
 *   LATER, ON THE FICHA `listGuestIntakesForPatient`, for the patient page: the
 *                       answers of every request that was converted to this
 *                       patient, newest first. Ruling 1 (ask everyone, resolve
 *                       at conversion) means there can be more than one, each
 *                       dated, none overwriting another.
 *
 * WHO SEES WHAT IS DECIDED BY 0087'S POLICY, NOT HERE. Both reads run through
 * `runScoped`, so as `authenticated` under the viewer's own claims:
 *   owner              every intake in the tenant;
 *   admin, reception   intakes whose request is at one of their locations, or
 *                      all of them when they hold no location assignment;
 *   therapist          NOTHING before conversion, and after it only when
 *                      `clinical_therapist_sees_patient` holds for the patient.
 * `guest_intake:read` (every staff role) is the gate on reaching the read at
 * all; the therapist's narrowing is the database's, which is why the grant is
 * safe to give them. There is no app-side row filter to drift from the policy.
 *
 * INERT UNTIL 0087 IS APPLIED. The table does not exist on a database built
 * from main until the owner applies the migration, so every statement below is
 * behind `guestIntakeSchemaPresent` (fork A's detector). Raw SQL, because the
 * Drizzle declaration of the table lands with the migration PR, not before.
 *
 * NOT CACHED, DELIBERATELY. These are Article 9 answers read under one viewer's
 * RLS; a cache keyed on anything less than the viewer would serve one
 * principal's scope to another. Both callers are already dynamic pages.
 *
 * Never logged, never put in an error: `parseGuestIntakeRow` names a field when
 * it refuses a row and never its value.
 */

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

type RawRow = Record<string, unknown>;

async function rowsOf(tx: DbTx, query: ReturnType<typeof sql>): Promise<GuestIntakeRecord[]> {
  const rows = (await tx.execute(query)) as unknown as ReadonlyArray<RawRow>;
  return rows.map(parseGuestIntakeRow);
}

/**
 * The intakes attached to these guest requests, keyed by request id.
 *
 * `null` MEANS THE FEATURE IS OFF (0087 not applied), and an empty map means it
 * is on and none of these requests has an intake the viewer may read. The queue
 * renders the two differently: nothing at all for `null`, and "this request has
 * no clinical questionnaire" for a request missing from the map.
 */
export async function listGuestIntakesForRequests(
  ctx: RequestContext,
  requestIds: readonly string[],
): Promise<Map<string, GuestIntakeRecord> | null> {
  assertCan(ctx.role, "guest_intake:read");
  return runScoped(
    ctx,
    async (tx) => {
      if (!(await guestIntakeSchemaPresent(tx))) return null;
      const byRequest = new Map<string, GuestIntakeRecord>();
      if (requestIds.length === 0) return byRequest;
      const ids = sql.join(
        requestIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      const records = await rowsOf(
        tx,
        sql`select ${INTAKE_COLUMNS}
              from public.guest_clinical_intakes i
             where i.guest_booking_request_id in (${ids})`,
      );
      for (const r of records) byRequest.set(r.guestBookingRequestId, r);
      return byRequest;
    },
    "guest-intake:by-request",
  );
}

/**
 * Every intake whose request was converted to this patient, newest first.
 * An empty list both when 0087 is not applied and when there is none: the ficha
 * renders nothing in either case, so there is no difference to carry.
 */
export async function listGuestIntakesForPatient(
  ctx: RequestContext,
  patientId: string,
): Promise<GuestIntakeRecord[]> {
  assertCan(ctx.role, "guest_intake:read");
  return runScoped(
    ctx,
    async (tx) => {
      if (!(await guestIntakeSchemaPresent(tx))) return [];
      return rowsOf(
        tx,
        sql`select ${INTAKE_COLUMNS}
              from public.guest_clinical_intakes i
              join public.guest_booking_requests r
                on r.id = i.guest_booking_request_id
               and r.tenant_id = i.tenant_id
             where r.converted_patient_id = ${patientId}::uuid
             order by i.created_at desc`,
      );
    },
    "guest-intake:by-patient",
  );
}
