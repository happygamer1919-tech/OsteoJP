/**
 * camera-to-ficha.spec.ts — in-page camera capture into a ficha's anexos (W4-05,
 * Rodica request, JP-approved; controls reworked by W5-07). Runs as THERAPIST
 * (clinical_records:author).
 *
 * The camera is mocked via addInitScript (getUserMedia + canvas.toBlob + the
 * video frame size) so the flow is deterministic and needs no real hardware.
 * This proves the W5-07 two-action camera UI: open -> the two primary actions
 * (Tirar foto, Transferir) are present with NO other camera button; capture ->
 * Abrir appears only once a photo exists; that the stream is RELEASED after
 * capture (track.stop); and that a permission denial shows the pt-PT message
 * with NO gallery-persisting fallback. The actual upload landing (Supabase
 * Storage bucket) is covered by the unit tests (attachment-upload.test.ts) +
 * the Rodica real-device close-out; it is not asserted here because the CI seed
 * does not provision the clinical-attachments bucket (the pre-existing
 * file-input upload is uncovered for the same reason).
 *
 * NOTE ON THE TWO "Tirar foto" BUTTONS: the anexos toolbar has an entry-point
 * "Tirar foto" (clinical.attachmentTakePhoto) that opens the camera panel, and
 * the camera's own primary "Tirar foto" (clinical.cameraTakePhoto) captures the
 * still. To keep the assertions unambiguous, every in-camera query is scoped to
 * the camera group (role="group", aria-label "Câmara").
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
  // W5-02: Paciente is now an async search Combobox (was a Select).
  const patient = page.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.maria.name);
  await page.getByRole("option", { name: PATIENTS.maria.name }).click();
  await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
  await page.getByRole("button", { name: "Criar ficha" }).click();
  await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText("Rascunho")).toBeVisible();
}

test.describe("camera-to-ficha (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("two-action camera: open -> Tirar foto + Transferir, capture -> Abrir appears, no other button, and the camera is released", async ({
    page,
  }) => {
    await installFakeCamera(page);
    await createDraftFicha(page);

    // The anexos toolbar entry point opens the in-page camera panel.
    await page.getByRole("button", { name: "Tirar foto" }).click();

    // Scope every assertion to the camera group so the toolbar's own
    // "Tirar foto" entry point never collides with the camera's controls.
    const camera = page.getByRole("group", { name: "Câmara" });
    await expect(camera).toBeVisible();
    const cameraButtons = camera.getByRole("button");

    // First-open: exactly TWO primary actions, no error, and no stale Abrir.
    // "Tirar foto" is enabled once the live preview is up (phase !== starting).
    const takePhoto = camera.getByRole("button", { name: "Tirar foto" });
    const download = camera.getByRole("button", { name: "Transferir" });
    await expect(takePhoto).toBeEnabled();
    await expect(download).toBeVisible();
    await expect(camera.getByRole("button", { name: "Abrir" })).toHaveCount(0);
    await expect(cameraButtons).toHaveCount(2);
    // First-open regression: the denial alert must NOT be present on a clean open.
    await expect(camera.getByRole("alert")).toHaveCount(0);
    // Transferir is disabled until a photo exists (nothing to download yet).
    await expect(download).toBeDisabled();

    // Capture a still -> "captured" phase: Abrir appears, Transferir enables,
    // still exactly the two primary actions + Abrir (three total), and the
    // preview <img> is present.
    await takePhoto.click();
    await expect(camera.getByRole("button", { name: "Abrir" })).toBeVisible();
    await expect(download).toBeEnabled();
    await expect(cameraButtons).toHaveCount(3);
    await expect(camera.getByRole("img", { name: "Câmara" })).toHaveCount(1);
    // The old buttons are gone under the two-action model.
    await expect(camera.getByRole("button", { name: "Capturar" })).toHaveCount(0);
    await expect(camera.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
    await expect(camera.getByRole("button", { name: "Anexar foto" })).toHaveCount(0);
    await expect(camera.getByRole("button", { name: "Repetir" })).toHaveCount(0);
    await expect(camera.getByRole("button", { name: "Cancelar" })).toHaveCount(0);

    // The camera stream was released when the still was taken (no lingering light).
    const stops = await page.evaluate(
      () => (window as unknown as { __cameraStops: number }).__cameraStops,
    );
    expect(stops).toBeGreaterThanOrEqual(1);

    // "Tirar foto" re-arms the live camera (Abrir disappears, preview returns).
    await takePhoto.click();
    await expect(camera.getByRole("button", { name: "Abrir" })).toHaveCount(0);
    await expect(cameraButtons).toHaveCount(2);
    await expect(takePhoto).toBeEnabled();
  });

  test("permission denied shows the pt-PT message and does not fall back to a file input", async ({
    page,
  }) => {
    await installFakeCamera(page, /* deny */ true);
    await createDraftFicha(page);

    await page.getByRole("button", { name: "Tirar foto" }).click();

    const camera = page.getByRole("group", { name: "Câmara" });
    // pt-PT denial guidance; no captured still, no Abrir, no silent gallery fallback.
    await expect(
      camera.getByText("Não foi possível aceder à câmara. Verifique as permissões do navegador."),
    ).toBeVisible();
    await expect(camera.getByRole("button", { name: "Abrir" })).toHaveCount(0);
    await expect(camera.getByRole("img", { name: "Câmara" })).toHaveCount(0);
  });
});
