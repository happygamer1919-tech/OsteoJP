/**
 * seed-e2e.mjs — deterministic, idempotent E2E fixture.
 *
 * Provisions the seeded test tenant the Playwright suite logs into. Pure
 * supabase-js (service-role → PostgREST + Auth admin) so it has no extra deps
 * and bypasses RLS the same way the real ingestion/seed paths do.
 *
 * What it creates (all with fixed UUIDs / known credentials so specs can rely on
 * exact data — no random fixtures, no hardcoded dates):
 *   Tenant A (00..a1, from supabase/seed.sql) — the suite's tenant:
 *     - 3 users: e2e-admin / e2e-therapist / e2e-reception (role claims via the
 *       custom_access_token_hook, enabled in config.toml)
 *     - 1 location, 1 service
 *     - patients: "Maria Silva" (active, searchable by NIF/phone), two more
 *       active, and one PRE-SOFT-DELETED patient (absent-from-active-views guard)
 *     - form templates (osteopathy/physiotherapy/nesa — files that carry a
 *       JSON `schema`; the x-form-ref wrappers are skipped)
 *   Tenant B (00..b2) — a SECOND tenant with one patient, for the cross-tenant
 *     denial guardrail. No login user needed.
 *
 * Re-runnable: every write is an upsert (or lookup-then-update for auth users).
 *
 * Env (falls back to local Supabase defaults so `node seed-e2e.mjs` just works):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node apps/web/e2e/seed/seed-e2e.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, "../../../../packages/db/seed/form-templates");

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  // Local Supabase default service-role JWT (non-secret, dev-only).
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// ---------------------------------------------------------------------------
// Deterministic fixture constants (exported shape mirrored in e2e/fixtures.ts)
// ---------------------------------------------------------------------------
export const TENANT_A = "00000000-0000-0000-0000-0000000000a1"; // supabase/seed.sql
export const TENANT_B = "00000000-0000-0000-0000-0000000000b2";
export const E2E_PASSWORD = "E2ePassw0rd!";

const USERS = [
  { slug: "admin", email: "e2e-admin@osteojp.test", fullName: "E2E Admin" },
  { slug: "therapist", email: "e2e-therapist@osteojp.test", fullName: "E2E Therapist" },
  { slug: "reception", email: "e2e-reception@osteojp.test", fullName: "E2E Reception" },
  // A SECOND therapist with ZERO therapist_services (Catarina-Vieira case, W4-01):
  // `roleSlug` is the real role; `slug` is only the unique key for idBySlug.
  {
    slug: "therapist2",
    roleSlug: "therapist",
    email: "e2e-therapist2@osteojp.test",
    fullName: "E2E Terapeuta Sem Servicos",
  },
  // W4-12 location auto-fill fixtures — DEDICATED, untouched by other specs.
  // `therapistLocOne` (name deliberately avoids the token "Local", which collides
  // with the working-hours "Local" field under Playwright substring getByLabel):
  // availability at exactly ONE active location (LOCATION_A)
  // so selecting them auto-fills Localização; `therapistLocMulti` has availability
  // at TWO active locations so it must NOT auto-fill.
  {
    slug: "therapistLocOne",
    roleSlug: "therapist",
    email: "e2e-therapist-loc-one@osteojp.test",
    fullName: "E2E Terapeuta Clinica Unica",
  },
  {
    slug: "therapistLocMulti",
    roleSlug: "therapist",
    email: "e2e-therapist-loc-multi@osteojp.test",
    fullName: "E2E Terapeuta Varias Clinicas",
  },
];

const LOCATION_A = "00000000-0000-0000-0000-00000000a101";
// Archived (is_active=false) location — must be ABSENT from every selection
// dropdown (W2-02 item 2) while its name stays displayable on the read path.
const LOCATION_ARCHIVED = "00000000-0000-0000-0000-00000000a102";
const LOCATION_ARCHIVED_NAME = "Sede Antiga (Arquivada)";
// Dedicated active location for the W2-12 working-hours test. No other spec
// books here, so creating availability for a therapist AT THIS LOCATION cannot
// pollute the shared Linda-a-Velha bookings via the per-(user,location)
// availability-conflict rule.
const LOCATION_B = "00000000-0000-0000-0000-00000000a103";
const LOCATION_B_NAME = "Consultório B (E2E)";
const SERVICE_A = "00000000-0000-0000-0000-00000000a201";
// NESA contraindication-sensitive service (W2-08) — pairs with Ana's epilepsy
// flag to drive the soft booking warning.
const SERVICE_NESA = "00000000-0000-0000-0000-00000000a202";
const SERVICE_NESA_NAME = "NESA (sensível)";

const PATIENTS_A = [
  {
    id: "00000000-0000-0000-0000-00000000a301",
    full_name: "Maria Silva",
    nif: "123456789",
    phone: "+351 912 345 678",
    email: "maria.silva@example.pt",
    deleted_at: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000a302",
    full_name: "João Pereira",
    nif: "234567891",
    phone: "+351 913 000 002",
    email: null,
    deleted_at: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000a303",
    full_name: "Ana Costa",
    nif: "345678912",
    phone: "+351 914 000 003",
    email: null,
    deleted_at: null,
    // NESA contraindication flag (W2-08): drives the soft booking warning when
    // paired with the contraindication-sensitive service seeded below.
    contraindication_epilepsy: true,
  },
  {
    // Pre-soft-deleted — must NEVER appear in the active list or search.
    // Name is deliberately DIGIT-FREE so a name search doesn't trip the
    // NIF/phone digit-matcher in searchPatients().
    id: "00000000-0000-0000-0000-00000000a3de",
    full_name: "Carlos Arquivado Teste",
    nif: "999999999",
    phone: "+351 919 999 999",
    email: null,
    deleted_at: new Date("2026-01-01T00:00:00Z").toISOString(),
  },
];

const PATIENT_B = {
  id: "00000000-0000-0000-0000-00000000b301",
  full_name: "Beatriz Outro-Tenant",
  nif: "111222333",
  phone: null,
  email: null,
};

const ROLE_ROWS = (tenantId) => [
  { tenant_id: tenantId, slug: "owner", name: "Owner", description: "Full access." },
  { tenant_id: tenantId, slug: "admin", name: "Admin", description: "Tenant admin." },
  { tenant_id: tenantId, slug: "therapist", name: "Therapist", description: "Clinician." },
  { tenant_id: tenantId, slug: "reception", name: "Receptionist", description: "Front desk." },
];

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must(error, what) {
  if (error) throw new Error(`${what}: ${error.message ?? JSON.stringify(error)}`);
}

async function ensureTenant(id, name, slug) {
  const { error } = await db.from("tenants").upsert({ id, name, slug }, { onConflict: "id" });
  must(error, `tenant ${slug}`);
}

async function ensureRoles(tenantId) {
  const { error } = await db
    .from("roles")
    .upsert(ROLE_ROWS(tenantId), { onConflict: "tenant_id,slug" });
  must(error, `roles ${tenantId}`);
}

async function roleId(tenantId, slug) {
  const { data, error } = await db
    .from("roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .single();
  must(error, `lookup role ${slug}`);
  return data.id;
}

/** Create or update an auth user; return its id. Idempotent. */
async function ensureAuthUser(email, password) {
  // listUsers is paginated; the local fixture set is tiny so page 1 suffices.
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  must(listErr, "listUsers");
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    must(error, `update auth user ${email}`);
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  must(error, `create auth user ${email}`);
  return data.user.id;
}

