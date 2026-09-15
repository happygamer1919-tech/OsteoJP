/**
 * booking-service-preselection.spec.ts (PL-06a, owner ruling 2026-07-28).
 *
 * The per-therapist service mapping is a PRESELECTION, never a RESTRICTION. The
 * booking "Serviço" Select must list EVERY active service regardless of the
 * chosen therapist's mapping; the mapping only supplies the default (the primary
 * = oldest mapped service). A therapist stays bookable for any active service the
 * clinic needs.
 *
 * The E2E therapist is mapped to Osteopatia (primary) + NESA only. "Drenagem
 * Linfática" is an ACTIVE service the therapist is NOT mapped to (seed-e2e.mjs).
 *
 * Red-then-green discriminator: pre-fix the drawer FILTERED the Select to the
 * mapping, so "Drenagem Linfática" was ABSENT and could not be booked. Post-fix
 * it is offered, and booking it succeeds and persists (the server has no
 * therapist+service reject path — the negative half of the DoD).
 *
 * Runs as admin (appointments:write). Books on its own future day; the seed
 * creates no appointments, so re-runs never collide.
 */
import { test, expect } from "@playwright/test";
import { dateField, fillDate, fillTime, openNewAppointment } from "./helpers";
import { serviceClient, therapistUserId } from "./helpers/confirm-code";
import {
  PATIENTS,
  LOCATION,
  SERVICE,
  SERVICE_UNMAPPED,
  TENANT_A,
  THERAPIST_NAME,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";

const SAVE = "Guardar";

/** João's bookings with the E2E therapist on `date` (Lisbon day, UTC-padded). */
async function joaoBookingIds(db: ReturnType<typeof serviceClient>, therapist: string, date: string): Promise<string[]> {
  const { data, error } = await db
    .from("appointments")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("patient_id", PATIENTS.joao.id)
    .eq("practitioner_id", therapist)
    .gte("starts_at", `${date}T00:00:00.000Z`)
    .lte("starts_at", `${date}T23:59:59.999Z`);
  expect(error).toBeNull();
  return (data ?? []).map((r) => r.id as string);
}

test("PL-06a: the Serviço Select offers every active service (preselection, not restriction); an UNMAPPED service is offered and books", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 23);

  // ANOTHER JOAO BOOKING ON THIS DAY, ON PURPOSE
  // (LE-e2e-booking-service-preselection-35-red-on-main-at-retries-0).
  // agenda-week-6day books João Pereira at 10:00 on the Saturday of the week
  // holding RUN_DAY_BASE + 22. Whenever that day is a Friday - one base in seven -
  // the Saturday IS this test's day, and the old re-read clicked the FIRST João
  // card on the grid: that 10:00 Osteopatia booking, not this one (run
  // 34903695665, RUN_DAY_BASE 290). The neighbour is now inserted EVERY run, with
  // a different therapist so no conflict rule is involved, and the re-read below
  // has to open this test's own booking by id or fail.
  const db = serviceClient();
  const therapistId = await therapistUserId(db);
  const { data: other, error: otherErr } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", "e2e-therapist2@osteojp.test")
    .limit(1);
  expect(otherErr).toBeNull();
  expect(other?.length, "seeded e2e-therapist2 is missing").toBe(1);
  const { error: neighbourErr } = await db.from("appointments").insert({
    tenant_id: TENANT_A,
    patient_id: PATIENTS.joao.id,
    practitioner_id: other![0].id,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: `${date}T09:00:00.000Z`,
    ends_at: `${date}T09:45:00.000Z`,
    status: "scheduled",
  });
  expect(neighbourErr).toBeNull();

  const dialog = await openNewAppointment(page, date);

  const therapist = dialog.getByLabel(/Terapeuta/i);
  const service = dialog.getByLabel(/Serviço/i);

  // Picking the therapist preselects the PRIMARY (Osteopatia, oldest mapping).
  // The mapping drives ONLY this default — it must not narrow the option list.
  await expect(service).toHaveValue("");
  await therapist.selectOption({ label: THERAPIST_NAME });
  await expect(service).toHaveValue(SERVICE.id);

  // Every active service is offered, INCLUDING one the therapist is not mapped
  // to. Pre-fix (mapping = restriction) this option was filtered out; its
  // presence is the ruling's discriminator.
  await expect(service.locator("option", { hasText: SERVICE_UNMAPPED.name })).toHaveCount(1);
  await expect(service.locator("option", { hasText: SERVICE.name })).toHaveCount(1);
  await expect(service.locator("option", { hasText: "NESA" })).toHaveCount(1);

  // Book the UNMAPPED service. The server must accept it — no code path rejects
  // a therapist+service pair (the negative half of the DoD).
  await service.selectOption({ label: SERVICE_UNMAPPED.name });
  await expect(service.locator("option:checked")).toHaveText(SERVICE_UNMAPPED.name);

  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.joao.name);
  await dialog.getByRole("option", { name: PATIENTS.joao.name }).click();
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
  await fillDate(dateField(dialog), date);
  await fillTime(dialog, "11:00");
  const before = await joaoBookingIds(db, therapistId, date);
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Re-read the saved appointment BY ITS ID: the unmapped service persisted,
  // proving the booking was accepted end-to-end. The id is the one booking of
  // João with the E2E therapist on this day that did not exist before the save,
  // so neither the inserted neighbour nor agenda-week-6day's booking can stand in.
  let mine: string[] = [];
  await expect(async () => {
    const after = await joaoBookingIds(db, therapistId, date);
    mine = after.filter((id) => !before.includes(id));
    expect(mine).toHaveLength(1);
  }).toPass({ timeout: 10_000 });
  await page.locator(`[data-appointment-id="${mine[0]}"]`).click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await expect(edit.getByLabel(/Serviço/i).locator("option:checked")).toHaveText(
    SERVICE_UNMAPPED.name,
  );
});
