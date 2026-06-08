import "server-only";
import { and, eq } from "drizzle-orm";
import { patients } from "@osteojp/db";
import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";

// ─── Read (existing) ──────────────────────────────────────────────────────────

export type PatientProfile = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
};

type ProfileRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
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
  };
}

export async function getOwnProfile(
  principal: PatientPrincipal,
): Promise<PatientProfile | null> {
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

// ─── Write (new) ──────────────────────────────────────────────────────────────

/**
 * The subset of the patient's own profile that the portal is allowed to update.
 * NIF is Phase 4 only (fiscal). fullName and email changes require staff action
 * (identity integrity). The patient may update contact + address fields only.
 *
 * All fields are optional — a PATCH applies only the provided keys.
 */
export type PatientProfilePatch = {
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
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

  return runAsPatient(principal, async (tx) => {
    await tx
      .update(patients)
      .set({
        ...(patch.phone !== undefined && { phone: patch.phone }),
        ...(patch.address !== undefined && { address: patch.address }),
        ...(patch.postalCode !== undefined && { postalCode: patch.postalCode }),
        ...(patch.city !== undefined && { city: patch.city }),
      })
      .where(
        and(
          eq(patients.id, principal.patientId),
          eq(patients.tenantId, principal.tenantId),
        ),
      );

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
