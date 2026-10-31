/**
 * marcacoes-therapist-change.spec.ts - MARC-THERAPIST-01: the Terapeuta of a
 * marcação changed from the patient profile, Marcações, "Gerir marcação".
 * Runs as RECEPTION, who asked for it.
 *
 * The field sends the row's own time and clinic to rescheduleAppointment, the
 * action the agenda's edit panel calls, so the refusals are the agenda's:
 *
 *   1. A change to a free therapist saves: the row names the new therapist,
 *      and still does after a fresh read.
 *   2. A therapist who does not work that hour is refused with the agenda's
 *      sentence, which names their hours; the row keeps its therapist.
 *   3. A therapist with a booking in the way is refused with the agenda's
 *      conflict warning ("Conflito de terapeuta: ..."), and this field offers
 *      no "Guardar mesmo assim"; the row keeps its therapist.
 *
 * What a refusal leaves in the database (nothing), the pacote balance, the
 * audit row and the care team are proven against Postgres in
 * lib/scheduling/marcacoes-therapist-change.db.test.ts.
 *
 * THE THERAPISTS, all seeded by seed-e2e.mjs and none written by this spec:
 *   - "E2E Therapist" and "E2E Terapeuta Sem Servicos" have no working hours
 *     at all, which the working-hours check reads as not configured, so either
 *     may be booked at any hour.
 *   - "E2E Terapeuta Clinica Unica" works Monday 09:00 to 13:00 at
 *     Linda-a-Velha (ensureLocationFixtures), so a Monday 15:00 is outside.
 *
 * DAY BANDS 181, 183 to 189, 191, 193 to 199 and 203 to 209 are this file's
 * own (the highest offset any other spec uses is 170). 183 to 189, 193 to 199
 * and 203 to 209 are one test each: each books on the first Monday at or after
 * its start. Each retry moves 100 days on, as marcacoes-tab-edit does,
 * because these tests leave real rows behind.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment, fillTime } from "./helpers";
import {
  LOCATION,
  PATIENTS,
  RUN_DAY_BASE,
  STORAGE,
  THERAPIST_NAME,
  THERAPIST_ONE_LOCATION,
  futureDate,
} from "./fixtures";

test.use({ storageState: STORAGE.reception });

const SAVE = "Guardar";
const THERAPIST_NO_HOURS = "E2E Terapeuta Sem Servicos";
const PATIENT = PATIENTS.joao;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

/** The first Monday at or after the band day (at most six days on). */
function bandMonday(base: number, retry: number): string {
  for (let i = 0; i < 7; i += 1) {
    const iso = bandDay(base + i, retry);
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 1) return iso;
  }
  throw new Error("no Monday in seven consecutive days");
}

/** Books one appointment through the agenda (the helper marcacoes-tab-edit uses). */
async function book(page: Page, args: { patient: string; therapist: string; date: string; time: string }) {
  const dialog = await openNewAppointment(page, args.date);
  await fillAppointment(dialog, {
    patient: args.patient,
    therapist: args.therapist,
    location: LOCATION.name,
    date: args.date,
    time: args.time,
  });
  await dialog.getByRole("button", { name: SAVE, exact: true }).click();
  // A therapist with no hours on the day draws the advisory and its "Guardar
  // mesmo assim": wait for the drawer to settle into one of its two states.
  const saveAnyway = dialog.getByRole("button", { name: /Guardar mesmo assim/i });
  await Promise.race([
    dialog.waitFor({ state: "hidden", timeout: 12_000 }),
    saveAnyway.waitFor({ state: "visible", timeout: 12_000 }),
  ]).catch(() => {});
  if (await saveAnyway.isVisible().catch(() => false)) await saveAnyway.click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
}

function ptHeaderDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(y!, m! - 1, d!),
  );
}

/** The one row of the Marcações tab for a day and time. */
function row(page: Page, iso: string, hhmm: string): Locator {
  return page.getByTestId("consulta-row").filter({ hasText: `${ptHeaderDate(iso)} · ${hhmm}` });
}

async function openMarcacoes(page: Page) {
  await page.goto(`/patients/${PATIENT.id}?tab=consultas`);
  await expect(page.getByRole("tabpanel", { name: /Marcações/i })).toBeVisible({ timeout: 8_000 });
}

/** Opens "Gerir marcação" on the row and returns its Terapeuta field. */
async function openTherapistField(r: Locator): Promise<Locator> {
  await r.getByText("Gerir marcação").click();
  const field = r.getByTestId("alterar-terapeuta");
  await expect(field).toBeVisible();
  return field;
}

