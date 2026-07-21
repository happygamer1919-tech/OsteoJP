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
import { openNewAppointment, fillAppointment, fillTime } from "./helpers";
import { PATIENTS, LOCATION, LOCATION_ARCHIVED, SERVICE, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

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

test("a newly created appointment persists as scheduled / pendente (W3-01)", async ({ page }) => {
  // The creation UI has no lifecycle selector; the server hardcodes the
  // creation invariant (status=scheduled, confirmation_state=pending), never
  // from the payload. Book one, reopen it, and read the two axes back.
  const date = futureDate(RUN_DAY_BASE + 13);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "14:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Reopen the created appointment (edit mode) and assert both axes.
  await page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) }).click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await expect(edit.getByLabel(/^Estado/i)).toHaveValue("scheduled"); // lifecycle
  await expect(edit.getByText(/Confirmação pendente/i)).toBeVisible(); // confirmation = pending
});

test("archived location is absent from the booking dropdown (W2-02 item 2)", async ({ page }) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 12));
  const locationSelect = dialog.getByLabel(/Localização/i);
  // Active location is offered; the archived one is excluded from selection.
  await expect(locationSelect.locator("option", { hasText: LOCATION.name })).toHaveCount(1);
  await expect(locationSelect.locator("option", { hasText: LOCATION_ARCHIVED.name })).toHaveCount(0);
});

test("Nova marcação: Terapeuta first, Serviço auto-fills from the therapist, override honored (W3-03)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 17);
  const dialog = await openNewAppointment(page, date);

  const therapist = dialog.getByLabel(/Terapeuta/i);
  const service = dialog.getByLabel(/Serviço/i);

  // Field order: Terapeuta renders ABOVE Serviço (DECISIONS 2026-07-05).
  const tBox = await therapist.boundingBox();
  const sBox = await service.boundingBox();
  expect(tBox).not.toBeNull();
  expect(sBox).not.toBeNull();
  expect(tBox.y).toBeLessThan(sBox.y);

  // Serviço is empty until a therapist is chosen; picking the therapist FIRST
  // auto-fills Serviço with the therapist's first mapped service (Osteopatia).
  await expect(service).toHaveValue("");
  await therapist.selectOption({ label: THERAPIST_NAME });
  await expect(service).toHaveValue(SERVICE.id);

  // The dropdown stays editable: override to NESA sticks (auto-fill never
  // clobbers a manual choice).
  await service.selectOption({ label: "NESA (sensível)" });
  await expect(service.locator("option:checked")).toHaveText("NESA (sensível)");

  // Complete the booking; the override must be honored on submit.
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.maria.name);
  await dialog.getByRole("option", { name: PATIENTS.maria.name }).click();
  await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
  await dialog.locator('input[type="date"]').fill(date);
  await fillTime(dialog, "09:30");
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // Reopen and confirm Serviço persisted as the overridden NESA service.
  await page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) }).click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await expect(edit.getByLabel(/Serviço/i).locator("option:checked")).toHaveText("NESA (sensível)");
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
  await fillTime(dialog, "11:00");
  await dialog.getByRole("button", { name: SAVE }).click();

  await expect(dialog).toBeHidden({ timeout: 12_000 });
  // The appointment moved to 11:00. Since W10-05b the agenda card face is
  // name-only (no time on the face); the time lives in the hover popup, so hover
  // the card and read "11:00-12:00" there.
  const movedCard = page.getByRole("button", { name: new RegExp(PATIENTS.joao.name) });
  await expect(movedCard).toBeVisible({ timeout: 8_000 });
  await movedCard.hover();
  await expect(
    page.getByTestId("appointment-hover-panel").filter({ hasText: "11:00-12:00" }),
  ).toBeVisible({ timeout: 8_000 });
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

/** ISO date `days` after `iso` (whole-day UTC arithmetic, DST-proof for a date-only value). */
function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** pt-PT trigger text of the lote row DatePicker for an ISO date (dd/mm/yyyy). */
function ptTriggerDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT").format(new Date(y!, m! - 1, d!));
}

/** pt-PT full accessible label of a DatePicker day cell for an ISO date. */
function ptDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y!, m! - 1, d!));
}

