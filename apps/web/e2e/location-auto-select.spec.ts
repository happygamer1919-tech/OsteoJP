/**
 * location-auto-select.spec.ts — booking Localização auto-fill from the
 * therapist's single active location (W4-12, owner ruling Ivan 2026-07-06).
 *
 * Fixtures (seed-e2e.mjs, DEDICATED — untouched by other specs):
 *   - THERAPIST_ONE_LOCATION: availability at exactly LOCATION_A (Linda-a-Velha)
 *     + Osteopatia → selecting them auto-fills BOTH Localização and Serviço.
 *   - THERAPIST_MULTI_LOCATION: availability at two active locations + Osteopatia
 *     → Serviço auto-fills (proves the selection effect ran) but Localização does
 *     NOT (multiple = manual).
 *
 * Runs as admin (default project storage; admin may schedule).
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment } from "./helpers";
import {
  LOCATION,
  LOCATION_B,
  THERAPIST_ONE_LOCATION,
  THERAPIST_MULTI_LOCATION,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";

test("single-location therapist auto-fills Localização + Serviço on one event, and stays editable (W4-12)", async ({
  page,
}) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 40));

  // One selection event → both auto-fills fire.
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_ONE_LOCATION });
  await expect(dialog.getByLabel(/Localização/i).locator("option:checked")).toHaveText(
    LOCATION.name, // Linda-a-Velha
  );
  await expect(dialog.getByLabel(/Serviço/i).locator("option:checked")).toHaveText("Osteopatia");

  // Editable / override: a manual location change is honored and not clobbered.
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION_B.name });
  await expect(dialog.getByLabel(/Localização/i).locator("option:checked")).toHaveText(
    LOCATION_B.name,
  );
});

test("multi-location therapist leaves Localização untouched (manual), while Serviço still auto-fills (W4-12)", async ({
  page,
}) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 41));

  const before = await dialog.getByLabel(/Localização/i).inputValue();

  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_MULTI_LOCATION });

  // Serviço auto-fills → the therapist-selection effect ran...
  await expect(dialog.getByLabel(/Serviço/i).locator("option:checked")).toHaveText("Osteopatia");
  // ...but Localização was NOT auto-filled (multiple active locations = manual).
  await expect(dialog.getByLabel(/Localização/i)).toHaveValue(before);
});
