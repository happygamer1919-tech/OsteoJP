/**
 * SCHED-17 - NESA, the shared resource, through the staff UI.
 *
 * RUNS ONLY WHERE THE NESA MIGRATION IS APPLIED, and says so when it skips.
 * `users.is_shared_resource` arrives with
 * packages/db/migrations-pending/NEXT-AFTER-0085_nesa_shared_resource.sql, which is
 * held un-numbered until 0085 is on production. CI builds its database from
 * supabase/migrations, so the column is not there and this file skips with that
 * reason. It was run on a lane with the pending migration applied.
 *
 * FIXTURES, built here and removed afterwards (never by the shared seed, which
 * runs in CI where the column does not exist):
 *   LOCATION_B "Consultório B (E2E)" plays CB, where the machine is installed;
 *   LOCATION   "Linda-a-Velha"       plays LV.
 *   NESA (E2E): a login-less bookable users row with is_shared_resource, at CB.
 *   The CB-only therapist: "E2E Terapeuta Clinica Unica", assigned CB only.
 *   The two-clinic therapist: "E2E Terapeuta Varias Clinicas", assigned CB and LV.
 *
 * WHAT IT PROVES, the ruling first:
 *   1. A CB-only therapist is offered NESA besides themselves, is NOT offered LV
 *      at all, and books NESA at CB - the requirement, as a positive control.
 *   2. A therapist assigned to BOTH clinics picks NESA and LV, and is REFUSED with
 *      the shared-resource sentence; no row is written. LV is one of their
 *      clinics, so this is the refusal the app layer adds and RLS does not make.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PASSWORD, LOCATION, LOCATION_B, TENANT_A } from "./fixtures";
import { dateField, fillDate, fillTime, openNewAppointment } from "./helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const NESA_ID = "00000000-0000-4000-8000-00000000e5a0";
const NESA_NAME = "NESA (E2E)";
const CB_ONLY_EMAIL = "e2e-therapist-loc-one@osteojp.test";
const BOTH_EMAIL = "e2e-therapist-loc-multi@osteojp.test";
const PATIENT_CB_ONLY = { id: "00000000-0000-4000-8000-00000000e5a1", name: "Paciente NESA Um" };
const PATIENT_BOTH = { id: "00000000-0000-4000-8000-00000000e5a2", name: "Paciente NESA Dois" };
const REFUSAL = /Este equipamento só pode ser marcado numa localização onde está instalado/;

/** A Wednesday far enough ahead that nothing else in the suite books it. */
function bookingDay(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const DAY = bookingDay();

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

let db: SupabaseClient;
let skipReason: string | null = null;
let cbOnlyId = "";
let bothId = "";
const addedStaffLocationIds: string[] = [];

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function cleanUp(): Promise<void> {
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("practitioner_id", NESA_ID);
  await db.from("availability_templates").delete().eq("tenant_id", TENANT_A).eq("user_id", NESA_ID);
  await db.from("staff_locations").delete().eq("tenant_id", TENANT_A).eq("user_id", NESA_ID);
  if (addedStaffLocationIds.length > 0) {
    await db.from("staff_locations").delete().in("id", addedStaffLocationIds);
  }
  await db.from("patients").delete().in("id", [PATIENT_CB_ONLY.id, PATIENT_BOTH.id]);
  const gone = await db.from("users").delete().eq("id", NESA_ID);
  // A users row something still references cannot be deleted; retire it instead,
  // so it can neither be booked nor reappear in any list.
  if (gone.error) await db.from("users").update({ is_active: false, is_bookable: false }).eq("id", NESA_ID);
}

test.beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    skipReason = "no service-role key in this environment, so the NESA fixture cannot be built";
    return;
  }
  db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const probe = await db.from("users").select("id, is_shared_resource").limit(1);
  if (probe.error) {
    skipReason =
      "users.is_shared_resource does not exist on this database: the NESA migration is " +
      `not applied here (${probe.error.code ?? probe.error.message})`;
    return;
  }

  const role = must(
    await db.from("roles").select("id").eq("tenant_id", TENANT_A).eq("slug", "therapist").single(),
    "therapist role",
  ) as { id: string };
  const people = must(
    await db.from("users").select("id, email").in("email", [CB_ONLY_EMAIL, BOTH_EMAIL]),
    "therapist fixtures",
  ) as { id: string; email: string }[];
  cbOnlyId = people.find((p) => p.email === CB_ONLY_EMAIL)?.id ?? "";
  bothId = people.find((p) => p.email === BOTH_EMAIL)?.id ?? "";
  if (!cbOnlyId || !bothId) throw new Error("the two therapist fixtures are missing from the seed");

  await cleanUp();

  must(
    await db.from("users").upsert({
      id: NESA_ID,
      tenant_id: TENANT_A,
      role_id: role.id,
      email: "e2e-nesa@osteojp.test",
      full_name: NESA_NAME,
      is_bookable: true,
      is_active: true,
      is_shared_resource: true,
    }),
    "NESA resource row",
  );
  must(
    await db.from("staff_locations").insert({ tenant_id: TENANT_A, user_id: NESA_ID, location_id: LOCATION_B.id }),
    "NESA at CB",
  );
  const added = must(
    await db
      .from("staff_locations")
      .upsert(
        [
          { tenant_id: TENANT_A, user_id: cbOnlyId, location_id: LOCATION_B.id },
          { tenant_id: TENANT_A, user_id: bothId, location_id: LOCATION_B.id },
          { tenant_id: TENANT_A, user_id: bothId, location_id: LOCATION.id },
        ],
        { onConflict: "tenant_id,user_id,location_id" },
      )
      .select("id"),
    "therapist clinic assignments",
  ) as { id: string }[];
  addedStaffLocationIds.push(...added.map((r) => r.id));
  for (const weekday of [1, 2, 3, 4, 5]) {
    must(
      await db.from("availability_templates").insert({
        tenant_id: TENANT_A,
        user_id: NESA_ID,
        location_id: LOCATION_B.id,
        weekday,
        start_time: "09:00",
        end_time: "19:00",
        is_active: true,
      }),
      "NESA hours at CB",
    );
  }
  // One patient per therapist, created by them, so each can find theirs in the
  // Paciente search under their own RLS.
  must(
    await db.from("patients").insert([
      { id: PATIENT_CB_ONLY.id, tenant_id: TENANT_A, full_name: PATIENT_CB_ONLY.name, created_by: cbOnlyId },
      { id: PATIENT_BOTH.id, tenant_id: TENANT_A, full_name: PATIENT_BOTH.name, created_by: bothId },
    ]),
    "patients",
  );
});

