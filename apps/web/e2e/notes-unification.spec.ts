/**
 * notes-unification.spec.ts — W12-13 (notes unification, R3), non-migration
 * surfaces. Proves the two Definition-of-Done behaviours on the UNIFIED
 * appointment_notes relation (0042 applied; backfill held):
 *
 *  1. REFLECT — a note added in the Agenda drawer appears on the Marcações hover
 *     AND on the patient profile Notas tab (the disconnect W12-13 fixes).
 *  2. TWO-MODE — the Início "Notas Rápidas" block adds (a) a PATIENT-LEVEL note
 *     and (b) a note on ONE specific appointment; each lands in the right scope.
 *
 * Runs as admin (default storageState) on local synthetic data. Dedicated future
 * days + freshly created patients so no other spec collides.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment, createPatient } from "./helpers";
import { LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";
const uniq = () => Math.random().toString(36).slice(2, 8);

// A drawer save triggers a client-side agenda revalidation that races with the
// next navigation: Firefox throws NS_BINDING_ABORTED, WebKit "interrupted by
// another navigation". Retry once — same guard as helpers.openNewAppointment.
async function safeGoto(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url);
  } catch (e) {
    if (/interrupted by another navigation|NS_BINDING_ABORTED/i.test(String(e))) {
      await page.goto(url);
    } else {
      throw e;
    }
  }
}

test("REFLECT: an Agenda drawer note shows on the Marcações hover AND the profile Notas tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `Reflect ${uniq()}`;
  const id = await createPatient(page, { fullName: name });
  const day = futureDate(RUN_DAY_BASE + 41);
  const note = `Nota da agenda ${uniq()}`;

  // Book an appointment WITH a note in the drawer.
  const dialog = await openNewAppointment(page, day);
  await fillAppointment(dialog, {
    patient: name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: day,
    time: "15:00",
  });
  await dialog.getByLabel(/^Notas$/).fill(note);
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // (1a) Marcações hover reflects the note. The popover opens on focus and can be
  // lost to an agenda revalidation re-render, so retry focus+assert together.
  await safeGoto(page, `/marcacoes?from=${day}&to=${day}`);
  const row = page.locator(".glass-card", { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 8_000 });
  const trigger = row.getByRole("button", { name: /Detalhes da marca/i }).first();
  const panel = page.getByTestId("appointment-hover-panel").first();
  await expect(async () => {
    await trigger.focus();
    await expect(panel.getByTestId("hover-note")).toContainText(note, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  // (1b) The patient profile Notas tab reflects the SAME note — the reflection
  // W12-13 delivers (an Agenda note now shows on the profile).
  await safeGoto(page, `/patients/${id}?tab=notas`);
  await expect(page.getByText(note)).toBeVisible({ timeout: 8_000 });
});

test("TWO-MODE: Notas Rápidas adds a patient-level note and an appointment-scoped note", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `DuasModes ${uniq()}`;
  const id = await createPatient(page, { fullName: name });
  const day = futureDate(RUN_DAY_BASE + 42);

  // Give the patient one appointment so the appointment selector has an option.
  const dialog = await openNewAppointment(page, day);
  await fillAppointment(dialog, {
    patient: name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: day,
    time: "16:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  await safeGoto(page, "/dashboard");
  const combo = page.getByRole("combobox", { name: /Paciente/i });
  await combo.click();
  await combo.fill(name);
  await page.getByRole("option", { name }).click();

  // (2a) PATIENT-LEVEL note — appointment selector left on "nota geral".
  const patientNote = `Nota geral ${uniq()}`;
  await page.getByLabel(/Notas rápidas/i).fill(patientNote);
  await page.getByRole("button", { name: SAVE }).click();
  await expect(page.getByText(/Notas guardadas/i)).toBeVisible({ timeout: 8_000 });

  // (2b) APPOINTMENT-scoped note — pick the specific appointment (option 2; the
  // first option is the patient-level choice), then save.
  const apptSelect = page.getByTestId("note-appointment-selector");
  await expect(apptSelect.locator("option")).toHaveCount(2, { timeout: 8_000 });
  await apptSelect.selectOption({ index: 1 });
  const apptNote = `Nota da consulta ${uniq()}`;
  await page.getByLabel(/Notas rápidas/i).fill(apptNote);
  await page.getByRole("button", { name: SAVE }).click();
  await expect(page.getByText(/Notas guardadas/i)).toBeVisible({ timeout: 8_000 });

  // Both land on the profile Notas tab (patient-level + appointment-scoped).
  await safeGoto(page, `/patients/${id}?tab=notas`);
  await expect(page.getByText(patientNote)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(apptNote)).toBeVisible({ timeout: 8_000 });

  // The appointment-scoped note ALSO reflects on that appointment's hover.
  await safeGoto(page, `/marcacoes?from=${day}&to=${day}`);
  const row = page.locator(".glass-card", { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 8_000 });
  const trigger = row.getByRole("button", { name: /Detalhes da marca/i }).first();
  const panel = page.getByTestId("appointment-hover-panel").first();
  await expect(async () => {
    await trigger.focus();
    await expect(panel.getByTestId("hover-note")).toContainText(apptNote, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});

// PL-13 (owner ruling 2026-07-30): a note in the profile Notas thread is EDITABLE
// in place and shows a last-edited stamp. Proves the DoD: edit → text changes →
// "editada por … · …" stamp appears → survives a re-read.
test("EDIT: a profile Notas note is editable in place and shows a last-edited stamp", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `Editavel ${uniq()}`;
  const id = await createPatient(page, { fullName: name });
  const original = `Nota original ${uniq()}`;
  const edited = `Nota corrigida ${uniq()}`;

  // Add a note via the profile composer (patient-level, unified => editable).
  await safeGoto(page, `/patients/${id}?tab=notas`);
  await page.getByPlaceholder(/Escreva uma nota/i).fill(original);
  await page.getByRole("button", { name: "Adicionar nota" }).click();
  await expect(page.getByText(original)).toBeVisible({ timeout: 8_000 });
  // A brand-new note carries no edit stamp yet.
  await expect(page.getByTestId("note-edited-stamp")).toHaveCount(0);

  // Open the pen editor, change the text, save.
  await page.getByRole("button", { name: "Editar nota" }).first().click();
  const editForm = page.getByTestId("note-edit-form");
  await editForm.getByRole("textbox").fill(edited);
  await editForm.getByRole("button", { name: "Guardar" }).click();

  // The edited text + the last-edited stamp appear; the old text is gone.
  await expect(page.getByText(edited)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(original)).toHaveCount(0);
  await expect(page.getByTestId("note-edited-stamp").first()).toBeVisible({ timeout: 8_000 });

  // Survives a re-read (the stamp persists from edited_at, not client state).
  await safeGoto(page, `/patients/${id}?tab=notas`);
  await expect(page.getByText(edited)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("note-edited-stamp").first()).toBeVisible({ timeout: 8_000 });
});
