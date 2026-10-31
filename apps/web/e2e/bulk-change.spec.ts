/**
 * bulk-change.spec.ts - APPT-BULK-01: "Alterar várias marcações" on the
 * patient profile, Marcações. Runs as RECEPTION, who asked for it.
 *
 *   1. Three visits move to another therapist and another hour in one go:
 *      the preview shows each, saves nothing, and the save moves all three.
 *   2. A visit the new therapist is already booked for is SKIPPED and listed;
 *      the other two are saved.
 *   3. A therapist is not offered the button.
 *
 * What each saved row writes (one audit row per visit, one reminder call per
 * action) is proven against Postgres in lib/scheduling/bulk-reschedule.db.test.ts.
 *
 * Each test makes its OWN patient, so the dialog lists only this test's
 * visits however many rows a lane database has kept. The therapists are
 * seeded by seed-e2e.mjs and have no working hours, so any hour is theirs.
 * DAY BANDS 231 to 233 and 241 to 243 are this file's own (no other spec
 * books past 209, agenda-stacked-slot.spec.ts aside at 200 and 201). Each
 * retry moves 100 days on, because these tests leave real rows behind.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createPatient, fillAppointment, fillTime, openNewAppointment } from "./helpers";
import { LOCATION, PATIENTS, RUN_DAY_BASE, STORAGE, THERAPIST_NAME, futureDate } from "./fixtures";

test.use({ storageState: STORAGE.reception });

const SAVE = "Guardar";
const NEW_THERAPIST = "E2E Terapeuta Sem Servicos";
const uniq = () => Math.random().toString(36).slice(2, 8);

function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

function ptDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(y!, m! - 1, d!),
  );
}

async function book(page: Page, args: { patient: string; therapist: string; date: string; time: string }) {
  const dialog = await openNewAppointment(page, args.date);
  await fillAppointment(dialog, { ...args, location: LOCATION.name });
  await dialog.getByRole("button", { name: SAVE, exact: true }).click();
  const saveAnyway = dialog.getByRole("button", { name: /Guardar mesmo assim/i });
  await Promise.race([
    dialog.waitFor({ state: "hidden", timeout: 12_000 }),
    saveAnyway.waitFor({ state: "visible", timeout: 12_000 }),
  ]).catch(() => {});
  if (await saveAnyway.isVisible().catch(() => false)) await saveAnyway.click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
}

async function openBulk(page: Page, patientId: string): Promise<Locator> {
  await page.goto(`/patients/${patientId}?tab=consultas`);
  await expect(page.getByRole("tabpanel", { name: /Marcações/i })).toBeVisible({ timeout: 8_000 });
  const panel = page.getByTestId("bulk-change-panel");
  // The button is a client island: retry the click until the panel is open,
  // so a click that landed before hydration is not the end of the test.
  await expect(async () => {
    await page.getByTestId("bulk-change-open").click();
    await expect(panel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

/** The consulta row on the Marcações tab for a day and time. */
function consulta(page: Page, iso: string, hhmm: string): Locator {
  return page.getByTestId("consulta-row").filter({ hasText: `${ptDate(iso)} · ${hhmm}` });
}

