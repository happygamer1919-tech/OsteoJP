/**
 * note-previews.spec.ts — THE NOTE A LIST ROW SHOWS WITHOUT A CLICK, in a real
 * browser, on both surfaces.
 *
 * ==========================================================================
 * WHY THIS EXISTS WHEN THERE IS ALREADY A UNIT SUITE AND A DB SUITE
 * ==========================================================================
 * They answer different questions and neither answers this one.
 *
 *   `lib/notes/latest-notes.db.test.ts`   WHO may be sent a note. Real RLS.
 *   the two `.test.tsx` render suites      WHAT the row draws, from markup.
 *   THIS FILE                             that the two are actually WIRED, on a
 *                                         deployed page, end to end.
 *
 * The middle one renders a component with props a test supplied. It cannot fail
 * if the PAGE never fetches the previews, never passes them, or passes them
 * under the wrong key - and that is the whole class of defect a preview like
 * this dies of: everything green, nothing on screen. This project has paid for
 * exactly that shape before, in a component that received `projected`/`absent`
 * for weeks and rendered neither.
 *
 * ==========================================================================
 * IT WRITES ITS NOTES THROUGH THE PRODUCT, NOT THROUGH THE SEED
 * ==========================================================================
 * The Marcações half books an appointment, then writes a visit note THROUGH THE
 * "Notas" BOARD the clinic already uses. So the spec also proves the thing the
 * dispatch insisted on keeping: the button still reads and still writes, and the
 * excerpt beside it is the note that button just saved. A seeded row would prove
 * the render and say nothing about the round trip.
 *
 * Runs as the default project's admin.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

/** The seeded recuperação patients. One has a note; the other deliberately does not. */
const REC_WITH_NOTE = "E2E Recuperar Movel";
const REC_WITHOUT_NOTE = "E2E Recuperar Fixo";
/** Seeded verbatim in seed-e2e.mjs. The clinic's own case. */
const SEEDED_NOTE = "Ligou a cancelar. Disse que telefona ele proprio para remarcar";

/** A future day unique per retry, so a retry never meets its own leftovers. */
function bandDay(base: number, retry: number): string {
  return futureDate(RUN_DAY_BASE + base + retry * 100);
}

async function book(page: Page, patient: string, date: string, time: string) {
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time,
  });
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });
}

/* ==================================================================== */
/* JOB 1 — RECUPERAÇÃO                                                  */
/* ==================================================================== */

test("recuperacao: the latest patient note is on the row, with no press", async ({ page }) => {
  await page.goto("/recuperacao");

  const withNote = page.locator("li").filter({ hasText: REC_WITH_NOTE }).first();
  await expect(withNote).toBeVisible();

  // THE NOTE ITSELF, ON THE ROW, BEFORE ANY INTERACTION. This is the request.
  await expect(withNote.getByTestId("followup-note-preview")).toBeVisible();
  await expect(withNote).toContainText(SEEDED_NOTE);

  // AND IT IS LABELLED, so nobody reads it as something else on the row.
  await expect(withNote).toContainText("Última nota do paciente");
});

test("recuperacao: a patient with no note gets NO preview and NO Notas button", async ({
  page,
}) => {
  await page.goto("/recuperacao");
  const withoutNote = page.locator("li").filter({ hasText: REC_WITHOUT_NOTE }).first();
  await expect(withoutNote).toBeVisible();

  // "No notes means render nothing, not an empty affordance." Both halves.
  await expect(withoutNote.getByTestId("followup-note-preview")).toHaveCount(0);
  await expect(withoutNote.getByTestId("followup-notes-button")).toHaveCount(0);
  // The ROW is still fully workable - the absence is the note, not the patient.
  await expect(withoutNote.getByText("Última consulta")).toBeVisible();
});

test("recuperacao: the Notas button opens the FULL history over the list", async ({ page }) => {
  await page.goto("/recuperacao");
  const withNote = page.locator("li").filter({ hasText: REC_WITH_NOTE }).first();

  await withNote.getByTestId("followup-notes-button").click();

  // The board fetches through a server action that re-checks the patient, so a
  // rendered thread is also proof that read succeeded for this principal.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("patient-notes-board")).toBeVisible({ timeout: 12_000 });
  // THE FULL TEXT, not the excerpt: the row truncates and the board does not.
  await expect(dialog).toContainText("nao contactar");
});

