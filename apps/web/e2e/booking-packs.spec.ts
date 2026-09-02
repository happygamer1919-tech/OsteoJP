/**
 * booking-packs.spec.ts — books a pacote for a disposable test patient and
 * exercises the loop: registration, the balance moving as appointments are
 * booked, and surfacing on the patient profile. Runs as admin.
 *
 * ==========================================================================
 * RB-02 CHANGED WHAT THE NUMBERS MEAN, AND STEPS 1-4 DID NOT NEED CHANGING.
 * ==========================================================================
 * The balance used to be a COUNTER decremented on booking. It is now DERIVED -
 * `sessions_total - legacy_consumed - linked appointments that are not
 * cancelled`. For a fresh pacote the two models produce the same screen: book
 * once and 9/10, book twice and 8/10. **That the assertions below survived a
 * complete replacement of the mechanism is the point of them**, and it is the
 * strongest evidence available that existing balances read the same.
 *
 * ==========================================================================
 * PACK-02 CHANGED THE PRESENTATION, NOT THE MECHANISM, AND STEP 4 MOVED WITH
 * IT. THE PARAGRAPH ABOVE STILL STANDS AS A STATEMENT ABOUT RB-02.
 * ==========================================================================
 * The profile chip used to read "8/10 sessões". The owner asked for USED and
 * REMAINING, so it now reads "8 restantes" with "2 de 10 usadas" beneath it,
 * and step 4 asserts BOTH numbers where it used to assert one and infer the
 * other. The balance itself is untouched: same derivation, same rows, same
 * arithmetic - only the words around it changed.
 *
 * SAID PLAINLY SO THE CLAIM ABOVE IS NOT READ AS STILL LITERALLY TRUE OF EVERY
 * LINE: one assertion in this file did NOT survive PACK-02 verbatim. It was
 * strengthened rather than relaxed, and that distinction is the only thing
 * that makes editing a gate-bearing assertion acceptable at all.
 *
 * THE MANUAL ADJUST STEPS ARE GONE, replaced by an assertion that the controls
 * are ABSENT. "Consumir" and "Restaurar" burned a session with no appointment
 * row; a no-show is now an appointment with `status = 'no_show'` and the
 * formula counts it.
 *
 * WHY THE "A CANCELLED APPOINTMENT RETURNS ITS SESSION" ARM IS NOT HERE, since
 * it is the obvious thing to reach for: driving it through this UI means a
 * disclosure, a cancel drawer and a confirmation, on a spec that already carries
 * two twelve-second saves - and this project has a card open on exactly that
 * class of flake (`ACC-immediate-isvisible-probes`, `ACC-preselection-spec-flaky`).
 * The property is proven against a real Postgres, through the SAME predicate the
 * application ships, in `packages/db/tests/pack-derived-balance.db.test.ts`.
 * A second, more fragile copy would add flake without adding proof.
 *
 * Never touches the real Maria João Silva; uses the synthetic seed patient
 * PATIENTS.ana. Each run creates a UNIQUE pack, so its instance is isolated from
 * prior runs (deterministic under re-runs / parallel days).
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, SERVICE, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

test("book a pacote: register, derived balance, surfacing, and NO manual adjust (RB-02)", async ({
  page,
}) => {
  // 1. Create a fresh 10-session pack on Osteopatia, offered at all locations.
  await page.goto("/admin/services");
  const packName = `E2E Pacote C ${Date.now()}`;
  const addPack = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Adicionar pacote" }) });
  await addPack.locator('input[name="name"]').fill(packName);
  await addPack.locator('select[name="baseServiceId"]').selectOption({ label: SERVICE.name });
  await addPack.locator('input[name="sessionCount"]').fill("10");
  await addPack.locator('input[name="price"]').fill("390.00");
  // locationId select defaults to "Todos os locais" (all locations).
  await Promise.all([
    page.waitForURL(/mp=ok/),
    addPack.getByRole("button", { name: "Adicionar pacote" }).click(),
  ]);

  // 2. Book the pack (registration): no active instance → banner shows "Novo pacote".
  const date1 = futureDate(RUN_DAY_BASE + 41);
  let dialog = await openNewAppointment(page, date1);
  await fillAppointment(dialog, {
    patient: PATIENTS.ana.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: date1,
    time: "10:00",
  });
  await dialog.getByLabel("Pacote", { exact: true }).selectOption({ label: packName });
  await expect(dialog.getByText(/Novo pacote/i)).toBeVisible();
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // 3. Book the pack AGAIN (decrement): now an active instance exists → the
  //    banner shows the remaining count (9/10) before saving.
  const date2 = futureDate(RUN_DAY_BASE + 42);
  dialog = await openNewAppointment(page, date2);
  await fillAppointment(dialog, {
    patient: PATIENTS.ana.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: date2,
    time: "11:00",
  });
  await dialog.getByLabel("Pacote", { exact: true }).selectOption({ label: packName });
  await expect(dialog.getByText(/Sessões restantes: 9\/10/i)).toBeVisible();
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // 4. Surfacing: after two bookings the patient profile reads 8 REMAINING and
  //    2 OF 10 USED.
  //
  //    PACK-02 REPLACED THE SINGLE "8/10" CHIP WITH TWO NUMBERS, so the old
  //    assertion could not survive verbatim. It is replaced by a STRICTLY
  //    STRONGER pair: the remaining count, and the used count beside the total.
  //    The old form asserted one number and inferred the other; this asserts
  //    both, which is the whole reason the owner asked for the second one.
  await page.goto(`/patients/${PATIENTS.ana.id}?tab=consultas`);
  const packRow = page.locator("li").filter({ hasText: packName }).first();
  await expect(packRow).toBeVisible();
  await expect(packRow.getByText(/8\s+restantes/i)).toBeVisible();
  await expect(packRow.getByText(/2 de 10 usadas/i)).toBeVisible();

  // 5. RB-02 — THE MANUAL ADJUST CONTROLS ARE GONE.
  //
  // Asserted on the ROW rather than the page, so this cannot pass because the
  // profile failed to render: step 4 above already proved the row is there with
  // the right balance, and these two checks then say what is NOT on it.
  await expect(packRow.getByRole("button", { name: "Consumir" })).toHaveCount(0);
  await expect(packRow.getByRole("button", { name: "Restaurar" })).toHaveCount(0);

  // 6. And the screen SAYS where the sessions come from now. Without this line
  //    a balance that moved because an appointment was booked on another screen
  //    looks like the number changing on its own.
  await expect(page.getByText(/contadas a partir das marcações/i)).toBeVisible();
});