async function ensureUsers() {
  /** slug -> public.users.id, so downstream seeds (e.g. therapist_services) can
   *  reference the auth-generated therapist id. */
  const idBySlug = {};
  for (const u of USERS) {
    const id = await ensureAuthUser(u.email, E2E_PASSWORD);
    const rid = await roleId(TENANT_A, u.roleSlug ?? u.slug);
    const { error } = await db.from("users").upsert(
      {
        id,
        tenant_id: TENANT_A,
        role_id: rid,
        email: u.email,
        full_name: u.fullName,
        is_active: true,
      },
      { onConflict: "id" },
    );
    must(error, `public.users ${u.email}`);
    idBySlug[u.slug] = id;
  }
  return idBySlug;
}

/**
 * therapist_services mapping (0023) for the E2E therapist. Feeds the booking
 * form's Serviço auto-select (W3-03): the form defaults Serviço to the FIRST
 * mapped service. Osteopatia is inserted first so it is oldest (created_at) and
 * thus the default; NESA stays mapped so the contraindication test can still
 * pick it. Two separate upserts guarantee a stable created_at order.
 */
async function ensureTherapistServices(therapistUserId) {
  for (const serviceId of [SERVICE_A, SERVICE_NESA]) {
    const { error } = await db.from("therapist_services").upsert(
      { tenant_id: TENANT_A, therapist_user_id: therapistUserId, service_id: serviceId },
      { onConflict: "tenant_id,therapist_user_id,service_id" },
    );
    must(error, `therapist_services ${serviceId}`);
  }
}

/**
 * availability_templates row (0006) = the therapist↔location association W4-12
 * derives locations from. One weekday window per (therapist, location) is enough
 * to make the location "assigned". Deduped on the natural key so re-seeding is
 * idempotent.
 */
