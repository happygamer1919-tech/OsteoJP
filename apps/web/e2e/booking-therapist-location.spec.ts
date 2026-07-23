/**
 * booking-therapist-location.spec.ts (W12-23): the new-appointment drawer's
 * therapist dropdown scopes to the SELECTED location's team once the user picks a
 * location. Runs as admin (default storageState).
 *
 * Uses the same seeded roster as agenda-location-filter.spec.ts:
 *   "E2E Terapeuta Clinica Unica"   -> Linda-a-Velha only
 *   "E2E Terapeuta Varias Clinicas" -> Linda-a-Velha + Consultório B
 *   "E2E Therapist"                 -> unassigned (no availability rows)
 *
 * On open the dropdown is the full roster (default-location behaviour, so a
 * therapist-first booking is unaffected). After the user CHANGES the location it
 * narrows: an LV-only therapist and the unassigned one drop out under Consultório
 * B, and both LV therapists return under Linda-a-Velha.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment } from "./helpers";
import {
  LOCATION,
  LOCATION_B,
  THERAPIST_ONE_LOCATION,
  THERAPIST_MULTI_LOCATION,
  THERAPIST_NAME,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";

test("W12-23: the booking therapist dropdown narrows to the selected location's team", async ({
  page,
}, testInfo) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 70 + testInfo.retry));

  // The PRIMARY Terapeuta select (the secondary "Terapeuta 2" is collapsed/unmounted).
  const therapist = dialog.getByLabel(/Terapeuta/i);
  const names = async () => (await therapist.locator("option").allTextContents()).map((t) => t.trim());
  const location = dialog.getByLabel(/Localização/i);

  // On open (default location, no explicit choice yet) the full roster shows,
  // including the unassigned therapist - so a therapist-first booking is unaffected.
  await expect.poll(names).toContain(THERAPIST_NAME);

  // Pick Consultório B: only its team (the multi-location therapist) remains; the
  // LV-only therapist and the unassigned one drop out.
  await location.selectOption({ label: LOCATION_B.name });
  await expect.poll(names).toContain(THERAPIST_MULTI_LOCATION);
  await expect.poll(names).not.toContain(THERAPIST_ONE_LOCATION);
  await expect.poll(names).not.toContain(THERAPIST_NAME);

  // Switch to Linda-a-Velha: both LV therapists are offered.
  await location.selectOption({ label: LOCATION.name });
  await expect.poll(names).toContain(THERAPIST_ONE_LOCATION);
  await expect.poll(names).toContain(THERAPIST_MULTI_LOCATION);
});
