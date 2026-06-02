/**
 * scheduling.spec.ts — Scheduling (Stream B). Runs as admin (appointments:write).
 *
 * Happy paths: agenda loads, book a one-off appointment, reschedule it.
 * Guardrail: booking the same therapist at an overlapping time is flagged as a
 * conflict (with a "save anyway" override offered, not auto-applied).
 *
 * Determinism: each test books on its own future day (no hardcoded dates; the
 * seed creates no appointments) so parallel tests and re-runs never collide.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

test("agenda loads with the New Appointment action", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Nova Marcação/i })).toBeVisible();
});

test("book a one-off appointment; it appears on the agenda", async ({ page }) => {
  const date = futureDate(RUN_DAY_BASE + 1);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "10:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();

  await expect(dialog).toBeHidden({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible({
    timeout: 8_000,
  });
});

test("reschedule an appointment to a different time", async ({ page }) => {
  const date = futureDate(RUN_DAY_BASE + 2);

  // Book at 10:00.
  let dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.joao.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "10:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Open it from the grid and move it to 11:00.
  await page.getByRole("button", { name: new RegExp(PATIENTS.joao.name) }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="time"]').fill("11:00");
  await dialog.getByRole("button", { name: SAVE }).click();

  await expect(dialog).toBeHidden({ timeout: 12_000 });
  // The block now renders the 11:00 slot.
  await expect(page.getByText("11:00-12:00")).toBeVisible({ timeout: 8_000 });
});

test("booking the same therapist at an overlapping time is flagged as a conflict", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 3);

  // First booking at 14:00 — succeeds on an empty day.
  let dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "14:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Second booking, same therapist, overlapping 14:00 → conflict.
  dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.joao.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "14:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();

  // Conflict surfaces in-modal; an explicit override is offered (not auto-applied).
  await expect(dialog.getByText(/Conflito de terapeuta/i)).toBeVisible({ timeout: 8_000 });
  await expect(dialog.getByRole("button", { name: /Guardar mesmo assim/i })).toBeVisible();
  await expect(dialog).toBeVisible(); // not saved — still open
});