async function ensureAvailability(therapistUserId, locationId, weekday) {
  const { error } = await db.from("availability_templates").upsert(
    {
      tenant_id: TENANT_A,
      user_id: therapistUserId,
      location_id: locationId,
      weekday,
      start_time: "09:00",
      end_time: "13:00",
      is_active: true,
    },
    {
      onConflict:
        "tenant_id,user_id,location_id,weekday,start_time,end_time,valid_from,valid_until",
    },
  );
  must(error, `availability_templates ${therapistUserId}@${locationId}`);
}

/**
 * W4-12 location auto-fill fixtures: one therapist assigned to exactly ONE active
 * location (+ a service, so selecting them auto-fills BOTH on one event), and one
 * assigned to TWO active locations (must not auto-fill).
 */
async function ensureLocationFixtures(idBySlug) {
  await ensureAvailability(idBySlug.therapistLocOne, LOCATION_A, 1); // single active location
  await ensureTherapistServices(idBySlug.therapistLocOne); // + Osteopatia, for the combined test
  await ensureAvailability(idBySlug.therapistLocMulti, LOCATION_A, 1);
  await ensureAvailability(idBySlug.therapistLocMulti, LOCATION_B, 2); // two active locations
  // A service on the multi therapist too, so the negative test has an observable
  // signal (Serviço auto-fills) proving the therapist-selection effect ran while
  // Localização was deliberately left untouched.
  await ensureTherapistServices(idBySlug.therapistLocMulti);
}

async function ensureBaseData() {
  must(
    (await db.from("locations").upsert(
      { id: LOCATION_A, tenant_id: TENANT_A, name: "Linda-a-Velha", phone: "+351 210 000 000", is_active: true },
      { onConflict: "id" },
    )).error,
    "location",
  );
  must(
    (await db.from("locations").upsert(
      { id: LOCATION_ARCHIVED, tenant_id: TENANT_A, name: LOCATION_ARCHIVED_NAME, is_active: false },
      { onConflict: "id" },
    )).error,
    "location-archived",
  );
  must(
    (await db.from("locations").upsert(
      { id: LOCATION_B, tenant_id: TENANT_A, name: LOCATION_B_NAME, is_active: true },
      { onConflict: "id" },
    )).error,
    "location-b",
  );
  must(
    (await db.from("services").upsert(
      { id: SERVICE_A, tenant_id: TENANT_A, location_id: LOCATION_A, name: "Osteopatia", duration_min: 60, is_active: true },
      { onConflict: "id" },
    )).error,
    "service",
  );
  must(
    (await db.from("services").upsert(
      { id: SERVICE_NESA, tenant_id: TENANT_A, location_id: LOCATION_A, name: SERVICE_NESA_NAME, duration_min: 60, is_active: true, contraindication_sensitive: true },
      { onConflict: "id" },
    )).error,
    "service-nesa",
  );

  for (const p of PATIENTS_A) {
    must(
      (await db.from("patients").upsert({ tenant_id: TENANT_A, ...p }, { onConflict: "id" })).error,
      `patient ${p.full_name}`,
    );
  }
  must(
    (await db.from("patients").upsert(
      { tenant_id: TENANT_B, deleted_at: null, ...PATIENT_B },
      { onConflict: "id" },
    )).error,
    "patient B",
  );
}

async function ensureFormTemplates() {
  const files = (await readdir(TEMPLATES_DIR)).filter((f) => f.endsWith(".json")).sort();
  const rows = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(join(TEMPLATES_DIR, file), "utf8"));
    // The x-form-ref wrappers carry no `schema` body — they are not standalone
    // templates; skip them (matches the real loader's contract).
    if (!parsed.schema || typeof parsed.schema !== "object") continue;
    rows.push({
      tenant_id: TENANT_A,
      key: parsed.key,
      version: parsed.version,
      title: parsed.title,
      schema: parsed.schema,
      is_active: true,
    });
  }
  if (rows.length > 0) {
    const { error } = await db
      .from("form_templates")
      .upsert(rows, { onConflict: "tenant_id,key,version" });
    must(error, "form_templates");
  }
  return rows.map((r) => `${r.key} v${r.version}`);
}

// ---------------------------------------------------------------------------
// AI-ingested review draft (W5-17) — an ai_ingested clinical_record awaiting
// review, mirroring the ingestion store's write (store.ts): status='draft',
// ai_review_state='pending_review', form_template_id NULL, and the raw partner
// payload verbatim under data._aiIngestionRaw. The twelve Ficha Médica AI keys
// sit at their field paths inside the raw payload (identity mapping). The
// Revisão Consulta "Assumir" opens it in the Ficha Médica editor.
// Deterministic id so revisao-consulta.spec.ts targets it. Reset to
// pending_review on every run so the claim → sign flow is repeatable.
// ---------------------------------------------------------------------------

