import "server-only";
import { sql } from "drizzle-orm";
import { getDbAdmin, guestIntakeSchemaPresent, type DbTx } from "@osteojp/db";

import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";

/**
 * INTAKE-01 - THE PATIENT'S OWN CLINICAL INTAKE, READ ONLY (the portal view).
 *
 * WHO SEES WHAT. A patient reads the intake answers they sent with a guest
 * booking request that reception has since CONVERTED to them, and nothing else:
 * not an unconverted request's answers (there is no person to own those yet),
 * not another patient's, not another tenant's. That is 0087's
 * `guest_clinical_intakes_patient_select` policy, reached through the patient
 * role's only door to its own requests, `patient_guest_request_ids()` (the
 * patient role has no grant on guest_booking_requests at all, 0065).
 *
 * TWO LAYERS, as every patient read in this app has (see patient/documents.ts):
 *   1. RLS, under `set local role patient` with the VERIFIED principal's claims
 *      (runAsPatient).
 *   2. An explicit filter on the principal's tenant and on the same helper, so
 *      a regressed policy would still not widen what this returns.
 *
 * INERT UNTIL 0087 IS APPLIED. The detector is asked first, on the admin
 * connection (information_schema only lists tables the caller holds a privilege
 * on, and the owner holds them all); while the table is absent the answer is
 * `enabled: false` and no statement names the table.
 *
 * READ ONLY. There is no write here and the patient role has no INSERT, UPDATE
 * or DELETE on the table (0087 grants SELECT only). To correct an answer the
 * patient calls the clinic.
 *
 * ARTICLE 9. Nothing here logs. An error propagates to the route, which answers
 * a fixed code and logs no message (a query error's text can carry parameters).
 *
 * RAW SQL, NOT A DRIZZLE TABLE: the table's Drizzle declaration lands with the
 * migration PR, not before (BLUE's brief).
 */

/** The THREE states storage holds. The portal renders each in words; a blank
 *  is never shown for `nao_perguntado`, and it is never folded into `nao`. */
export type IntakeAnswer = "sim" | "nao" | "nao_perguntado";

const isIntakeAnswer = (v: unknown): v is IntakeAnswer =>
  v === "sim" || v === "nao" || v === "nao_perguntado";

/** What the portal receives: the answers and when they were sent. No tenant,
 *  no request id, no consent label - internal linkage stays here. */
export type PatientGuestIntake = {
  id: string;
  /** ISO, when the answers arrived (created_at). */
  submittedAt: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
  reason: string;
  healthConditions: string | null;
  medication: string | null;
  fallsAccidents: string | null;
  surgeries: string | null;
  pacemaker: IntakeAnswer;
  pregnancy: IntakeAnswer;
  /** ISO, when the consent was ticked (set by the server at the insert). */
  consentAt: string;
};

export type OwnGuestIntakes = { enabled: boolean; intakes: PatientGuestIntake[] };

type IntakeSelectRow = {
  id: string;
  submitted_at: Date | string;
  date_of_birth: string;
  reason: string;
  health_conditions: string | null;
  medication: string | null;
  falls_accidents: string | null;
  surgeries: string | null;
  pacemaker: string;
  pregnancy: string;
  consent_at: Date | string;
};

const iso = (v: Date | string): string => (v instanceof Date ? v : new Date(v)).toISOString();

/** Pure projection to the portal DTO. Exported for the unit suite. */
export function toPatientGuestIntake(r: IntakeSelectRow): PatientGuestIntake {
  const { pacemaker, pregnancy } = r;
  if (!isIntakeAnswer(pacemaker) || !isIntakeAnswer(pregnancy)) {
    // 0087's enum makes this unreachable. Refused rather than mapped: turning an
    // unknown state into any of the three would put words in the patient's mouth.
    throw new Error("guest intake: a safety answer outside the three-state vocabulary");
  }
  return {
    id: r.id,
    submittedAt: iso(r.submitted_at),
    dateOfBirth: r.date_of_birth,
    reason: r.reason,
    healthConditions: r.health_conditions,
    medication: r.medication,
    fallsAccidents: r.falls_accidents,
    surgeries: r.surgeries,
    pacemaker,
    pregnancy,
    consentAt: iso(r.consent_at),
  };
}

/**
 * The statement itself, run inside the caller's PATIENT transaction. Newest
 * first: ruling 1 asks everyone, so a patient converted from two requests has
 * two dated sets of answers, and both are theirs.
 */
export async function selectOwnGuestIntakes(
  tx: Pick<DbTx, "execute">,
  principal: PatientPrincipal,
): Promise<PatientGuestIntake[]> {
  const rows = (await tx.execute(sql`
    select i.id, i.created_at as submitted_at, i.date_of_birth::text as date_of_birth,
           i.reason, i.health_conditions, i.medication, i.falls_accidents, i.surgeries,
           i.pacemaker::text as pacemaker, i.pregnancy::text as pregnancy, i.consent_at
      from public.guest_clinical_intakes i
     where i.tenant_id = ${principal.tenantId}::uuid
       and i.guest_booking_request_id = any (coalesce(public.patient_guest_request_ids(), '{}'::uuid[]))
     order by i.created_at desc, i.id
  `)) as unknown as IntakeSelectRow[];
  return rows.map(toPatientGuestIntake);
}

/** The route's one call. `enabled: false` means 0087 is not applied here. */
export async function readOwnGuestIntakes(principal: PatientPrincipal): Promise<OwnGuestIntakes> {
  if (!(await guestIntakeSchemaPresent(getDbAdmin()))) {
    return { enabled: false, intakes: [] };
  }
  const intakes = await runAsPatient(principal, (tx) => selectOwnGuestIntakes(tx, principal));
  return { enabled: true, intakes };
}
