/**
 * SCHED-17 - NESA, the shared resource, through the staff UI.
 *
 * RUNS WHERE THE NESA MIGRATION (0086) IS APPLIED, and says so when it skips.
 * `users.is_shared_resource` arrives with
 * packages/db/migrations/0086_nesa_shared_resource.sql. CI builds its database from
 * supabase/migrations, which carries 0086 since the promotion, so this file RUNS in
 * CI. It skips only on a database without the column.
 *
 * FIXTURES, built here and removed afterwards (never by the shared seed, which
 * also runs on databases that do not have the column):
 *   LOCATION_B "Consultório B (E2E)" plays CB, where the machine is installed;
 *   LOCATION   "Linda-a-Velha"       plays LV.
 *   NESA (E2E): a login-less users row with is_shared_resource, at CB, and
 *   is_bookable FALSE: GREEN's v3 production flags. Until SCHED-29.4 this row was
 *   bookable, which hid that owner, admin and reception lose the machine the moment
 *   is_bookable is false. The therapist tests never read is_bookable.
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
  // SCHED-29: rows where NESA is the SECOND participant. Left behind, they hold a
  // FK to both the NESA row and the patients, so the next run could delete
  // neither and would fail inserting the patients again.
  await db.from("appointments").delete().eq("tenant_id", TENANT_A).eq("practitioner_2_id", NESA_ID);
  if (cbOnlyId) {
    await db
      .from("availability_templates")
      .delete()
      .eq("tenant_id", TENANT_A)
      .eq("user_id", cbOnlyId)
      .eq("location_id", LOCATION_B.id)
      .eq("weekday", 3);
  }
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
      is_bookable: false,
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
  // SCHED-29: the CB-only therapist books UNDER THEIR OWN NAME at CB with NESA as
  // "Terapeuta 2", so they need hours at CB on this spec's Wednesday. The seed
  // gives them Monday at LV only, and availability is enforced (RB-03). Weekday
  // 3 is not a seeded row for this therapist, so cleanUp can remove exactly it.
  must(
    await db.from("availability_templates").insert({
      tenant_id: TENANT_A,
      user_id: cbOnlyId,
      location_id: LOCATION_B.id,
      weekday: 3,
      start_time: "09:00",
      end_time: "19:00",
      is_active: true,
    }),
    "CB-only therapist hours at CB on Wednesday",
  );
  // One patient per therapist, created by them, so each can find theirs in the
  // Paciente search under their own RLS. SCHED-29.4: both belong to CB by
  // primary_location_id, because the reception tests assign reception to clinics,
  // and an assigned receptionist's search is scoped to patients at those clinics
  // (patientLocationScope). Without it the search reads "Sem resultados".
  must(
    await db.from("patients").insert([
      { id: PATIENT_CB_ONLY.id, tenant_id: TENANT_A, full_name: PATIENT_CB_ONLY.name, created_by: cbOnlyId, primary_location_id: LOCATION_B.id },
      { id: PATIENT_BOTH.id, tenant_id: TENANT_A, full_name: PATIENT_BOTH.name, created_by: bothId, primary_location_id: LOCATION_B.id },
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

/**
 * SCHED-29 — NESA as a therapist's SECOND participant.
 *
 * The owner's requirement: a therapist booking at CB selects themselves as
 * primary and NESA as "Terapeuta 2". Nobody else, and no NESA option at LV.
 * Before this card the field listed every bookable user in the tenant for a
 * therapist, at either clinic, and the server accepted any of them.
 */