const AI_REVIEW_DRAFT_ID = "00000000-0000-0000-0000-00000000ad17";
const AI_REVIEW_DRAFT_PATIENT = "00000000-0000-0000-0000-00000000a302"; // João Pereira

async function ensureAiReviewDraft() {
  const rawPayload = {
    template: "osteopathy",
    consultation_reason: "AI Motivo consulta lombar",
    relief_aggravation: "AI Alivio em repouso",
    clinical_history: "AI Antecedentes",
    systems_review: {
      neurological: "AI Neurologico sem alteracoes",
      cardiovascular: "AI Cardiovascular normal",
      respiratory: "AI Respiratorio normal",
      gastrointestinal: "AI GI normal",
      urological_gynecological: "AI Uro normal",
      endocrine: "AI Endocrino normal",
    },
    treatment_objectives: "AI Objectivos",
    treatment_plan: "AI Plano",
    observations: "AI Observacoes iniciais",
  };
  // Upsert resets the row to a fresh pending_review draft on every run, so the
  // claim + sign flow always starts from the same state (idempotent, re-runnable).
  const { error } = await db.from("clinical_records").upsert(
    {
      id: AI_REVIEW_DRAFT_ID,
      tenant_id: TENANT_A,
      patient_id: AI_REVIEW_DRAFT_PATIENT,
      source: "ai_ingested",
      status: "draft",
      ai_review_state: "pending_review",
      form_template_id: null,
      version: 1,
      supersedes_id: null,
      signed_by: null,
      signed_at: null,
      data: { _aiIngestionRaw: rawPayload },
    },
    { onConflict: "id" },
  );
  must(error, "ai review draft");
}

// ---------------------------------------------------------------------------
// Portal patient — an auth user linked to Maria Silva's patient row.
// Used by portal-reminders.spec.ts. Credentials: E2E_PORTAL_PATIENT_EMAIL /
// E2E_PASSWORD. The seed resets reminder prefs to a known initial state on
// every run so toggle-persistence tests start deterministically.
// ---------------------------------------------------------------------------

const E2E_PORTAL_PATIENT_EMAIL = "e2e-patient@osteojp.test";
const MARIA_SILVA_ID = PATIENTS_A[0].id; // "00000000-0000-0000-0000-00000000a301"

async function ensurePortalPatient() {
  // Create (or update) the portal patient auth user.
  const authId = await ensureAuthUser(E2E_PORTAL_PATIENT_EMAIL, E2E_PASSWORD);

  // Link the auth user to Maria Silva's patient row and reset reminder prefs
  // to the known initial state (sms=true, email=false) so toggle tests are
  // deterministic across re-runs.
  const { error } = await db
    .from("patients")
    .update({
      auth_user_id: authId,
      activated_at: new Date().toISOString(),
      reminder_sms_enabled: true,
      reminder_email_enabled: false,
    })
    .eq("id", MARIA_SILVA_ID)
    .eq("tenant_id", TENANT_A);
  must(error, `link portal patient auth_user_id for ${MARIA_SILVA_ID}`);
}

async function main() {
  await ensureTenant(TENANT_A, "OsteoJP (E2E)", "osteojp-preview");
  await ensureTenant(TENANT_B, "OsteoJP Other (E2E)", "osteojp-e2e-other");
  await ensureRoles(TENANT_A);
  await ensureRoles(TENANT_B);
  const userIds = await ensureUsers();
  await ensureBaseData();
  await ensureTherapistServices(userIds.therapist);
  await ensureLocationFixtures(userIds);
  await ensurePortalPatient();
  const templates = await ensureFormTemplates();
  // AI review draft depends on templates existing (the editor resolves the Ficha
  // Médica template by key when the record's form_template_id is null).
  await ensureAiReviewDraft();

  console.log("[seed-e2e] tenant A:", TENANT_A);
  console.log("[seed-e2e] tenant B:", TENANT_B);
  console.log("[seed-e2e] users:", USERS.map((u) => `${u.email} (${u.slug})`).join(", "));
  console.log("[seed-e2e] patients A:", PATIENTS_A.length, "(1 soft-deleted)");
  console.log("[seed-e2e] portal patient:", E2E_PORTAL_PATIENT_EMAIL, "→", MARIA_SILVA_ID);
  console.log("[seed-e2e] ai review draft:", AI_REVIEW_DRAFT_ID, "→", AI_REVIEW_DRAFT_PATIENT);
  console.log("[seed-e2e] templates:", templates.join(", "));
  console.log("[seed-e2e] done.");
}

main().catch((err) => {
  console.error("[seed-e2e] FAILED:", err.message ?? err);
  process.exit(1);
});