/* ==================================================================== */
/* JOB 2 — MARCAÇÕES                                                    */
/* ==================================================================== */

test("marcacoes: both notes render, LABELLED, and the Notas button still works", async ({
  page,
}, testInfo) => {
  const date = bandDay(40, testInfo.retry);
  const patient = PATIENTS.maria.name;
  await book(page, patient, date, "11:00");

  // The window is pinned to the booked day, so exactly one row is in view.
  const url = `/marcacoes?from=${date}&to=${date}`;
  await page.goto(url);

  const row = page.locator("li,div").filter({ hasText: patient }).first();
  await expect(page.getByTestId("marcacoes-notes-button")).toBeVisible();

  /* ---- BEFORE: this visit has no note, so no visit line is drawn ---- */
  await expect(page.getByTestId("marcacoes-appointment-note")).toHaveCount(0);

  /* ---- WRITE ONE THROUGH THE PRODUCT'S OWN BOARD ---- */
  await page.getByTestId("marcacoes-notes-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("appointment-note-add").click();
  const VISIT_NOTE = "Trazer a ressonancia magnetica na proxima sessao";
  await dialog.getByTestId("appointment-note-composer").locator("textarea").fill(VISIT_NOTE);
  await dialog.getByRole("button", { name: "Adicionar nota" }).last().click();
  // The board re-reads after the append; the note appearing IN the board is the
  // write's own proof, separate from the row's.
  await expect(dialog).toContainText(VISIT_NOTE, { timeout: 12_000 });

  /* ---- AFTER: the row shows it, on the next render, labelled ---- */
  await page.goto(url);
  const visitLine = page.getByTestId("marcacoes-appointment-note");
  await expect(visitLine).toBeVisible({ timeout: 12_000 });
  await expect(visitLine).toContainText(VISIT_NOTE);
  await expect(visitLine).toContainText("Nota da marcação");

  /* ---- AND THE PATIENT NOTE IS A SECOND, DIFFERENTLY LABELLED LINE ---- */
  // Written on the patient's own profile, which is where a note about the
  // PERSON belongs - and the point is that it then follows them onto a visit.
  const PATIENT_NOTE = "Prefere marcacoes ao final da tarde";
  await page.goto(`/patients/${PATIENTS.maria.id}?tab=notas`);
  // The profile composer is a plain always-visible form (NotesComposer), unlike
  // the board's toggle. Read off the component rather than assumed - the first
  // draft of this spec pressed a button that does not exist there.
  await page.locator("textarea").first().fill(PATIENT_NOTE);
  await page.getByRole("button", { name: "Adicionar nota" }).click();
  /**
   * SCOPED TO THE THREAD, NOT TO THE PAGE, AND THE FIRST DRAFT WAS NOT.
   *
   * `page.getByText(PATIENT_NOTE)` matched TWO elements - the note in the list
   * AND the composer's own textarea, which still holds the typed text until the
   * action resolves and clears it. That is a RACE, and it behaved exactly like
   * one: green on an isolated run, a strict-mode violation inside the full
   * suite. The note in the LIST is the only element that means the write landed.
   */
  await expect(page.getByRole("list").getByText(PATIENT_NOTE)).toBeVisible({ timeout: 12_000 });

  await page.goto(url);
  const patientLine = page.getByTestId("marcacoes-patient-note");
  await expect(patientLine).toBeVisible({ timeout: 12_000 });
  await expect(patientLine).toContainText(PATIENT_NOTE);
  await expect(patientLine).toContainText("Nota do paciente");

  /* ---- THE TWO ARE DISTINCT LINES WITH DISTINCT LABELS ---- */
  // The clinic's stated reason for wanting both: "so nobody confuses a note
  // about the person with a note about the visit". Asserted as the pair.
  await expect(patientLine).not.toContainText(VISIT_NOTE);
  await expect(visitLine).not.toContainText(PATIENT_NOTE);

  /* ---- AND THE BUTTON THEY ALREADY USE IS UNTOUCHED ---- */
  await expect(page.getByTestId("marcacoes-notes-button")).toBeVisible();
  await expect(row).toBeVisible();
});