/**
 * Picks a therapist in the field and waits until the field has taken it.
 *
 * "Gerir marcação" is a native <details>, so it opens before the page has
 * hydrated, and a choice made in that window changes the select on screen
 * without reaching the form's state: the button would stay disabled and the
 * click after it would wait for nothing. The button turning enabled is the
 * form saying it has the choice, so the pick is repeated until it does.
 */
async function pickTherapist(field: Locator, label: string) {
  const select = field.getByLabel("Terapeuta", { exact: true });
  const apply = field.getByRole("button", { name: "Alterar terapeuta", exact: true });
  await expect(async () => {
    await select.selectOption({ label });
    await expect(apply).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return apply;
}

test("the Terapeuta is changed from Gerir marcação and the row names the new therapist (MARC-THERAPIST-01)", async ({
  page,
}, testInfo) => {
  const date = bandDay(181, testInfo.retry);
  await book(page, { patient: PATIENT.name, therapist: THERAPIST_NAME, date, time: "15:00" });

  await openMarcacoes(page);
  const r = row(page, date, "15:00");
  await expect(r.getByTestId("marcacao-therapist")).toContainText(THERAPIST_NAME);
  const field = await openTherapistField(r);

  // The current therapist is the selected option, and the button waits for a
  // different one.
  const select = field.getByLabel("Terapeuta", { exact: true });
  await expect(select.locator("option:checked")).toHaveText(THERAPIST_NAME);
  await expect(field.getByRole("button", { name: "Alterar terapeuta", exact: true })).toBeDisabled();

  await (await pickTherapist(field, THERAPIST_NO_HOURS)).click();

  await expect(page.getByText("Terapeuta alterado.")).toBeVisible({ timeout: 8_000 });
  await expect(row(page, date, "15:00").getByTestId("marcacao-therapist")).toContainText(THERAPIST_NO_HOURS, {
    timeout: 8_000,
  });

  // A fresh read says the same: it was saved, not only painted. The time, the
  // clinic's row and the estado did not move.
  await openMarcacoes(page);
  const after = row(page, date, "15:00");
  await expect(after).toHaveCount(1);
  await expect(after.getByTestId("marcacao-therapist")).toContainText(THERAPIST_NO_HOURS);
  await expect(after.getByTestId("marcacao-therapist")).not.toContainText(THERAPIST_NAME);
});

test("a therapist who does not work that hour is refused with the agenda's sentence, naming their hours (G2)", async ({
  page,
}, testInfo) => {
  const date = bandMonday(183, testInfo.retry);
  await book(page, { patient: PATIENT.name, therapist: THERAPIST_NAME, date, time: "15:00" });

  await openMarcacoes(page);
  const r = row(page, date, "15:00");
  const field = await openTherapistField(r);
  await (await pickTherapist(field, THERAPIST_ONE_LOCATION)).click();

  // The agenda's own words (lib/scheduling/refusal-message.ts), whole.
  await expect(field.getByRole("alert")).toHaveText(
    "Fora do horário do terapeuta nesse dia. Horário nesse dia: 09:00-13:00. " +
      "Para marcar fora deste horário, altere primeiro a disponibilidade do terapeuta em Horários.",
    { timeout: 8_000 },
  );
  await expect(field.getByRole("button", { name: /Guardar mesmo assim/i })).toHaveCount(0);

  // Refused means nothing was written: a fresh read still names the first therapist.
  await openMarcacoes(page);
  await expect(row(page, date, "15:00").getByTestId("marcacao-therapist")).toContainText(THERAPIST_NAME);
});

test("a therapist with a conflict is refused with the agenda's conflict list, and no override is offered (G2)", async ({
  page,
}, testInfo) => {
  const date = bandDay(191, testInfo.retry);
  // The booking in the way: another patient, the other therapist, the same hour.
  await book(page, { patient: PATIENTS.ana.name, therapist: THERAPIST_NO_HOURS, date, time: "15:00" });
  await book(page, { patient: PATIENT.name, therapist: THERAPIST_NAME, date, time: "15:00" });

  await openMarcacoes(page);
  const r = row(page, date, "15:00");
  const field = await openTherapistField(r);
  await (await pickTherapist(field, THERAPIST_NO_HOURS)).click();

  // The agenda's own warning, whole (app/agenda/conflict-banner.tsx, the one
  // component both screens draw): the KIND of conflict, the booking in the
  // way, its hour. Not the ficha's shorter "Conflito" banner.
  const warning = field.getByTestId("conflict-lines");
  await expect(warning).toHaveText(
    new RegExp(`^Conflito de terapeuta: ${escapeRegExp(PATIENTS.ana.name)}: 15:00-\\d{2}:\\d{2}$`),
    { timeout: 8_000 },
  );
  await expect(field.getByRole("button", { name: /Guardar mesmo assim/i })).toHaveCount(0);

  // Picking another name clears the refusal: it described the one just tried.
  await field.getByLabel("Terapeuta", { exact: true }).selectOption({ label: THERAPIST_NAME });
  await expect(warning).toHaveCount(0);

  await openMarcacoes(page);
  await expect(row(page, date, "15:00").getByTestId("marcacao-therapist")).toContainText(THERAPIST_NAME);
});

/**
 * APPT-EDIT-01 - the clinic manager's case: a new therapist AND a new hour, in
 * ONE save from the ficha.
 *
 * The 15:00 booking with "E2E Therapist" cannot go to "E2E Terapeuta Clinica
 * Unica" at 15:00 (she works Monday 09:00-13:00, the G2 test above), and the
 * old date-and-hour panel kept the old therapist, so the move was two saves,
 * each refused alone. Reagendar now opens the agenda's edit panel, where both
 * change together and the hours are checked against the NEW therapist.
 *
 * DAY BAND 193 to 199 is this test's own: it books on the first Monday at or
 * after 193.
 */
test("Reagendar changes the therapist and the hour together, checked against the new therapist (APPT-EDIT-01)", async ({
  page,
}, testInfo) => {
  const date = bandMonday(193, testInfo.retry);
  await book(page, { patient: PATIENT.name, therapist: THERAPIST_NAME, date, time: "15:00" });

  await openMarcacoes(page);
  const r = row(page, date, "15:00");
  await r.getByText("Gerir marcação").click();
  await r.getByRole("button", { name: "Reagendar", exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // The patient is shown, read-only: an edit never changes it.
  await expect(drawer.getByTestId("drawer-patient-readonly")).toContainText(PATIENT.name);
  await expect(drawer.getByRole("combobox", { name: /Paciente/i })).toHaveCount(0);

  await drawer.getByRole("combobox", { name: "Terapeuta", exact: true }).selectOption({ label: THERAPIST_ONE_LOCATION });
  await fillTime(drawer, "10:00");
  await drawer.getByRole("button", { name: SAVE, exact: true }).click();

  await expect(drawer).toBeHidden({ timeout: 12_000 });
  // A fresh read: the row moved to 10:00 and names the new therapist.
  await openMarcacoes(page);
  const after = row(page, date, "10:00");
  await expect(after).toHaveCount(1, { timeout: 8_000 });
  await expect(after.getByTestId("marcacao-therapist")).toContainText(THERAPIST_ONE_LOCATION);
  await expect(row(page, date, "15:00")).toHaveCount(0);
});

test("Reagendar shows the real refusal: the new therapist outside her hours is named, not a generic error (APPT-EDIT-01)", async ({
  page,
}, testInfo) => {
  const date = bandMonday(203, testInfo.retry);
  await book(page, { patient: PATIENT.name, therapist: THERAPIST_NAME, date, time: "15:00" });

  await openMarcacoes(page);
  const r = row(page, date, "15:00");
  await r.getByText("Gerir marcação").click();
  await r.getByRole("button", { name: "Reagendar", exact: true }).click();

  const drawer = page.getByRole("dialog");
  await drawer.getByRole("combobox", { name: "Terapeuta", exact: true }).selectOption({ label: THERAPIST_ONE_LOCATION });
  await fillTime(drawer, "16:00");
  await drawer.getByRole("button", { name: SAVE, exact: true }).click();

  await expect(
    drawer.getByText(
      "Fora do horário do terapeuta nesse dia. Horário nesse dia: 09:00-13:00. " +
        "Para marcar fora deste horário, altere primeiro a disponibilidade do terapeuta em Horários.",
    ),
  ).toBeVisible({ timeout: 8_000 });
  await expect(drawer.getByText("Ocorreu um erro. Tente novamente.")).toHaveCount(0);
  await expect(drawer).toBeVisible();

  // Nothing was written.
  await openMarcacoes(page);
  await expect(row(page, date, "15:00").getByTestId("marcacao-therapist")).toContainText(THERAPIST_NAME);
});
