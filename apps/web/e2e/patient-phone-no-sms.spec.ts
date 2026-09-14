/**
 * patient-phone-no-sms.spec.ts — GATE BL-1b (PHONE-01). Runs as admin.
 *
 * A patient saved with a LANDLINE shows a visible non-SMS marker on the patient
 * record AND in the booking drawer when that patient is selected. A patient saved
 * with a MOBILE is the negative control: neither marker may appear for them.
 *
 * Both tests also prove the preview: the E.164 value is on screen BEFORE Criar
 * Paciente is pressed, and it is the value the record then shows.
 *
 * THE DRAWER NEGATIVE IS NOT HOLLOW. The marker is fetched after the patient is
 * picked, so "count 0" asserted the instant after picking would pass whether or
 * not the fetch ever answered. The test waits for the drawer's two server-action
 * round trips carrying this patient's id (the NESA contraindications and the SMS
 * reason) to complete, and only then asserts the count.
 *
 * No booking is saved, so this spec derives no RUN_DAY_BASE day and cannot
 * collide with another spec's diary (scripts/e2e-spec-days-do-not-collide).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillPatientForm, openNewAppointment } from "./helpers";
import { futureDate } from "./fixtures";

const uniq = () => Math.random().toString(36).slice(2, 8);

async function createWithPhone(page: Page, fullName: string, typed: string, expectedPreview: string) {
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName, phone: typed });
  // The preview is on screen BEFORE saving, and names the exact stored value.
  await expect(page.getByTestId("patient-phone-preview")).toHaveText(expectedPreview);
  await page.getByRole("button", { name: "Criar Paciente" }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: fullName })).toBeVisible();
  return page.url().split("/").at(-1)!;
}

/** Resolves once `n` server-action POSTs whose body names `patientId` have answered. */
function actionRoundTrips(page: Page, patientId: string, n: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0;
    const onResponse = (r: import("@playwright/test").Response) => {
      const req = r.request();
      if (req.method() !== "POST" || !req.headers()["next-action"]) return;
      if (!(req.postData() ?? "").includes(patientId)) return;
      seen += 1;
      if (seen >= n) {
        page.off("response", onResponse);
        resolve();
      }
    };
    page.on("response", onResponse);
  });
}

async function pickPatientInNewDrawer(page: Page, fullName: string) {
  const dialog = await openNewAppointment(page, futureDate(3));
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(fullName);
  await dialog.getByRole("option", { name: fullName }).click();
  return dialog;
}

test("a landline is stored as E.164 and the record and the drawer both say SMS will not reach it", async ({
  page,
}) => {
  const name = `Fixo Sem SMS ${uniq()}`;
  const id = await createWithPhone(
    page,
    name,
    "21 345 67 89",
    "Será guardado como +351213456789. Telefone fixo: os lembretes por SMS não chegam a este número.",
  );

  // The record: stored value, and the marker naming the reason.
  await expect(page.getByText("+351213456789").first()).toBeVisible();
  const marker = page.getByTestId("patient-no-sms-marker");
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute("data-reason", "landline");
  await expect(marker).toContainText("número fixo");

  // The booking drawer, with that patient selected.
  const trips = actionRoundTrips(page, id, 2);
  const dialog = await pickPatientInNewDrawer(page, name);
  await trips;
  const drawerMarker = dialog.getByTestId("drawer-patient-no-sms-marker");
  await expect(drawerMarker).toBeVisible();
  await expect(drawerMarker).toHaveAttribute("data-reason", "landline");
});

test("NEGATIVE CONTROL: a mobile shows neither marker, on the record or in the drawer", async ({ page }) => {
  const name = `Movel Com SMS ${uniq()}`;
  const id = await createWithPhone(page, name, "912 345 678", "Será guardado como +351912345678");

  await expect(page.getByText("+351912345678").first()).toBeVisible();
  // The record is server-rendered: the heading above proves the page is loaded.
  await expect(page.getByTestId("patient-no-sms-marker")).toHaveCount(0);

  const trips = actionRoundTrips(page, id, 2);
  const dialog = await pickPatientInNewDrawer(page, name);
  await trips;
  await expect(dialog.getByTestId("drawer-patient-no-sms-marker")).toHaveCount(0);
});

test("a number that cannot be normalised is refused at the field with the reason, and nothing is created", async ({
  page,
}) => {
  const name = `Numero Invalido ${uniq()}`;
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName: name, phone: "91234567" });
  const reason =
    "Telemóvel inválido: indique 9 dígitos, ou o número completo com o indicativo do país (+ ou 00). Tem 8 dígitos.";
  await expect(page.getByTestId("patient-phone-preview")).toHaveText(reason);
  await page.getByRole("button", { name: "Criar Paciente" }).click();
  // The server's own refusal, in the phone field's slot, and still on the form.
  await expect(page.getByTestId("field-error-phone")).toHaveText(reason, { timeout: 12_000 });
  await expect(page).toHaveURL(/\/patients\/new$/);
});
