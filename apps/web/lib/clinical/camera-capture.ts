// In-page camera capture helpers for ficha attachments (W4-05, Rodica request).
//
// The design driver is "the photo must NEVER be saved to her phone gallery": a
// file-input `capture` shortcut persists the shot to the device gallery on many
// phones, so we use `getUserMedia` (in-page <video> -> capture a frame -> Blob)
// and keep the bytes in the page until they are uploaded through the existing
// signed-URL attachment path. Client-safe (no `server-only`). Kept DOM-thin and
// dependency-injected so the release-the-camera and permission paths are
// unit-testable in the node test env (see camera-capture.test.ts).

/** Captured stills are JPEG — universally accepted, no alpha needed for a photo. */
export const CAPTURE_MIME = "image/jpeg";
export const CAPTURE_QUALITY = 0.9;

export type CameraStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "unsupported" | "denied" };

/** True when in-page camera capture is available in this environment. */
export function cameraSupported(
  mediaDevices: MediaDevices | undefined = globalThis.navigator?.mediaDevices,
): boolean {
  return !!mediaDevices && typeof mediaDevices.getUserMedia === "function";
}

/**
 * Open the camera in-page. Returns a typed result rather than throwing so the
 * caller can render a pt-PT message. We NEVER fall back to a gallery-persisting
 * file input — that would violate the "never in her gallery" requirement.
 */
export async function startCamera(
  mediaDevices: MediaDevices | undefined = globalThis.navigator?.mediaDevices,
): Promise<CameraStartResult> {
  if (!cameraSupported(mediaDevices)) return { ok: false, reason: "unsupported" };
  try {
    // `environment` prefers the rear camera on phones; falls back to any camera.
    const stream = await mediaDevices!.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    return { ok: true, stream };
  } catch {
    // Permission blocked, no camera, or device in use — all surface the same
    // pt-PT guidance to the clinician.
    return { ok: false, reason: "denied" };
  }
}

/** Release the camera: stop every track so the OS camera indicator turns off. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Draw the current video frame onto the canvas and export it as an image Blob.
 * The bytes live only in the page (and then Supabase Storage via a signed URL) —
 * never the device gallery.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  mimeType: string = CAPTURE_MIME,
  quality: number = CAPTURE_QUALITY,
): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("camera: no frame available yet");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("camera: 2d context unavailable");
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("camera: toBlob returned null")),
      mimeType,
      quality,
    );
  });
}

/** Friendly, collision-safe file name; the server appends a UUID to the path. */
export function captureFileName(now: number = Date.now()): string {
  return `foto-${now}.jpg`;
}
