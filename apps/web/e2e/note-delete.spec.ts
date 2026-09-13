/**
 * note-delete.spec.ts — NOTES-04.
 *
 * The owner's screenshots showed a pencil and nothing else on every note row.
 * 0084 made deletion possible in the database; this proves the control reaches
 * it from the screens that show notes, and that the confirm step really stands
 * between the click and the delete.
 *
 * EVERY SURFACE RENDERS THE SAME `NotesList`, so one component carries the
 * control. That is exactly why each surface is still driven here: the agenda
 * drawer and the Marcações popup mount the list INSIDE a modal and fetch it
 * through a server action, and the profile tab re-renders from the server. A
 * pure render of the component cannot tell those three apart.
 *
 * Runs as admin on fresh patients and a day band of its own, so nothing another
 * spec writes can be deleted by this one, and no note here can be hidden by
 * another spec's.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment, createPatient } from "./helpers";
import { LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const uniq = () => Math.random().toString(36).slice(2, 8);
const CONFIRM_TEXT = "Eliminar esta nota? Esta ação não pode ser desfeita.";

/** A future day unique per retry (100-day bands, the idiom the Marcações specs use). */
function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

async function bookWithNote(page: Page, patient: string, date: string, time: string, note: string) {
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time,
  });
  await dialog.getByLabel(/^Notas$/).fill(note);
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
}

test("profile Notas tab: delete asks first, Cancelar keeps the note, Eliminar removes it for good", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createPatient(page, { fullName: `Apagar Nota ${uniq()}` });
  const keep = `Nota que fica ${uniq()}`;
  const gone = `Nota a eliminar ${uniq()}`;

  await page.goto(`/patients/${id}?tab=notas`);
  for (const text of [keep, gone]) {
    await page.getByPlaceholder(/Escreva uma nota/i).fill(text);
    await page.getByRole("button", { name: "Adicionar nota" }).click();
    // The LIST, not the page: the composer's textarea holds the same text until
    // the action resolves (note-previews.spec.ts hit that race).
    await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible({ timeout: 12_000 });
  }

  const row = page.getByRole("listitem").filter({ hasText: gone });

  /* ---- THE CONFIRM STEP IS REAL: Cancelar deletes nothing ---- */
  await row.getByRole("button", { name: "Eliminar nota" }).click();
  const confirm = row.getByTestId("note-delete-confirm");
  await expect(confirm).toContainText(CONFIRM_TEXT);
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(row.getByTestId("note-delete-confirm")).toHaveCount(0);
  await page.goto(`/patients/${id}?tab=notas`);
  await expect(page.getByRole("listitem").filter({ hasText: gone })).toBeVisible({ timeout: 12_000 });

  /* ---- Eliminar deletes this note and only this note ---- */
  await page.getByRole("listitem").filter({ hasText: gone }).getByRole("button", { name: "Eliminar nota" }).click();
  await page
    .getByTestId("note-delete-confirm")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await expect(page.getByRole("listitem").filter({ hasText: gone })).toHaveCount(0, { timeout: 12_000 });
  await expect(page.getByRole("listitem").filter({ hasText: keep })).toBeVisible();

  /* ---- and it stays gone on a fresh read from the server ---- */
  await page.goto(`/patients/${id}?tab=notas`);
  await expect(page.getByRole("listitem").filter({ hasText: keep })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("listitem").filter({ hasText: gone })).toHaveCount(0);
});

test("Marcações Notas popup and the marcação drawer each delete a visit note, and the profile agrees", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = `Apagar Visita ${uniq()}`;
  const id = await createPatient(page, { fullName: name });
  const date = bandDay(126, testInfo.retry);
  const first = `Nota da visita ${uniq()}`;
  const second = `Segunda nota ${uniq()}`;
  await bookWithNote(page, name, date, "11:30", first);

  const url = `/marcacoes?from=${date}&to=${date}`;

  /* ---- (a) THE MARCAÇÕES NOTAS POPUP ---- */
  await page.goto(url);
  const notesButton = page.getByTestId("marcacoes-notes-button");
  await expect(notesButton).toHaveCount(1, { timeout: 12_000 });
  await notesButton.click();
  const popup = page.getByRole("dialog");
  const popupBoard = popup.getByTestId("appointment-notes-board");
  await expect(popupBoard).toContainText(first, { timeout: 12_000 });

  // A second note first, so the delete below has a neighbour it must not take.
  await popupBoard.getByTestId("appointment-note-add").click();
  await popupBoard.getByTestId("appointment-note-composer").locator("textarea").fill(second);
  await popupBoard.getByRole("button", { name: "Adicionar nota" }).last().click();
  await expect(popupBoard.getByRole("listitem").filter({ hasText: second })).toBeVisible({ timeout: 12_000 });

  const firstRow = popupBoard.getByRole("listitem").filter({ hasText: first });
  await firstRow.getByRole("button", { name: "Eliminar nota" }).click();
  await expect(firstRow.getByTestId("note-delete-confirm")).toContainText(CONFIRM_TEXT);
  await firstRow
    .getByTestId("note-delete-confirm")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await expect(popupBoard.getByRole("listitem").filter({ hasText: first })).toHaveCount(0, { timeout: 12_000 });
  await expect(popupBoard.getByRole("listitem").filter({ hasText: second })).toBeVisible();

  /* ---- (b) THE MARCAÇÃO DRAWER, the panel the agenda opens ---- */
  await page.goto(url);
  await page.getByRole("button", { name: `Abrir marcação: ${name}` }).click();
  const drawer = page.getByRole("dialog");
  const drawerBoard = drawer.getByTestId("appointment-notes-board");
  await expect(drawerBoard.getByRole("listitem").filter({ hasText: second })).toBeVisible({ timeout: 12_000 });
  await expect(drawerBoard.getByRole("listitem").filter({ hasText: first })).toHaveCount(0);

  const secondRow = drawerBoard.getByRole("listitem").filter({ hasText: second });
  await secondRow.getByRole("button", { name: "Eliminar nota" }).click();
  await secondRow
    .getByTestId("note-delete-confirm")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await expect(drawerBoard.getByTestId("appointment-notes-empty")).toBeVisible({ timeout: 12_000 });
  // The delete buttons sit inside the appointment form. They must not submit
  // it: the drawer is still open, with nothing saved or closed.
  await expect(drawer).toBeVisible();

  /* ---- (c) THE PROFILE AGREES: neither visit note is anywhere in the history ---- */
  await page.goto(`/patients/${id}?tab=notas`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("listitem").filter({ hasText: first })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: second })).toHaveCount(0);
});
