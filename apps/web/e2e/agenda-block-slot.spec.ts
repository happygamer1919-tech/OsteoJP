/**
 * agenda-block-slot.spec.ts (W12-28): reception/staff can block a slot straight
 * from the agenda ("Bloquear horário"), retiring the "Não Marcar" fake-appointment
 * hack. Runs as ADMIN (settings:manage - the capability createTimeOffBlock
 * enforces). The block reuses the existing time_off model, so it renders as a
 * blocked band and the slot becomes non-bookable through the existing paths.
 *
 * Uses a per-run-unique far-future day (blocks accrue harmlessly there); no
 * cleanup needed and no collision with other specs.
 */
import { test, expect } from "@playwright/test";
import { THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

test("W12-28: block a slot from the agenda; it renders as a band + is non-bookable", async ({
  page,
}, testInfo) => {
  const date = futureDate(RUN_DAY_BASE + 80 + testInfo.retry * 100);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/agenda?view=day&date=${date}`);

  // Open the agenda-side block affordance (admin has settings:manage).
  await page.getByRole("button", { name: "Bloquear horário" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Block 09:00-11:00 for the therapist, straight from the agenda.
  await dialog.getByLabel("Terapeuta", { exact: true }).selectOption({ label: THERAPIST_NAME });
  await dialog.getByTestId("block-date").fill(date);
  await dialog.getByTestId("block-start").fill("09:00");
  await dialog.getByTestId("block-end").fill("11:00");
  await dialog.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Scope the agenda to the therapist so the band renders (W9-04: no therapist
  // axis, so a full-width band is only truthful under a single-therapist filter).
  await page.getByLabel("Terapeutas").selectOption({ label: THERAPIST_NAME });
  await expect(page).toHaveURL(/therapist=/);

  // The block created from the agenda renders as a band ...
  const band = page.getByTestId("agenda-blocked-band");
  await expect(band.first()).toBeVisible({ timeout: 8_000 });
  await expect(band.first()).toContainText("Tempo bloqueado");

  // ... and a slot inside 09:00-11:00 is non-bookable (disabled).
  const blockedSlot = page.getByRole("button", { name: /09:00 - Tempo bloqueado/ });
  await expect(blockedSlot.first()).toBeDisabled();
});
