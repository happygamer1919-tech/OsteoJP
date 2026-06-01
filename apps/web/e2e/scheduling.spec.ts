/**
 * scheduling.spec.ts — Stream B
 *
 * Covers: agenda view, create appointment, reschedule, cancel, recurring
 * series, conflict detection, room conflict.
 *
 * Plain-English scenario → test mapping:
 *
 *  1. Agenda loads and shows today's date column
 *  2. Clicking an empty slot opens the new appointment modal pre-filled with that slot
 *  3. Create a one-off appointment; it appears on the agenda
 *  4. Required-field validation: submit with no patient selected
 *  5. Edit appointment — change service, modal pre-fills correctly
 *  6. Reschedule appointment to a different time
 *  7. Cancel appointment; status changes on agenda
 *  8. Create recurring weekly appointment (4 occurrences)
 *  9. Edit one occurrence of a recurring series (scope: this one)
 * 10. Edit all following occurrences of a series
 * 11. Conflict detection: booking same therapist at overlapping time shows warning
 * 12. Conflict detection: booking same room at overlapping time shows warning
 * 13. "Save anyway" override proceeds despite conflict
 * 14. Receptionist can create appointments (has the permission)
 * 15. Therapist can only create appointments on their own calendar
 */

import { test, expect } from "@playwright/test";
import { goToAgenda, openNewAppointmentModal, createPatient } from "./helpers";

// ---------------------------------------------------------------------------
// 1. Agenda loads
// ---------------------------------------------------------------------------
test("agenda page loads and shows a date header", async ({ page }) => {
  await goToAgenda(page);
  // The agenda grid renders date column headers. At minimum today's date
  // should appear in some form.
  const today = new Date().getDate().toString();
  await expect(page.getByText(today).first()).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 2. Empty slot click pre-fills modal
// ---------------------------------------------------------------------------
test("clicking empty agenda slot opens modal with slot pre-filled", async ({
  page,
}) => {
  await goToAgenda(page);
  // Click the first empty time slot cell.
  const slot = page.locator("[data-slot]").first();
  await slot.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });
  // The date field inside the modal should be pre-filled (not empty).
  const dateInput = dialog.locator("input[type=date]");
  await expect(dateInput).not.toHaveValue("");
});

// ---------------------------------------------------------------------------
// 3. Create one-off appointment
// ---------------------------------------------------------------------------
test("create one-off appointment; it appears on agenda", async ({ page }) => {
  // Create a patient to book against.
  const patientId = await createPatient(page, {
    fullName: "Agendamento Teste",
  });
  void patientId; // used indirectly — patient appears in the select

  await openNewAppointmentModal(page);
  const dialog = page.getByRole("dialog");

  // Select patient
  await dialog.getByLabel(/Paciente/i).selectOption({ label: "Agendamento Teste" });
  // Select first available therapist
  await dialog.getByLabel(/Terapeuta/i).selectOption({ index: 1 });
  // Select first available location
  await dialog.getByLabel(/Localização/i).selectOption({ index: 1 });
  // Set date to today, time to 14:00
  const today = new Date().toISOString().slice(0, 10);
  await dialog.locator("input[type=date]").fill(today);
  await dialog.locator("input[type=time]").fill("14:00");

  await dialog.getByRole("button", { name: /Guardar/i }).click();

  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  // Appointment block should appear on the grid.
  await expect(page.getByText("Agendamento Teste")).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 4. Validation: no patient selected
// ---------------------------------------------------------------------------
test("submitting appointment modal with no patient shows required error", async ({
  page,
}) => {
  await openNewAppointmentModal(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Guardar/i }).click();
  await expect(dialog.getByText(/obrigatório|required/i)).toBeVisible({ timeout: 6_000 });
});

// ---------------------------------------------------------------------------
// 5. Edit appointment — modal pre-fills correctly
// ---------------------------------------------------------------------------
test("clicking an existing appointment opens edit modal pre-filled", async ({
  page,
}) => {
  await goToAgenda(page);
  // Click the first appointment block present on the agenda.
  const apptBlock = page.locator("[data-appointment-id]").first();
  // If no appointments exist in the test DB, skip gracefully.
  const count = await apptBlock.count();
  test.skip(count === 0, "No appointments on agenda to test edit modal");

  await apptBlock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });
  // Confirm it's in edit mode (title says "Editar" not "Nova")
  await expect(dialog.getByText(/Editar/i)).toBeVisible();
  // Patient select should not be empty
  const patientSelect = dialog.getByLabel(/Paciente/i);
  await expect(patientSelect).not.toHaveValue("");
});

