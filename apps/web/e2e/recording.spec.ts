/**
 * recording.spec.ts — in-browser recording UI (W4-07). Runs as THERAPIST.
 * MediaRecorder + getUserMedia are mocked via addInitScript so the record→stop
 * flow is deterministic and needs no real microphone. The non-Chrome path is
 * simulated by making MediaRecorder.isTypeSupported return false.
 */
import { test, expect, type Page } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";

async function installFakeRecorder(page: Page, { supported = true } = {}) {
  await page.addInitScript((supported) => {
    // Fake microphone stream with stoppable tracks.
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
        return supported;
      }
      start() {
        setTimeout(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }),
          });
        }, 0);
      }
      stop() {
        this.onstop?.();
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  }, supported);
}

/** Existing patient → consent → start → land on the recording UI. */
async function reachRecorder(page: Page) {
  await page.goto("/consultation");
  const patient = page.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.maria.name);
  await page.getByRole("option", { name: PATIENTS.maria.name }).click();
  await page.getByRole("checkbox", { name: /consente a gravação/i }).check();
  await page.getByRole("button", { name: "Iniciar gravação" }).click();
}

test.describe("recording (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("record → stop → sign → direct-to-S3 PUT → webhook fire (W4-07 + W4-08 + W4-09)", async ({ page }) => {
    await installFakeRecorder(page, { supported: true });
    // Mock the DIRECT-to-S3 PUT (never a Vercel route): intercept the presigned
    // AWS host and return 200. If the client ever PUT through Next instead, this
    // route would not match and the upload would not succeed.
    let s3PutSeen = false;
    await page.route("**amazonaws.com/**", async (route) => {
      if (route.request().method() === "PUT") {
        s3PutSeen = true;
        await route.fulfill({ status: 200, body: "" });
      } else {
        await route.continue();
      }
    });
    await reachRecorder(page);

    const record = page.getByRole("button", { name: "Gravar" });
    await expect(record).toBeVisible();
    await record.click();

    // Recording state: Stop control + in-progress indicator.
    await expect(page.getByRole("button", { name: "Parar" })).toBeVisible();
    await expect(page.getByText("A gravar…")).toBeVisible();

    // Stop → the blob is signed and PUT direct to S3, then the M1 webhook fires.
    // In CI the AUDIO_S3_* env is set (upload succeeds via the mocked S3 PUT) but
    // the M1_WEBHOOK_* env is NOT, so the fire is gracefully deferred: the audio
    // is saved and processing is marked pending (the "fired" success path is
    // covered by the unit tests).
    await page.getByRole("button", { name: "Parar" }).click();
    await expect(
      page.getByText("Gravação guardada. O processamento será retomado."),
    ).toBeVisible();
    expect(s3PutSeen).toBe(true);
  });

  test("non-Chrome / unsupported shows the pt-PT block, no Record (W4-07)", async ({ page }) => {
    await installFakeRecorder(page, { supported: false });
    await reachRecorder(page);

    await expect(
      page.getByText(/só está disponível no Google Chrome/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Gravar" })).toHaveCount(0);
  });
});