test("SCHED-29: a CB therapist's Terapeuta 2 is NESA and nobody else, and the booking keeps it", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await login(page, CB_ONLY_EMAIL);
  const dialog = await openNewAppointment(page, DAY);

  // Patient FIRST. Opening "Participantes secundários" mounts a second combobox,
  // "Paciente 2", and pickPatient's /Paciente/i then matches both (strict mode):
  // the first run of this test failed on exactly that, before reaching NESA.
  await pickPatient(dialog, PATIENT_CB_ONLY.name);

  await dialog.getByText("Participantes secundários (opcional)").click();
  const two = dialog.getByLabel("Terapeuta 2", { exact: true });
  await expect(two).toBeVisible();
  // The placeholder and NESA. Not the colleague at CB, not anyone at LV.
  await expect(two.locator("option")).toHaveText(["Selecionar terapeuta", NESA_NAME]);
  await two.selectOption({ label: NESA_NAME });

  await fillDate(dateField(dialog), DAY);
  await fillTime(dialog, "16:00");
  await save(dialog);
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const rows = must(
    await db
      .from("appointments")
      .select("id, practitioner_id, location_id")
      .eq("tenant_id", TENANT_A)
      .eq("practitioner_2_id", NESA_ID),
    "the booking with NESA as second participant",
  ) as { id: string; practitioner_id: string; location_id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.practitioner_id).toBe(cbOnlyId);
  expect(rows[0]!.location_id).toBe(LOCATION_B.id);
});

test("SCHED-29: at LV a therapist is offered no Terapeuta 2, and at CB only NESA", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await login(page, BOTH_EMAIL);
  const dialog = await openNewAppointment(page, DAY);
  const location = dialog.getByLabel(/Localização/i);

  await location.selectOption({ label: LOCATION.name });
  await dialog.getByText("Participantes secundários (opcional)").click();
  // Not an empty dropdown: the field is not there at all.
  await expect(dialog.getByLabel("Terapeuta 2", { exact: true })).toHaveCount(0);

  // The same therapist, the same drawer, at CB: NESA appears, and only NESA.
  await location.selectOption({ label: LOCATION_B.name });
  await expect(dialog.getByLabel("Terapeuta 2", { exact: true }).locator("option")).toHaveText([
    "Selecionar terapeuta",
    NESA_NAME,
  ]);
});

/**
 * SCHED-29.4 — OWNER, ADMIN AND RECEPTION ARE OFFERED NESA (Q-SCHED-29-4-1 = A).
 *
 * Walked as RECEPTION, with the machine carrying GREEN's v3 flags (shared, NOT
 * bookable). Before this card reception could neither filter by the machine nor
 * book it in either select, because all three controls read is_bookable.
 *
 * Reception is assigned to BOTH clinics for these tests: the server refuses a
 * machine to an admin or reception at a clinic they are not assigned to, and the
 * offer mirrors that, so an unassigned receptionist is offered no machine at all.
 */
const RECEPTION_EMAIL = "e2e-reception@osteojp.test";

async function receptionAtBothClinics(): Promise<string> {
  const reception = must(
    await db.from("users").select("id").eq("email", RECEPTION_EMAIL).single(),
    "the reception fixture",
  ) as { id: string };
  const added = must(
    await db
      .from("staff_locations")
      .upsert(
        [
          { tenant_id: TENANT_A, user_id: reception.id, location_id: LOCATION.id },
          { tenant_id: TENANT_A, user_id: reception.id, location_id: LOCATION_B.id },
        ],
        { onConflict: "tenant_id,user_id,location_id" },
      )
      .select("id"),
    "reception at both clinics",
  ) as { id: string }[];
  addedStaffLocationIds.push(...added.map((r) => r.id));
  return reception.id;
}

test("SCHED-29.4: reception's Terapeutas filter lists NESA by the machine flag, on the very next load", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  await receptionAtBothClinics();
  await login(page, RECEPTION_EMAIL);
  const filter = page.getByLabel("Terapeutas", { exact: true });
  const nesaOption = filter.locator("option", { hasText: NESA_NAME });

  try {
    // NEGATIVE ARM FIRST. Unflagged and not bookable, the machine is in no list.
    must(await db.from("users").update({ is_shared_resource: false }).eq("id", NESA_ID), "unflag the machine");
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await expect(filter).toBeVisible();
    await expect(nesaOption).toHaveCount(0);

    // Flagged, and read on the VERY NEXT load. No 60-second wait: the machine
    // does not come from the cached roster, and is_bookable is still false, so
    // this option can only have come from the per-request read.
    must(await db.from("users").update({ is_shared_resource: true }).eq("id", NESA_ID), "flag the machine");
    await page.goto(`/agenda?view=day&date=${DAY}`);
    await expect(filter).toBeVisible();
    await expect(nesaOption).toHaveCount(1);

    // The toolbar's clinic narrows it: not at LV, listed at CB.
    await page.goto(`/agenda?view=day&date=${DAY}&location=${LOCATION.id}`);
    await expect(filter).toBeVisible();
    await expect(nesaOption).toHaveCount(0);
    await page.goto(`/agenda?view=day&date=${DAY}&location=${LOCATION_B.id}`);
    await expect(nesaOption).toHaveCount(1);

    // And choosing it filters the agenda to the machine.
    await filter.selectOption({ label: NESA_NAME });
    await expect(page).toHaveURL(new RegExp(`therapist=${NESA_ID}`));
  } finally {
    await db.from("users").update({ is_shared_resource: true }).eq("id", NESA_ID);
  }
});

