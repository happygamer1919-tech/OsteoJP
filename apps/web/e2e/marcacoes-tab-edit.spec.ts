/**
 * marcacoes-tab-edit.spec.ts — Patient-profile Consultas (Marcações) per-row
 * edit actions (W5-09). Runs as admin (appointments:write + :delete).
 *
 * The per-row actions REUSE the existing Agenda server actions:
 *   - Reagendar → rescheduleAppointment (runs the availability/conflict check)
 *   - Estado    → updateAppointment (lifecycle-legal transitions only)
 *   - Cancelar  → cancelAppointment
 *
 * Covered:
 *   1. Reschedule with a CONFLICT case (blocked + explicit "Guardar mesmo assim").
 *   2. Estado change within the lifecycle rules, AND the negative: the Estado
 *      control never offers the confirmation/cancel value (illegal-transition
 *      rejection surfaces as the value simply not being selectable).
 *   3. Cancel a row.
 *
 * Determinism: each test books on its own future day (the seed creates no
 * appointments) so parallel runs never collide. These tests book REAL rows with
 * no cleanup, so a Playwright RETRY of the same test must NOT re-book the same
 * day — otherwise duplicate rows accumulate and the per-time row() locator (which
 * relies on one row per "· HH:MM") matches 2+ elements and fails strict mode. So
 * each test derives its day from `bandDay(base, testInfo.retry)`, which pushes
 * every retry onto a distinct, far-away future day. Strict-mode safety: rows
 * share accessible names ("Gerir marcação", "Reagendar", "Estado"), so every
 * locator is scoped to a single row Card via its unique date·time text.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment, fillTime } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

/**
 * A future day for a test that leaves REAL rows behind: the base offset shifts
 * far away on each Playwright retry so a re-run of the same test books a fresh,
 * empty day instead of colliding with the rows its previous attempt created.
 * 100-day bands keep every retry clear of both sibling tests (base offsets 1 day
 * apart) and every other spec's offsets (max ~50).
 */
function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

/** Books a one-off appointment for a patient at the given date/time (as admin). */
async function book(page: Page, patient: string, date: string, time: string) {
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time,
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
}

/** The single appointment Card on the Consultas tab whose header shows this time. */
function row(page: Page, hhmm: string): Locator {
  // The header renders "DD/MM/YYYY · HH:MM" and the practitioner / service /
  // status / "Gerir marcação" text follows, so the time is NOT at the end of the
  // Card. Target the UI Card root (rounded-lg border bg-surface p-6) and filter
  // by "· HH:MM" (word-boundary, not end-anchored) to pin exactly one row Card,
  // which also contains that row's "Gerir marcação" details.
  // Plain substring (not a regex boundary): the Card's text content concatenates
  // the header and practitioner spans as "…09:00Dr…", so there is no word
  // boundary after the time. "· HH:MM" is unique per row (tests book distinct
  // times), so a substring match pins exactly one Card.
  return page
    .locator("div.rounded-lg.border.bg-surface.p-6")
    .filter({ hasText: `· ${hhmm}` });
}

async function openConsultas(page: Page) {
  await page.goto(`/patients/${PATIENTS.maria.id}?tab=consultas`);
  await expect(page.getByRole("tabpanel", { name: /Marcações/i })).toBeVisible({ timeout: 8_000 });
}

test("reschedule from Consultas is blocked by a therapist conflict, then overridable (W5-09)", async ({
  page,
}, testInfo) => {
  const date = bandDay(40, testInfo.retry);
  // Two of Maria's appointments same day/therapist: 09:00 and 11:00.
  await book(page, PATIENTS.maria.name, date, "09:00");
  await book(page, PATIENTS.maria.name, date, "11:00");

  await openConsultas(page);
  const nineRow = row(page, "09:00");
  // Open the row-actions disclosure, then Reagendar.
  await nineRow.getByText("Gerir marcação").click();
  await nineRow.getByRole("button", { name: /Reagendar/i }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // Move 09:00 onto 11:00 — same therapist → conflict. The reschedule drawer's
  // time control is the W4-02 TimeField (Horas/Minutos selects), not a native
  // input[type=time], so drive it via the shared fillTime helper (same as the
  // agenda scheduling specs).
  await fillTime(drawer, "11:00");
  await drawer.getByRole("button", { name: /^Reagendar$/ }).click();

  // Conflict surfaces in-drawer; override is offered, not auto-applied.
  await expect(drawer.getByText(/Conflito/i)).toBeVisible({ timeout: 8_000 });
  await expect(drawer.getByRole("button", { name: /Guardar mesmo assim/i })).toBeVisible();
  await expect(drawer).toBeVisible(); // not saved — still open
});

test("Estado control offers only lifecycle-legal transitions and applies one (W5-09)", async ({
  page,
}, testInfo) => {
  const date = bandDay(41, testInfo.retry);
  await book(page, PATIENTS.maria.name, date, "13:00");

  await openConsultas(page);
  const r = row(page, "13:00");
  await r.getByText("Gerir marcação").click();

  const estado = r.getByLabel(/^Estado/i);
  await expect(estado).toBeVisible();
  // Illegal / cross-axis targets are NOT selectable: cancelling is a separate
  // control, and the confirmation axis is never offered here.
  await expect(estado.locator("option", { hasText: "Cancelada" })).toHaveCount(0);
  // Lifecycle-legal onward targets from a scheduled visit ARE offered.
  await expect(estado.locator("option", { hasText: "Confirmada" })).toHaveCount(1);
  await expect(estado.locator("option", { hasText: "Concluída" })).toHaveCount(1);

  // Apply a legal transition: scheduled → confirmed.
  await estado.selectOption({ label: "Confirmada" });
  await r.getByRole("button", { name: /^Aplicar$/ }).click();

  // The list refreshes; the row now reads Confirmada.
  await expect(row(page, "13:00").getByText("Confirmada")).toBeVisible({ timeout: 8_000 });
});

test("cancel a row from Consultas (W5-09)", async ({ page }, testInfo) => {
  const date = bandDay(42, testInfo.retry);
  await book(page, PATIENTS.maria.name, date, "15:00");

  await openConsultas(page);
  const r = row(page, "15:00");
  await r.getByText("Gerir marcação").click();
  await r.getByRole("button", { name: /Cancelar marcação/i }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: /Cancelar marcação/i }).click();

  // The row refreshes to Cancelada and no longer offers edit actions.
  const cancelled = row(page, "15:00");
  await expect(cancelled.getByText("Cancelada")).toBeVisible({ timeout: 8_000 });
  await expect(cancelled.getByText("Gerir marcação")).toHaveCount(0);
});
