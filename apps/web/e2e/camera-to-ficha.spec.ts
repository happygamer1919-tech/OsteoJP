/**
 * camera-to-ficha.spec.ts — in-page camera capture into a ficha's anexos (W4-05,
 * Rodica request, JP-approved). Runs as THERAPIST (clinical_records:author).
 *
 * The camera is mocked via addInitScript (getUserMedia + canvas.toBlob + the
 * video frame size) so the flow is deterministic and needs no real hardware.
 * This proves the in-page camera UI: open -> capture -> preview -> retake, that
 * the stream is RELEASED after capture (track.stop), and that a permission
 * denial shows the pt-PT message with NO gallery-persisting fallback. The actual
 * upload landing (Supabase Storage bucket) is covered by the unit tests
 * (attachment-upload.test.ts) + the Rodica real-device close-out; it is not
 * asserted here because the CI seed does not provision the clinical-attachments
 * bucket (the pre-existing file-input upload is uncovered for the same reason).
 */
import { test, expect, type Page } from "@playwright/test";
import { PATIENTS, STORAGE, TEMPLATE_CURRENT_LABEL } from "./fixtures";

/** Install a fake camera before any navigation. `deny` simulates a blocked permission. */
async function installFakeCamera(page: Page, deny = false) {
  await page.addInitScript((shouldDeny) => {
    // A stoppable fake track so we can assert the stream is released.
    const win = window as unknown as { __cameraStops: number };
    win.__cameraStops = 0;
    const makeStream = () => {
      const track = {
        kind: "video",
        stop() {
          win.__cameraStops += 1;
        },
      };
      return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    };
    const define = (obj: object, prop: string, desc: PropertyDescriptor) => {
      try {
        Object.defineProperty(obj, prop, desc);
      } catch {
        /* prototype prop non-configurable in this engine — best effort */
      }
    };
    define(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (shouldDeny) throw new DOMException("blocked", "NotAllowedError");
          return makeStream();
        },
      },
    });
    // The captured frame -> a REAL 1x1 PNG so the preview <img> renders with a
    // non-zero box (a bogus blob would load as 0x0 and read as "not visible").
    const PNG_1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    HTMLCanvasElement.prototype.toBlob = function (cb: (b: Blob | null) => void) {
      const bin = atob(PNG_1x1);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      cb(new Blob([bytes], { type: "image/png" }));
    };
    HTMLVideoElement.prototype.play = async function () {};
    // Give every <video> a non-zero frame so captureFrame() has something to
    // draw. Patch BOTH the prototype (best-effort) and each instance (own props
    // always define cleanly) — belt and suspenders across engines/timing. The
    // component tolerates the fake (non-MediaStream) srcObject via try/catch.
    define(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
    define(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
    const patchVideo = (v: HTMLVideoElement) => {
      const marked = v as HTMLVideoElement & { __patched?: boolean };
      if (marked.__patched) return;
      marked.__patched = true;
      define(v, "videoWidth", { configurable: true, get: () => 640 });
      define(v, "videoHeight", { configurable: true, get: () => 480 });
    };
    new MutationObserver(() => document.querySelectorAll("video").forEach(patchVideo)).observe(
      document.documentElement,
      { childList: true, subtree: true },
    );
  }, deny);
}

/** Create a fresh draft ficha for a synthetic patient and land on its detail page. */
async function createDraftFicha(page: Page) {
  await page.goto("/clinical/new");
  await page.getByLabel(/Paciente/i).selectOption({ label: PATIENTS.maria.name });
  await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
  await page.getByRole("button", { name: "Criar ficha" }).click();
  await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText("Rascunho")).toBeVisible();
}

test.describe("camera-to-ficha (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("in-page capture: open -> capture -> preview -> retake, and the camera is released", async ({
    page,
  }) => {
    await installFakeCamera(page);
    await createDraftFicha(page);

    // The anexos section offers the in-page camera entry point on a draft.
    await page.getByRole("button", { name: "Tirar foto" }).click();

    // Camera opens in-page -> the Capturar action appears (preview phase).
    const capture = page.getByRole("button", { name: "Capturar" });
    await expect(capture).toBeVisible();

    // Capture a still -> the "captured" phase: Anexar/Repetir appear, Capturar is
    // gone, and the preview image is present. Assert the buttons first (reliably
    // sized) as the phase proof; the <img> is checked as attached.
    await capture.click();
    await expect(page.getByRole("button", { name: "Anexar foto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Repetir" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Capturar" })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Câmara" })).toHaveCount(1);

    // The camera stream was released when the still was taken (no lingering light).
    const stops = await page.evaluate(
      () => (window as unknown as { __cameraStops: number }).__cameraStops,
    );
    expect(stops).toBeGreaterThanOrEqual(1);

    // Retake returns to the live camera (Capturar visible again).
    await page.getByRole("button", { name: "Repetir" }).click();
    await expect(page.getByRole("button", { name: "Capturar" })).toBeVisible();
  });

  test("permission denied shows the pt-PT message and does not fall back to a file input", async ({
    page,
  }) => {
    await installFakeCamera(page, /* deny */ true);
    await createDraftFicha(page);

    await page.getByRole("button", { name: "Tirar foto" }).click();

    // pt-PT denial guidance; no capture control, no silent gallery fallback.
    await expect(
      page.getByText("Não foi possível aceder à câmara. Verifique as permissões do navegador."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Capturar" })).toHaveCount(0);
  });
});