test("SCHED-29.4: reception's Terapeuta select offers NESA at CB and not at LV, and books it", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  const receptionId = await receptionAtBothClinics();
  await login(page, RECEPTION_EMAIL);
  const dialog = await openNewAppointment(page, DAY);
  const location = dialog.getByLabel(/Localização/i);
  const therapist = dialog.getByLabel(/Terapeuta/i).first();

  await location.selectOption({ label: LOCATION.name });
  await expect(therapist.locator("option", { hasText: NESA_NAME })).toHaveCount(0);
  await location.selectOption({ label: LOCATION_B.name });
  await expect(therapist.locator("option", { hasText: NESA_NAME })).toHaveCount(1);
  await therapist.selectOption({ label: NESA_NAME });

  await pickPatient(dialog, PATIENT_BOTH.name);
  await fillDate(dateField(dialog), DAY);
  await fillTime(dialog, "13:00");
  await save(dialog);
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const rows = must(
    await db
      .from("appointments")
      .select("id, location_id")
      .eq("tenant_id", TENANT_A)
      .eq("practitioner_id", NESA_ID)
      .eq("created_by", receptionId),
    "reception's NESA booking",
  ) as { id: string; location_id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.location_id).toBe(LOCATION_B.id);
});

test("SCHED-29.4: reception's Terapeuta 2 offers NESA at CB and not at LV, and the booking keeps it", async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? "");
  const receptionId = await receptionAtBothClinics();
  const person = must(
    await db.from("users").select("full_name").eq("id", cbOnlyId).single(),
    "the CB therapist's name",
  ) as { full_name: string };
  await login(page, RECEPTION_EMAIL);
  const dialog = await openNewAppointment(page, DAY);

  // Patient FIRST: opening the secondary panel mounts "Paciente 2" (see SCHED-29 above).
  await pickPatient(dialog, PATIENT_CB_ONLY.name);
  // The person before the clinic, so the clinic chosen last is the one that stands.
  await dialog.getByLabel(/Terapeuta/i).first().selectOption({ label: person.full_name });
  const location = dialog.getByLabel(/Localização/i);
  await location.selectOption({ label: LOCATION.name });

  await dialog.getByText("Participantes secundários (opcional)").click();
  const two = dialog.getByLabel("Terapeuta 2", { exact: true });
  await expect(two).toBeVisible();
  await expect(two.locator("option", { hasText: NESA_NAME })).toHaveCount(0);

  await location.selectOption({ label: LOCATION_B.name });
  await expect(two.locator("option", { hasText: NESA_NAME })).toHaveCount(1);
  await two.selectOption({ label: NESA_NAME });

  await fillDate(dateField(dialog), DAY);
  await fillTime(dialog, "09:00");
  await save(dialog);
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const rows = must(
    await db
      .from("appointments")
      .select("id, practitioner_id, location_id")
      .eq("tenant_id", TENANT_A)
      .eq("practitioner_2_id", NESA_ID)
      .eq("created_by", receptionId),
    "reception's booking with NESA as Terapeuta 2",
  ) as { id: string; practitioner_id: string; location_id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.practitioner_id).toBe(cbOnlyId);
  expect(rows[0]!.location_id).toBe(LOCATION_B.id);
});
