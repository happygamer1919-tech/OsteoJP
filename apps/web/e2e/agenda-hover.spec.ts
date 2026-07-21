/**
 * agenda-hover.spec.ts - W10-05: the ONE shared unified hover popup on BOTH the
 * agenda card AND the Marcacoes list row (replacing the W9-06 note-only hover),
 * plus the inverted agenda card face (patient name first). Runs as admin
 * (default storageState) on local synthetic data.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";
const DAY = futureDate(RUN_DAY_BASE + 31); // dedicated day, no other spec books it

test("W10-05: the unified hover popup shows on the agenda card AND the Marcacoes row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Book a 1h appointment.
  const dialog = await openNewAppointment(page, DAY);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: DAY,
    time: "15:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // --- Agenda surface: hover the card -> the unified mini-dashboard reveals. ---
  const card = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) });
  await expect(card).toBeVisible({ timeout: 8_000 });
  // Card face inverted: the patient name is the FIRST child of the card button.
  await expect(card.getByTestId("agenda-card-patient")).toContainText(PATIENTS.maria.name);

  await card.hover();
  const agendaPanel = page.getByTestId("appointment-hover-panel").first();
  await expect(agendaPanel).toBeVisible({ timeout: 8_000 });
  // The mini-dashboard carries the fields as text (colour-not-only).
  await expect(agendaPanel).toContainText(PATIENTS.maria.name);
  await expect(agendaPanel).toContainText(THERAPIST_NAME);
  await expect(agendaPanel).toContainText(LOCATION.name);
  await expect(agendaPanel.getByTestId("hover-state")).toBeVisible();
  await expect(agendaPanel.getByTestId("hover-created")).toBeVisible();

  // --- Marcacoes surface: the SAME shared panel on the list row. Scope the list
  // to the booked day so the row is present and unambiguous. ---
  await page.goto(`/marcacoes?from=${DAY}&to=${DAY}`);
  await expect(page).toHaveURL(/\/marcacoes/);
  const row = page.locator(".glass-card", { hasText: PATIENTS.maria.name }).first();
  await expect(row).toBeVisible({ timeout: 8_000 });
  // Focus the hover trigger (keyboard-reachable) -> the shared panel reveals.
  const trigger = row.getByRole("button", { name: /Detalhes da marca/i });
  await trigger.focus();
  const rowPanel = row.getByTestId("appointment-hover-panel");
  await expect(rowPanel).toBeVisible({ timeout: 8_000 });
  await expect(rowPanel).toContainText(PATIENTS.maria.name);
  await expect(rowPanel).toContainText(THERAPIST_NAME);
});