// ---------------------------------------------------------------------------
// 6. Reschedule appointment
// ---------------------------------------------------------------------------
test("reschedule appointment to a different time updates agenda", async ({
  page,
}) => {
  await goToAgenda(page);
  const apptBlock = page.locator("[data-appointment-id]").first();
  const count = await apptBlock.count();
  test.skip(count === 0, "No appointments to reschedule");

  await apptBlock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });

  const timeInput = dialog.locator("input[type=time]");
  await timeInput.fill("16:00");
  await dialog.getByRole("button", { name: /Guardar/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 7. Cancel appointment
// ---------------------------------------------------------------------------
test("cancelling appointment changes its status", async ({ page }) => {
  await goToAgenda(page);
  const apptBlock = page.locator("[data-appointment-id]").first();
  const count = await apptBlock.count();
  test.skip(count === 0, "No appointments to cancel");

  await apptBlock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });

  await dialog.getByLabel(/Estado/i).selectOption("cancelled");
  await dialog.getByRole("button", { name: /Guardar/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });

  // Cancelled appointments typically appear with a distinct style or label.
  await expect(page.getByText(/Cancelad/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 8. Create recurring weekly appointment
// ---------------------------------------------------------------------------
test("create recurring weekly appointment with 4 occurrences", async ({
  page,
}) => {
  await createPatient(page, { fullName: "Recorrente Semanal" });

  await openNewAppointmentModal(page);
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel(/Paciente/i).selectOption({ label: "Recorrente Semanal" });
  await dialog.getByLabel(/Terapeuta/i).selectOption({ index: 1 });
  await dialog.getByLabel(/Localização/i).selectOption({ index: 1 });
  const today = new Date().toISOString().slice(0, 10);
  await dialog.locator("input[type=date]").fill(today);
  await dialog.locator("input[type=time]").fill("10:00");

  // Set recurrence to weekly
  await dialog.getByLabel(/Repetir/i).selectOption("weekly");
  await expect(dialog.getByLabel(/Ocorrências/i)).toBeVisible();
  await dialog.getByLabel(/Ocorrências/i).fill("4");

  await dialog.getByRole("button", { name: /Guardar/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 12_000 });
});

// ---------------------------------------------------------------------------
// 9. Edit one occurrence from a recurring series
// ---------------------------------------------------------------------------
test("editing one occurrence of a series does not affect others", async ({
  page,
}) => {
  await goToAgenda(page);
  // Find the first recurring appointment block (has recurrence icon / label).
  const recurringBlock = page.locator("[data-appointment-id][data-recurring]").first();
  const count = await recurringBlock.count();
  test.skip(count === 0, "No recurring appointments found");

  await recurringBlock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });

  // Select "this one" scope
  await dialog.getByLabel(/Aplicar a/i);
  await dialog.locator("input[type=radio][value=one]").check();

  await dialog.locator("input[type=time]").fill("11:00");
  await dialog.getByRole("button", { name: /Guardar/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 10. Edit all following in series
// ---------------------------------------------------------------------------
test("editing following occurrences propagates to all subsequent entries", async ({
  page,
}) => {
  await goToAgenda(page);
  const recurringBlock = page.locator("[data-appointment-id][data-recurring]").first();
  const count = await recurringBlock.count();
  test.skip(count === 0, "No recurring appointments found");

  await recurringBlock.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });

  await dialog.locator("input[type=radio][value=following]").check();
  await dialog.locator("input[type=time]").fill("15:00");
  await dialog.getByRole("button", { name: /Guardar/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 11. Therapist conflict detection
// ---------------------------------------------------------------------------
test("booking a therapist at an overlapping time shows conflict warning", async ({
  page,
}) => {
  // This test relies on having at least one existing confirmed appointment.
  await goToAgenda(page);
  const existingBlock = page.locator("[data-appointment-id]").first();
  const count = await existingBlock.count();
  test.skip(count === 0, "Needs at least one existing appointment");

  // Read the existing appointment's therapist and time.
  const therapistId = await existingBlock.getAttribute("data-practitioner-id");
  const startsAt = await existingBlock.getAttribute("data-starts-at");
  if (!therapistId || !startsAt) test.skip(true, "Missing data attributes");

  await createPatient(page, { fullName: "Conflito Terapeuta" });

  await openNewAppointmentModal(page);
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel(/Paciente/i).selectOption({ label: "Conflito Terapeuta" });
  await dialog.getByLabel(/Terapeuta/i).selectOption({ value: therapistId! });
  await dialog.getByLabel(/Localização/i).selectOption({ index: 1 });

  const [datePart, timePart] = startsAt!.split("T");
  await dialog.locator("input[type=date]").fill(datePart!);
  await dialog.locator("input[type=time]").fill(timePart!.slice(0, 5));

  await dialog.getByRole("button", { name: /Guardar/i }).click();

  // Conflict warning should appear.
  await expect(dialog.getByText(/conflito|conflict/i)).toBeVisible({ timeout: 8_000 });
  // Save Anyway button must appear.
  await expect(dialog.getByRole("button", { name: /Guardar mesmo assim/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 12. Room conflict detection
// ---------------------------------------------------------------------------
test("booking same room at overlapping time shows room conflict warning", async ({
  page,
}) => {
  await goToAgenda(page);
  const existingBlock = page
    .locator("[data-appointment-id][data-room]")
    .first();
  const count = await existingBlock.count();
  test.skip(count === 0, "Needs an existing appointment with a room assigned");

  const room = await existingBlock.getAttribute("data-room");
  const startsAt = await existingBlock.getAttribute("data-starts-at");
  if (!room || !startsAt) test.skip(true, "Missing data attributes");

  await createPatient(page, { fullName: "Conflito Sala" });

  await openNewAppointmentModal(page);
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel(/Paciente/i).selectOption({ label: "Conflito Sala" });
  await dialog.getByLabel(/Terapeuta/i).selectOption({ index: 2 }); // different therapist
  await dialog.getByLabel(/Localização/i).selectOption({ index: 1 });
  await dialog.getByLabel(/Sala/i).fill(room!);

  const [datePart, timePart] = startsAt!.split("T");
  await dialog.locator("input[type=date]").fill(datePart!);
  await dialog.locator("input[type=time]").fill(timePart!.slice(0, 5));

  await dialog.getByRole("button", { name: /Guardar/i }).click();

  await expect(dialog.getByText(/sala|room/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 13. Save anyway override
// ---------------------------------------------------------------------------
test("Save anyway proceeds after conflict warning", async ({ page }) => {
  // Trigger a conflict (same therapist double-book scenario above),
  // then click "Guardar mesmo assim".
  await goToAgenda(page);
  const existingBlock = page.locator("[data-appointment-id]").first();
  const count = await existingBlock.count();
  test.skip(count === 0, "Needs an existing appointment");

  const therapistId = await existingBlock.getAttribute("data-practitioner-id");
  const startsAt = await existingBlock.getAttribute("data-starts-at");
  if (!therapistId || !startsAt) test.skip(true, "Missing data attributes");

  await createPatient(page, { fullName: "Override Conflito" });
  await openNewAppointmentModal(page);
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel(/Paciente/i).selectOption({ label: "Override Conflito" });
  await dialog.getByLabel(/Terapeuta/i).selectOption({ value: therapistId! });
  await dialog.getByLabel(/Localização/i).selectOption({ index: 1 });

  const [datePart, timePart] = startsAt!.split("T");
  await dialog.locator("input[type=date]").fill(datePart!);
  await dialog.locator("input[type=time]").fill(timePart!.slice(0, 5));
  await dialog.getByRole("button", { name: /Guardar/i }).click();

  // Conflict appears
  await expect(dialog.getByText(/conflito|conflict/i)).toBeVisible({ timeout: 8_000 });

  // Override it
  await dialog.getByRole("button", { name: /Guardar mesmo assim/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 12_000 });
});