test("three visits move to another therapist and hour in one save; the preview saves nothing (APPT-BULK-01)", async ({
  page,
}, testInfo) => {
  const name = `Lote ${uniq()}`;
  const patientId = await createPatient(page, { fullName: name });
  const days = [231, 232, 233].map((b) => bandDay(b, testInfo.retry));
  for (const date of days) await book(page, { patient: name, therapist: THERAPIST_NAME, date, time: "15:30" });

  const panel = await openBulk(page, patientId);
  await expect(panel.getByTestId("bulk-candidate")).toHaveCount(3, { timeout: 10_000 });
  await panel.getByRole("button", { name: "Selecionar todas" }).click();
  await expect(panel.getByTestId("bulk-selected-count")).toHaveText("Selecionadas: 3");
  await panel.getByLabel("Novo terapeuta").selectOption({ label: NEW_THERAPIST });
  await panel.getByTestId("bulk-change-time").check();
  await fillTime(panel, "16:30");

  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Pré-visualizar", exact: true }).click();

  const rows = panel.getByTestId("bulk-preview-row");
  await expect(rows).toHaveCount(3, { timeout: 10_000 });
  for (const date of days) {
    const r = rows.filter({ hasText: ptDate(date) });
    await expect(r).toHaveAttribute("data-verdict", "ok");
    await expect(r).toContainText(`${ptDate(date)} · 16:30`);
    await expect(r).toContainText(NEW_THERAPIST);
  }

  // The preview wrote nothing: in a second tab the visits are still at 15:30.
  const other = await page.context().newPage();
  await other.goto(`/patients/${patientId}?tab=consultas`);
  for (const date of days) {
    await expect(consulta(other, date, "15:30").getByTestId("marcacao-therapist")).toContainText(THERAPIST_NAME);
  }
  await other.close();

  await drawer.getByRole("button", { name: "Guardar marcações (3)", exact: true }).click();
  await expect(panel.getByTestId("bulk-result-saved")).toHaveText("Marcações guardadas: 3.", { timeout: 15_000 });
  await expect(panel.getByTestId("bulk-result-row").and(page.locator('[data-applied="true"]'))).toHaveCount(3);

  await page.goto(`/patients/${patientId}?tab=consultas`);
  for (const date of days) {
    await expect(consulta(page, date, "16:30").getByTestId("marcacao-therapist")).toContainText(NEW_THERAPIST);
    await expect(consulta(page, date, "15:30")).toHaveCount(0);
  }
});

test("a visit the new therapist is booked for is skipped and listed; the others save (APPT-BULK-01)", async ({
  page,
}, testInfo) => {
  const name = `Lote ${uniq()}`;
  const patientId = await createPatient(page, { fullName: name });
  const days = [241, 242, 243].map((b) => bandDay(b, testInfo.retry));
  for (const date of days) await book(page, { patient: name, therapist: THERAPIST_NAME, date, time: "15:30" });
  // The booking in the way: another patient with the new therapist, the middle day, 16:30.
  await book(page, { patient: PATIENTS.ana.name, therapist: NEW_THERAPIST, date: days[1]!, time: "16:30" });

  const panel = await openBulk(page, patientId);
  await expect(panel.getByTestId("bulk-candidate")).toHaveCount(3, { timeout: 10_000 });
  await panel.getByRole("button", { name: "Selecionar todas" }).click();
  await panel.getByLabel("Novo terapeuta").selectOption({ label: NEW_THERAPIST });
  await panel.getByTestId("bulk-change-time").check();
  await fillTime(panel, "16:30");
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Pré-visualizar", exact: true }).click();

  const rows = panel.getByTestId("bulk-preview-row");
  await expect(rows).toHaveCount(3, { timeout: 10_000 });
  const middle = rows.filter({ hasText: ptDate(days[1]!) });
  await expect(middle).toHaveAttribute("data-verdict", "conflict");
  await expect(middle.getByTestId("conflict-lines")).toContainText(PATIENTS.ana.name);
  await expect(middle.getByTestId("bulk-override")).not.toBeChecked();

  // Two will be saved; the conflicting one is not ticked.
  await drawer.getByRole("button", { name: "Guardar marcações (2)", exact: true }).click();
  await expect(panel.getByTestId("bulk-result-saved")).toHaveText("Marcações guardadas: 2.", { timeout: 15_000 });
  await expect(panel.getByTestId("bulk-result-skipped")).toHaveText("Marcações não alteradas: 1.");

  await page.goto(`/patients/${patientId}?tab=consultas`);
  await expect(consulta(page, days[0]!, "16:30").getByTestId("marcacao-therapist")).toContainText(NEW_THERAPIST);
  await expect(consulta(page, days[2]!, "16:30").getByTestId("marcacao-therapist")).toContainText(NEW_THERAPIST);
  await expect(consulta(page, days[1]!, "15:30").getByTestId("marcacao-therapist")).toContainText(THERAPIST_NAME);
});

test.describe("a therapist", () => {
  test.use({ storageState: STORAGE.therapist });

  test("is not offered Alterar várias marcações (APPT-BULK-01)", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=consultas`);
    await expect(page.getByRole("tabpanel", { name: /Marcações/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("bulk-change-open")).toHaveCount(0);
  });
});