test.afterAll(async () => {
  if (!skipReason && db) await cleanUp();
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Iniciar sessão/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function pickPatient(dialog: Locator, name: string): Promise<void> {
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(name);
  await dialog.getByRole("option", { name }).click();
}

async function save(dialog: Locator): Promise<void> {
  // Exactly "Guardar" (appointment.save), never "Guardar mesmo assim", which is
  // the conflict override and must not be what this spec presses.
  await dialog.getByRole("button", { name: /^Guardar$/ }).click();
}

test("a CB-only therapist is offered NESA, cannot choose LV, and books NESA at CB", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await login(page, CB_ONLY_EMAIL);
  const dialog = await openNewAppointment(page, DAY);

  const therapist = dialog.getByLabel(/Terapeuta/i).first();
  await expect(therapist.locator("option", { hasText: NESA_NAME })).toHaveCount(1);
  await therapist.selectOption({ label: NESA_NAME });

  // LV is not offered at all: this therapist's bookable locations are CB only,
  // so the form shows CB and the NESA-at-LV booking cannot even be expressed.
  await expect(dialog.getByText(LOCATION_B.name).first()).toBeVisible();
  await expect(dialog.locator("option", { hasText: LOCATION.name })).toHaveCount(0);

  await pickPatient(dialog, PATIENT_CB_ONLY.name);
  await fillDate(dateField(dialog), DAY);
  await fillTime(dialog, "11:00");
  await save(dialog);
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const rows = must(
    await db
      .from("appointments")
      .select("id, location_id, created_by")
      .eq("tenant_id", TENANT_A)
      .eq("practitioner_id", NESA_ID),
    "the booked NESA row",
  ) as { id: string; location_id: string; created_by: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.location_id).toBe(LOCATION_B.id);
  expect(rows[0]!.created_by).toBe(cbOnlyId);
});

test("a therapist at BOTH clinics is refused NESA at LV, and nothing is written", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await login(page, BOTH_EMAIL);
  const dialog = await openNewAppointment(page, DAY);

  await dialog.getByLabel(/Terapeuta/i).first().selectOption({ label: NESA_NAME });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
  await pickPatient(dialog, PATIENT_BOTH.name);
  await fillDate(dateField(dialog), DAY);
  await fillTime(dialog, "15:00");
  await save(dialog);

  await expect(dialog.getByText(REFUSAL)).toBeVisible({ timeout: 10_000 });
  const atLv = must(
    await db
      .from("appointments")
      .select("id")
      .eq("tenant_id", TENANT_A)
      .eq("practitioner_id", NESA_ID)
      .eq("location_id", LOCATION.id),
    "NESA rows at LV",
  ) as { id: string }[];
  expect(atLv).toHaveLength(0);
});
