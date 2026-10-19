import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { patients } from "@osteojp/db";
import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";
import { surveyAppliesTo } from "./survey-mode";

// ─── SAT-01 (S8): the patient's own survey switch ─────────────────────────────
//
// `patients.survey_enabled` (migration 0102): on by default; off, no survey is
// sent to this patient by any path. Here the patient reads and sets their own.
//
// THE DOOR IS THE ONE THE REMINDER SWITCHES USE. 0102 gives the patient role a
// column grant, UPDATE (survey_enabled), beside the table SELECT of 0010; the
// row gates are the two self-scope policies (0010, 0019), untouched. So this is
// a plain SELECT and a plain UPDATE inside runAsPatient, and the database
// writes its own audit row, `survey.switch_changed`, from a trigger in the same
// transaction, carrying the patient's id as the actor.
//
// OFFERED OR ABSENT, NEVER HIDDEN-BUT-THERE. While SURVEY_SEND_MODE reads off
// the patient sees nothing of the survey (owner, 2026-10-12), and under canary
// only a patient on the list does (strategy, 2026-10-13). When the switch is
// not offered to this patient the column is not read, the profile carries no
// `surveyEnabled` key, and a write that names it changes nothing. The portal
// draws the switch only when the key is there, so it needs no variable of its
// own and cannot disagree with this file.
//
// WHY THE COLUMN IS NAMED IN SQL. `schema.ts` does not declare
// `survey_enabled`, and declaring it there would put it into every whole-row
// read of a patient in every application. apps/web/lib/patients/survey-switch.ts
// names the one column the same way, for the same reason.
//
// ONLY THIS COLUMN IS WRITTEN BY ITS STATEMENT. The two reminder switches are
// not named in it.

const surveyEnabledColumn = sql<boolean>`${patients}."survey_enabled"`;

/** Is this patient offered their survey switch, to see and to change? */
export function ownSurveySwitchOffered(principal: PatientPrincipal): boolean {
  return surveyAppliesTo(principal.patientId).applies;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export type PatientProfile = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  reminderSmsEnabled: boolean;
  reminderEmailEnabled: boolean;
  /** SAT-01: present only when the survey switch is offered to this patient. */
  surveyEnabled?: boolean;
};

type ProfileRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  reminderSmsEnabled: boolean;
  reminderEmailEnabled: boolean;
  /** Selected only when the switch is offered; otherwise not on the row. */
  surveyEnabled?: boolean;
};

export function toProfileDTO(row: ProfileRow): PatientProfile {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    postalCode: row.postalCode,
    city: row.city,
    reminderSmsEnabled: row.reminderSmsEnabled,
    reminderEmailEnabled: row.reminderEmailEnabled,
    // A key only when the column was read, and it is read only when offered.
    ...(typeof row.surveyEnabled === "boolean" && { surveyEnabled: row.surveyEnabled }),
  };
}

export async function getOwnProfile(
  principal: PatientPrincipal,
): Promise<PatientProfile | null> {
  const offered = ownSurveySwitchOffered(principal);
  return runAsPatient(principal, async (tx) => {
    const rows = await tx
      .select({
        id: patients.id,
        fullName: patients.fullName,
        email: patients.email,
        phone: patients.phone,
        address: patients.address,
        postalCode: patients.postalCode,
        city: patients.city,
        reminderSmsEnabled: patients.reminderSmsEnabled,
        reminderEmailEnabled: patients.reminderEmailEnabled,
        ...(offered && { surveyEnabled: surveyEnabledColumn }),
      })
      .from(patients)
      .where(
        and(
          eq(patients.id, principal.patientId),
          eq(patients.tenantId, principal.tenantId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row || row.id !== principal.patientId) return null;
    return toProfileDTO(row);
  });
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * The subset of the patient's own profile that the portal is allowed to update.
 * NIF is Phase 4 only (fiscal). fullName and email changes require staff action
 * (identity integrity). The patient may update contact + address fields and
 * reminder channel preferences.
 *
 * All fields are optional — a PATCH applies only the provided keys.
 */
export type PatientProfilePatch = {
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  reminderSmsEnabled?: boolean;
  reminderEmailEnabled?: boolean;
  /** SAT-01: applied only when the switch is offered to this patient. */
  surveyEnabled?: boolean;
};

/**
 * Apply a partial update to the patient's own profile row.
 * Same self-scope guarantees as getOwnProfile: patient_id comes only from the
 * verified principal, the update is RLS-confined to own row + tenant.
 * Returns the updated profile, or null if the row could not be re-fetched.
 */
export async function updateOwnProfile(
  principal: PatientPrincipal,
  patch: PatientProfilePatch,
): Promise<PatientProfile | null> {
  // Validate phone if provided — basic format only (E.164-ish or PT local)
  if (patch.phone !== undefined && patch.phone !== null) {
    const cleaned = patch.phone.replace(/\s/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(cleaned)) {
      throw new Error("INVALID_PHONE");
    }
  }

  // SAT-01: decided here as well as in the route, so no caller of this
  // function can set the switch for a patient who is not offered it.
  const offered = ownSurveySwitchOffered(principal);
  const surveyEnabled = offered ? patch.surveyEnabled : undefined;
  const hasProfileFields =
    patch.phone !== undefined ||
    patch.address !== undefined ||
    patch.postalCode !== undefined ||
    patch.city !== undefined ||
    patch.reminderSmsEnabled !== undefined ||
    patch.reminderEmailEnabled !== undefined;

  return runAsPatient(principal, async (tx) => {
    if (hasProfileFields) {
      await tx
        .update(patients)
        .set({
          ...(patch.phone !== undefined && { phone: patch.phone }),
          ...(patch.address !== undefined && { address: patch.address }),
          ...(patch.postalCode !== undefined && { postalCode: patch.postalCode }),
          ...(patch.city !== undefined && { city: patch.city }),
          ...(patch.reminderSmsEnabled !== undefined && { reminderSmsEnabled: patch.reminderSmsEnabled }),
          ...(patch.reminderEmailEnabled !== undefined && { reminderEmailEnabled: patch.reminderEmailEnabled }),
        })
        .where(
          and(
            eq(patients.id, principal.patientId),
            eq(patients.tenantId, principal.tenantId),
          ),
        );
    }

    // The survey switch: its own statement, naming its one column.
    if (surveyEnabled !== undefined) {
      await tx.execute(
        sql`update ${patients} set "survey_enabled" = ${surveyEnabled}
             where ${patients.id} = ${principal.patientId}::uuid
               and ${patients.tenantId} = ${principal.tenantId}::uuid`,
      );
    }

    // Re-fetch and return the updated row
    const rows = await tx
      .select({
        id: patients.id,
        fullName: patients.fullName,
        email: patients.email,
        phone: patients.phone,
        address: patients.address,
        postalCode: patients.postalCode,
        city: patients.city,
        reminderSmsEnabled: patients.reminderSmsEnabled,
        reminderEmailEnabled: patients.reminderEmailEnabled,
        ...(offered && { surveyEnabled: surveyEnabledColumn }),
      })
      .from(patients)
      .where(
        and(
          eq(patients.id, principal.patientId),
          eq(patients.tenantId, principal.tenantId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row || row.id !== principal.patientId) return null;
    return toProfileDTO(row);
  });
}
