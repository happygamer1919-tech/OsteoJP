/**
 * fixtures.ts — deterministic data the seed (e2e/seed/seed-e2e.mjs) provisions.
 *
 * Specs import these constants instead of hardcoding strings/ids, so the seed
 * and the assertions can never drift. Keep in sync with seed-e2e.mjs.
 */

export const TENANT_A = "00000000-0000-0000-0000-0000000000a1";
export const TENANT_B = "00000000-0000-0000-0000-0000000000b2";

export const E2E_PASSWORD = "E2ePassw0rd!";

export const USERS = {
  admin: "e2e-admin@osteojp.test",
  therapist: "e2e-therapist@osteojp.test",
  reception: "e2e-reception@osteojp.test",
} as const;

/** Storage-state files written by auth.setup.ts (one per role). */
export const STORAGE = {
  admin: "e2e/.auth/admin.json",
  therapist: "e2e/.auth/therapist.json",
  reception: "e2e/.auth/reception.json",
} as const;

/** Seeded patients in tenant A. */
export const PATIENTS = {
  // Active, searchable by name / NIF / phone.
  maria: {
    id: "00000000-0000-0000-0000-00000000a301",
    name: "Maria Silva",
    nif: "123456789",
    phone: "912345678",       // digit-only — used as search input
    phoneDisplay: "+351 912 345 678", // stored/rendered value — used for column assertions
  },
  joao: { id: "00000000-0000-0000-0000-00000000a302", name: "João Pereira" },
  ana: { id: "00000000-0000-0000-0000-00000000a303", name: "Ana Costa" },
  // Pre-soft-deleted — must be ABSENT from active list/search, visible only on
  // its own profile with the "Eliminado" badge.
  // Digit-free name: a name search must not trip the NIF/phone digit-matcher.
  archived: {
    id: "00000000-0000-0000-0000-00000000a3de",
    name: "Carlos Arquivado Teste",
    nif: "999999999",
  },
} as const;

/** A patient that belongs to tenant B — used for the cross-tenant denial test. */
export const PATIENT_OTHER_TENANT = {
  id: "00000000-0000-0000-0000-00000000b301",
  name: "Beatriz Outro-Tenant",
} as const;

export const LOCATION = { id: "00000000-0000-0000-0000-00000000a101", name: "Linda-a-Velha" } as const;
export const SERVICE = { id: "00000000-0000-0000-0000-00000000a201", name: "Osteopatia" } as const;
export const THERAPIST_NAME = "E2E Therapist";

/**
 * The current osteopathy template the "Modelo" picker should offer (PR #96
 * version resolver → highest active version). v1 must NOT appear.
 */
export const TEMPLATE_CURRENT_LABEL = "Osteopatia — Avaliação de Episódio v2";
export const TEMPLATE_SUPERSEDED_LABEL = "Osteopatia — Avaliação de Episódio v1";

/**
 * A future calendar date (yyyy-mm-dd) `offsetDays` out, anchored at noon UTC so
 * it maps to the same Lisbon day regardless of DST. No hardcoded dates: every
 * scheduling spec derives its day from this.
 */
export function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * A per-run-unique base offset (days) so re-runs never collide with appointments
 * a previous run left in the dev DB. Spread out enough to never touch seed data
 * (the seed creates no appointments).
 */
export const RUN_DAY_BASE = 60 + (Date.now() % 300);

// ---------------------------------------------------------------------------
// Portal (apps/portal — patient-facing, port 3001)
// ---------------------------------------------------------------------------

/**
 * Base URL for the portal app. Override with PORTAL_BASE_URL env var when
 * pointing at a Vercel preview instead of a local dev server.
 */
export const PORTAL_BASE_URL =
  process.env.PORTAL_BASE_URL ?? "http://localhost:3001";

/** Portal patient test credential (seeded by seed-e2e.mjs → ensurePortalPatient). */
export const E2E_PORTAL_PATIENT_EMAIL = "e2e-patient@osteojp.test";

/** Storage-state file for the portal patient session. */
export const PORTAL_STORAGE = {
  patient: "e2e/.auth/portal-patient.json",
} as const;

/**
 * Maria Silva's patient row doubles as the portal test patient.
 * The seed sets her auth_user_id to the e2e-patient auth user ID.
 */
export const PORTAL_PATIENT = {
  id: PATIENTS.maria.id,
  name: PATIENTS.maria.name,
} as const;
