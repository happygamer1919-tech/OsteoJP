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
  // W6-04: the Proprietario (owner) user, for owner-only views (Pacientes
  // eliminados, Estatisticas). Log in fresh with E2E_PASSWORD (no storage state).
  owner: "e2e-owner@osteojp.test",
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

/**
 * A seeded AI-ingested clinical_record draft awaiting review (W5-17). It sits on
 * João Pereira, source='ai_ingested', status='draft', ai_review_state=
 * 'pending_review', with the TWELVE Ficha Médica AI keys under
 * data._aiIngestionRaw at their field paths (identity mapping). The
 * Revisão Consulta "Assumir" opens it in the Ficha Médica editor with these
 * values visible + editable. Fixed id so the spec targets it deterministically.
 */
export const AI_REVIEW_DRAFT = {
  id: "00000000-0000-0000-0000-00000000ad17",
  patientId: PATIENTS.joao.id,
  patientName: PATIENTS.joao.name,
  /** Sentinel values seeded under _aiIngestionRaw — asserted visible + editable. */
  values: {
    consultation_reason: "AI Motivo consulta lombar",
    observations: "AI Observacoes iniciais",
    neurological: "AI Neurologico sem alteracoes",
  },
} as const;

/**
 * W6-01a: a seeded AI-ingested draft that carries an ai_ingestion_requests
 * back-pointer (clinical_record_id → this record). Pre-fix, hard-deleting it
 * raised a Postgres FK violation that surfaced as the opaque "Ocorreu um erro"
 * (the paol / paul failure). It sits on João Pereira with ai_review_state=
 * 'in_review' so it stays OFF the "Por rever" queue (never perturbing the
 * Revisão Consulta spec). Distinct id from AI_REVIEW_DRAFT; the delete spec
 * targets it by data-record-id only.
 */
export const AI_DELETE_DRAFT = {
  id: "00000000-0000-0000-0000-00000000ad18",
  patientId: PATIENTS.joao.id,
  patientName: PATIENTS.joao.name,
} as const;

/** W6-04: a dedicated soft-deleted patient for the Pacientes eliminados restore
 *  e2e (digit-free name, no associated data, re-soft-deleted each seed run). */
export const RECOVER_PATIENT = {
  id: "00000000-0000-0000-0000-00000000a3d4",
  name: "Recuperavel Teste Seis",
  nif: "999000444",
} as const;

/** A patient that belongs to tenant B — used for the cross-tenant denial test. */
export const PATIENT_OTHER_TENANT = {
  id: "00000000-0000-0000-0000-00000000b301",
  name: "Beatriz Outro-Tenant",
} as const;

/**
 * W10-04 isolation: a SAME-tenant (tenant A) patient owned by the SECOND
 * therapist (created_by = therapist2), with no appointment involving the E2E
 * therapist. The negative-isolation spec asserts the E2E therapist canNOT see
 * this patient (own-only), while admin CAN (cross-visibility positive control).
 */
export const PATIENT_OTHER_THERAPIST = {
  id: "00000000-0000-0000-0000-00000000a304",
  name: "Outro Terapeuta Paciente",
} as const;

export const LOCATION = { id: "00000000-0000-0000-0000-00000000a101", name: "Linda-a-Velha" } as const;
/** Seeded is_active=false — must never appear in a selection dropdown (W2-02 item 2). */
export const LOCATION_ARCHIVED = { id: "00000000-0000-0000-0000-00000000a102", name: "Sede Antiga (Arquivada)" } as const;
/** Dedicated active location for the W2-12 working-hours test (no other spec books here). */
export const LOCATION_B = { id: "00000000-0000-0000-0000-00000000a103", name: "Consultório B (E2E)" } as const;
export const SERVICE = { id: "00000000-0000-0000-0000-00000000a201", name: "Osteopatia" } as const;
export const THERAPIST_NAME = "E2E Therapist";
// W4-12 location auto-fill fixtures. `THERAPIST_ONE_LOCATION` is seeded with
// availability at exactly LOCATION_A (Linda-a-Velha) + the Osteopatia service, so
// selecting them auto-fills both Localização and Serviço. `THERAPIST_MULTI_LOCATION`
// has availability at two active locations and must NOT auto-fill Localização.
export const THERAPIST_ONE_LOCATION = "E2E Terapeuta Clinica Unica";
export const THERAPIST_MULTI_LOCATION = "E2E Terapeuta Varias Clinicas";

/**
 * The single template the "Modelo" picker offers on record CREATION (W5-13,
 * SPEC-ficha-medica.md sec 1): Ficha Médica = the osteopathy lineage evolved to
 * v3, the current active version. The version resolver (PR #96) collapses
 * osteopathy v1/v2/v3 to v3; the W5-13 creation filter drops every other key
 * (ficha_geral / physiotherapy / nesa). The superseded osteopathy labels below
 * must NOT appear on creation.
 */
// W12-22: the current osteopathy version is now v5 (Rodica's R12 order, no CID).
// The picker labels options `${title} v${version}` and offers only the highest
// active version, so creation resolves to "Ficha Clínica v5".
export const TEMPLATE_CURRENT_LABEL = "Ficha Clínica v5";
export const TEMPLATE_SUPERSEDED_LABEL = "Osteopatia — Avaliação de Episódio v2";
/** A retired-from-creation template (still a real row; just not selectable). */
export const TEMPLATE_RETIRED_LABEL = "Fisioterapia — Avaliação de Episódio v4";

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
