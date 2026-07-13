/**
 * guiao-panel.spec.ts - W5-34. Runs as THERAPIST.
 *
 * The "Guião do Exame Subjetivo" reference lives on the in-browser recording
 * screen. It must:
 * - be COLLAPSED by default (no section text visible on first paint),
 * - expand on click to reveal the clinical sections,
 * - never overlap or block the recording controls (the "Gravar" button stays
 *    visible and clickable both before and after the panel is expanded).
 *
 * getUserMedia + MediaRecorder are mocked (same fakes as recording.spec.ts) so
 * we land on the recording UI deterministically without a real microphone.
 */
import { test, expect, type Page } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";

async function installFakeRecorder(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ kind: "audio", stop() {} }] }),
      },
    });
    class FakeMediaRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() {
        return true;
      }
      start() {}
      stop() {
        this.onstop?.();
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  });
}

async function reachRecorder(page: Page) {
  await page.goto("/consultation");
  const patient = page.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.maria.name);
  await page.getByRole("option", { name: PATIENTS.maria.name }).click();
  await page.getByRole("checkbox", { name: /Autorizo a gravação/i }).check();
  await page.getByRole("button", { name: "Iniciar gravação" }).click();
}

test.describe("guião panel (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("collapsed by default, expands to sections, never blocks recording controls", async ({ page }) => {
    await installFakeRecorder(page);
    await reachRecorder(page);

    const record = page.getByRole("button", { name: "Gravar" });
    const panel = page.getByTestId("guiao-panel");
    const summary = panel.getByText("Guião do Exame Subjetivo", { exact: true });

    // Panel present, but collapsed: its section content is not rendered/visible,
    // and the recording control is reachable.
    await expect(panel).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(record).toBeVisible();
    const section = page.getByText("Pesquisa de flags e revisão de sistemas", { exact: true });
    await expect(section).toBeHidden();

    // Expand the top-level panel: the section headings become visible and the
    // recording control is STILL visible (panel pushes layout, never overlays).
    await summary.click();
    await expect(section).toBeVisible();
    await expect(record).toBeVisible();

    // The panel does not sit on top of the control: the control is still the hit
    // target at its own centre (clicking it starts recording rather than landing
    // on the panel), proving no invisible overlay.
    await record.click();
    await expect(page.getByRole("button", { name: "Parar" })).toBeVisible();
  });
});