test("Agendar lote: a row's DATE is editable per-row and the EDITED set reaches the batch engine (W5-05)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 50);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.ana.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "16:00",
  });

  // Weekly generation stays the default seed: 2 rows on the weekly cadence.
  await dialog.getByLabel(/Agendar lote/i).check();
  await dialog.getByLabel(/Nº de marcações/i).fill("2");
  await dialog.getByLabel(/A cada \(semanas\)/i).fill("1");
  await dialog.getByRole("button", { name: /Gerar datas/i }).click();
  await expect(dialog.getByText(/2\s+marcações a criar/i)).toBeVisible();

  const seeded = [date, addIsoDays(date, 7)];
  const edited = addIsoDays(seeded[1]!, 1); // move row 2 one day later

  // Each row now carries its own DatePicker, seeded with the recurrence date.
  const triggers = dialog.getByRole("button", { name: "Data da marcação" });
  await expect(triggers).toHaveCount(2);
  await expect(triggers.nth(0)).toHaveText(ptTriggerDate(seeded[0]!));
  await expect(triggers.nth(1)).toHaveText(ptTriggerDate(seeded[1]!));

  // Edit ONLY row 2's date via the calendar popover. (While the popover is
  // open there are two role=dialog nodes, so target the day cell via page.)
  await triggers.nth(1).click();
  if (edited.slice(0, 7) !== seeded[1]!.slice(0, 7)) {
    await page.getByRole("button", { name: "Mês seguinte" }).click();
  }
  await page.getByRole("gridcell", { name: ptDayLabel(edited) }).click();
  await expect(triggers.nth(1)).toHaveText(ptTriggerDate(edited));
  // The sibling row keeps its recurrence date: the edit is per-row.
  await expect(triggers.nth(0)).toHaveText(ptTriggerDate(seeded[0]!));

  // Submit → the EDITED explicit slot list goes to batchSchedule. The E2E
  // therapist has no availability template, so every slot is busy → the
  // partial-success dialog lists the failures. The edited row must surface
  // with its NEW date (proof the engine ran against the edited set), the
  // sibling with its recurrence date, and the replaced date nowhere.
  await dialog.getByRole("button", { name: SAVE }).click();
  const failure = page.getByRole("dialog", { name: /Algumas marcações não foram criadas/i });
  await expect(failure).toBeVisible({ timeout: 12_000 });
  await expect(failure.getByText(`${edited} · 16:00`)).toBeVisible();
  await expect(failure.getByText(`${seeded[0]} · 16:00`)).toBeVisible();
  await expect(failure.getByText(`${seeded[1]} · 16:00`)).toHaveCount(0);
});

test("batch failure dialog is top-most, interactable, and isolated from the drawer discard guard (W3-02)", async ({
  page,
}) => {
  const date = futureDate(RUN_DAY_BASE + 16);
  const drawer = await openNewAppointment(page, date);
  await fillAppointment(drawer, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "16:00",
  });
  // Agendar lote over 2 slots; the E2E therapist has no availability template,
  // so every slot is busy → the partial-success failure dialog opens.
  await drawer.getByLabel(/Agendar lote/i).check();
  await drawer.getByLabel(/Nº de marcações/i).fill("2");
  await drawer.getByLabel(/A cada \(semanas\)/i).fill("1");
  await drawer.getByRole("button", { name: /Gerar datas/i }).click();
  await drawer.getByRole("button", { name: SAVE }).click();

  // The failure dialog renders TOP-MOST (its own showModal <dialog>, above the
  // drawer). Scope by its accessible name to disambiguate from the drawer.
  const failure = page.getByRole("dialog", { name: /Algumas marcações não foram criadas/i });
  await expect(failure).toBeVisible({ timeout: 12_000 });

  // It is INTERACTABLE: editing a time inside it succeeds (24h TimeField selects,
  // W4-02). If it were inert behind the modal drawer (the pre-fix bug), this
  // would time out.
  const row0 = failure.locator("li").first();
  await fillTime(row0, "18:30");
  await expect(row0.getByLabel("Horas")).toHaveValue("18");

  // Interacting inside the dialog NEVER opens the drawer's "Descartar
  // alterações?" discard guard. The discard Dialog is always mounted (closed),
  // so assert by ROLE — getByRole excludes hidden elements, so a match means it
  // is actually open.
  const discard = page.getByRole("dialog", { name: /Descartar alterações/i });
  await failure.getByRole("button", { name: /Remarcar/i }).first().click();
  await expect(discard).toHaveCount(0);
  await expect(failure).toBeVisible();

  // Escape routes to THIS dialog's own onCancel (closes it) — never the drawer's
  // discard guard.
  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(failure).toBeHidden({ timeout: 8_000 });
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
  await fillTime(dialog, "17:00");

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
  // W10-05b: the agenda card face is now name-only, so the "Sem nota" chip moved
  // off the agenda card; it still shows on the Marcacoes list (W2-04). Verify there.
  await page.goto(`/marcacoes?from=${date}&to=${date}`);
  await expect(page.getByText("Sem nota").first()).toBeVisible({ timeout: 8_000 });
});
