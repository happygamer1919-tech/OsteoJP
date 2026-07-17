/**
 * marcacao-audit-notes.spec.ts - W9-06, CB QA item 10 (created-by provenance).
 *
 * Runs as ADMIN. Books an appointment, reopens it, and asserts the edit drawer
 * shows the created-by / created-at provenance line resolved from REAL join data
 * (the users join in data.ts) - a staff booking shows the creator's name, not
 * the portal fallback label. The note hover card (item 9) and the created-by
 * display are covered deterministically at the DOM level in the component tests
 * (agenda-grid.test.tsx, marcacoes-view.test.tsx, appointment-drawer.test.tsx);
 * this pins the end-to-end join.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";
const DAY = futureDate(RUN_DAY_BASE + 29);

test("W9-06 item 10: a staff-booked marcacao shows the creator on the detail (not the portal label)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

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

  // Reopen the created appointment (edit drawer).
  await page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) }).click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });

  // The provenance line renders with the real creator, resolved via the users
  // join - it is a STAFF booking, so it is NOT the portal fallback label.
  await expect(edit.getByText(/Criado por/)).toBeVisible();
  await expect(edit.getByText("Reserva online (portal)")).toHaveCount(0);
});
