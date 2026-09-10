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
import { fillDate, fillTime } from "./helpers";

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
  await dialog.getByTestId("block-therapist").selectOption({ label: THERAPIST_NAME });
  await fillDate(dialog.getByTestId("block-date"), date);
  // W12-31: block times are 24h TimeFields (select-based), driven via fillTime.
  await fillTime(dialog.getByTestId("block-start"), "09:00");
  await fillTime(dialog.getByTestId("block-end"), "11:00");

  // ---- SCHED-18: THE NOTE IS REQUIRED, ASSERTED BEFORE IT IS SUPPLIED -----
  // Pressing Bloquear with every OTHER field filled must refuse and say why. If
  // this passed straight through, the rest of the test would be proving the
  // happy path over a form that never had the rule.
  await dialog.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(
    dialog,
    "the dialog closed with no note - SCHED-18's rule is not on this form",
  ).toBeVisible();
  await expect(dialog).toContainText("Escreva uma nota");

  await dialog.getByTestId("block-note").fill("Formação NESA");
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

  // ---- SCHED-19: THE BAND SAYS WHY, NOT JUST THAT --------------------------
  // The note typed into the dialog above is on the band. This is the whole
  // journey in one assertion - dialog -> action -> time_off.note -> the read
  // path -> the client boundary -> the band - and every link in it was added
  // for this, so a break anywhere shows up here.
  await expect(
    band.first().getByTestId("agenda-blocked-note"),
    "the band does not carry the note that was typed when the block was made - " +
      "reception is back to an anonymous grey band it cannot explain",
  ).toHaveText("Formação NESA");

  // ... and a slot inside 09:00-11:00 is non-bookable (its button is disabled -
  // unreachable by mouse AND keyboard), same check as agenda-blocked-time.spec.
  await expect(page.getByRole("button", { name: /09:00/ }).first()).toBeDisabled();
});
