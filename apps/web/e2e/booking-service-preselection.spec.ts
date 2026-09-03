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
import {
  PATIENTS,
  LOCATION,
  SERVICE,
  SERVICE_UNMAPPED,
  THERAPIST_NAME,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";

const SAVE = "Guardar";

test("PL-06a: the Serviço Select offers every active service (preselection, not restriction); an UNMAPPED service is offered and books", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 23);
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
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Re-read the saved appointment: the unmapped service persisted, proving the
  // booking was accepted end-to-end.
  await page.getByRole("button", { name: new RegExp(PATIENTS.joao.name) }).click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await expect(edit.getByLabel(/Serviço/i).locator("option:checked")).toHaveText(
    SERVICE_UNMAPPED.name,
  );
});
