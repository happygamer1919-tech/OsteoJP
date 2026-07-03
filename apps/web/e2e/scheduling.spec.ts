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
import { PATIENTS, LOCATION, LOCATION_ARCHIVED, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

test("agenda loads with the New Appointment action", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Nova Marcação/i })).toBeVisible();
});

test("new-appointment drawer hides the Estado selector (W2-02 item 1)", async ({ page }) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 11));
  // Lifecycle "Estado" is edit-only; a new marcação uses the house defaults
  // (status=scheduled, confirmation_state=pending) with no hand-set status.
  await expect(dialog.getByLabel(/^Estado/i)).toHaveCount(0);
});

test("archived location is absent from the booking dropdown (W2-02 item 2)", async ({ page }) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 12));
  const locationSelect = dialog.getByLabel(/Localização/i);
  // Active location is offered; the archived one is excluded from selection.
  await expect(locationSelect.locator("option", { hasText: LOCATION.name })).toHaveCount(1);
  await expect(locationSelect.locator("option", { hasText: LOCATION_ARCHIVED.name })).toHaveCount(0);
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

test("Agendar lote generates per-date slots and submits via the batch engine; V1 recorrente is gone (W2-10)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 14);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.joao.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "16:00",
  });

  // V1 "Marcação recorrente" is REPLACED by "Agendar lote" — the old control is gone.
  await expect(dialog.getByLabel(/Marcação recorrente/i)).toHaveCount(0);
  await dialog.getByLabel(/Agendar lote/i).check();

  // Count + every-X-weeks → generate candidate dates, each with its own time.
  await dialog.getByLabel(/Nº de marcações/i).fill("3");
  await dialog.getByLabel(/A cada \(semanas\)/i).fill("1");
  await dialog.getByRole("button", { name: /Gerar datas/i }).click();
  // Three candidate dates were generated (summary count), each with its own time.
  await expect(dialog.getByText(/3\s+marcações a criar/i)).toBeVisible();

  // Confirm → submits the explicit slot list. The E2E therapist has no
  // availability template, so every slot is busy → the partial-success dialog
  // opens (never an all-or-nothing refusal) with a per-row "Remarcar" control.
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(page.getByText("Algumas marcações não foram criadas")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: /Remarcar/i }).first()).toBeVisible();
});

test("NESA contraindication warning shows on booking (both paths) and never blocks submit (W2-08)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 15);
  const dialog = await openNewAppointment(page, date);

  // Ana carries the epilepsy flag; pick her + the contraindication-sensitive service.
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.ana.name);
  await dialog.getByRole("option", { name: PATIENTS.ana.name }).click();
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
  await dialog.getByLabel(/Serviço/i).selectOption({ label: "NESA (sensível)" });
  await dialog.locator('input[type="date"]').fill(date);
  await dialog.locator('input[type="time"]').fill("17:00");

  // Soft warning appears, naming the matched contraindication.
  await expect(dialog.getByText(/contraindicação NESA/i)).toBeVisible({ timeout: 8_000 });
  await expect(dialog.getByText(/Epilepsia/)).toBeVisible();

  // Agendar lote (batch) path uses the same drawer → the same warning is shown.
  await dialog.getByLabel(/Agendar lote/i).check();
  await expect(dialog.getByText(/contraindicação NESA/i)).toBeVisible();

  // Never blocks: submit stays enabled. Turn lote off and book a single one.
  await dialog.getByLabel(/Agendar lote/i).uncheck();
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
});

test("completed appointment with no note shows the 'Sem nota' indicator (W2-04)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 13);

  // Book, then reopen and mark it Concluída (completed) without adding a note.
  let dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.ana.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "15:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  await page.getByRole("button", { name: new RegExp(PATIENTS.ana.name) }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Estado/i).selectOption({ label: "Concluída" });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Present-state indicator: completed + zero appointment_notes -> "Sem nota".
  await expect(page.getByText("Sem nota").first()).toBeVisible({ timeout: 8_000 });
});
