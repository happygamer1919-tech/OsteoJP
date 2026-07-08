"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import {
  CAPTURE_MIME,
  captureFileName,
  captureFrame,
  downloadStill,
  startCameraCancellable,
  stopStream,
  type CameraStartResult,
} from "@/lib/clinical/camera-capture";

type Phase = "starting" | "preview" | "captured" | "denied" | "unsupported";

/**
 * In-page camera capture (W4-05, controls reworked by W5-07). Exactly two
 * primary actions:
 *
 * - "Tirar foto" — captures a still during the live preview; with a still on
 *   screen (or after a denial) it re-arms the live preview, folding the old
 *   retake/retry buttons into the same action.
 * - "Transferir" — user-initiated download of the current still to the device
 *   (enabled only once a photo exists). Deliberate download, NOT the silent
 *   gallery persistence W4-05 forbids.
 *
 * "Abrir" appears only once a photo exists and attaches the still to the ficha
 * via the existing signed-URL path (createAttachmentUploadUrl -> upload ->
 * confirmAttachment, wired through `onAttach`). No other buttons render.
 *
 * The camera is released (`stopStream`) as soon as the still is taken, on
 * attach, and on unmount — including a start still pending when the component
 * is torn down (W5-07 first-open fix, see `startCameraCancellable`). The photo
 * never touches the device gallery; it lives in the page until uploaded.
 */
export function CameraCapture({
  onAttach,
  onClose,
}: {
  /** Upload the captured still; resolves true on success. */
  onAttach: (blob: Blob) => Promise<boolean>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  // Start generation: bumped by every new start and by unmount, so a
  // getUserMedia grant that lands after teardown (React StrictMode's dev
  // double-mount on first open, or a fast close) is detected as stale and
  // stopped instead of leaking the camera (W5-07 first-open fix).
  const startGenRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function releaseStream() {
    stopStream(streamRef.current);
    streamRef.current = null;
  }
  function releaseUrl() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  // Apply a camera-start result to state. Called only from a deferred context
  // (after await in the mount effect or an event handler) — never synchronously
  // in the effect body.
  function applyStart(r: CameraStartResult) {
    if (!r.ok) {
      setPhase(r.reason);
      return;
    }
    streamRef.current = r.stream;
    const video = videoRef.current;
    if (video) {
      try {
        video.srcObject = r.stream;
        // Autoplay can reject on some browsers; the live preview still renders.
        void video.play().catch(() => {});
      } catch {
        /* attaching the preview failed; the stream is live and still released on close */
      }
    }
    setPhase("preview");
  }

  // Start (or restart) the live preview. Cancellation-safe: if this start is
  // superseded or the component unmounts before the camera is granted, the
  // stale stream is stopped inside startCameraCancellable — never leaked. The
  // caller owns the "starting" transition so the mount effect body stays
  // setState-free (react-hooks/set-state-in-effect).
  async function beginPreview() {
    const gen = ++startGenRef.current;
    const r = await startCameraCancellable(() => gen !== startGenRef.current);
    if (r) applyStart(r);
  }

  useEffect(() => {
    // Initial phase is already "starting" — no synchronous setState here.
    void beginPreview();
    return () => {
      startGenRef.current += 1; // cancel any in-flight start
      releaseStream();
      releaseUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  async function captureStill() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let blob: Blob;
    try {
      blob = await captureFrame(video, canvas, CAPTURE_MIME);
    } catch {
      setPhase("denied");
      return;
    }
    // We have the still — release the camera immediately (no lingering light).
    releaseStream();
    blobRef.current = blob;
    releaseUrl();
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    setPreviewUrl(url);
    setPhase("captured");
  }

  // "Tirar foto": capture during the live preview; anywhere else (still on
  // screen, denied, unsupported) it re-arms the live preview.
  async function onTakePhoto() {
    if (phase === "preview") {
      await captureStill();
      return;
    }
    releaseUrl();
    setPreviewUrl(null);
    blobRef.current = null;
    setPhase("starting");
    await beginPreview();
  }

  // "Transferir": explicit, user-initiated download of the current still.
  function onDownload() {
    if (!urlRef.current) return;
    downloadStill(urlRef.current, captureFileName());
  }

  function close() {
    releaseStream();
    releaseUrl();
    onClose();
  }

  // "Abrir": attach the still to the ficha via the existing signed-URL path.
  async function onOpen() {
    const blob = blobRef.current;
    if (!blob) return;
    setUploading(true);
    const ok = await onAttach(blob);
    setUploading(false);
    if (ok) close();
  }

  const hasPhoto = phase === "captured" && previewUrl !== null;

  return (
    <div
      className="space-y-2 rounded border p-2"
      role="group"
      aria-label={s["clinical.cameraTitle"]}
    >
      {phase === "unsupported" && (
        <p role="alert" className="text-xs text-error">
          {s["clinical.cameraUnsupported"]}
        </p>
      )}
      {phase === "denied" && (
        <p role="alert" className="text-xs text-error">
          {s["clinical.cameraDenied"]}
        </p>
      )}

      {phase !== "captured" && (
        <video
          ref={videoRef}
          playsInline
          muted
          className={phase === "preview" ? "w-full max-w-sm rounded" : "hidden"}
        />
      )}
      {hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- ephemeral in-page blob preview, never a remote asset
        <img
          src={previewUrl}
          alt={s["clinical.cameraTitle"]}
          className="w-full max-w-sm rounded"
        />
      )}
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onTakePhoto}
          disabled={phase === "starting" || uploading}
        >
          {s["clinical.cameraTakePhoto"]}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onDownload}
          disabled={!hasPhoto || uploading}
        >
          {s["clinical.cameraDownload"]}
        </Button>
        {hasPhoto && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onOpen}
            disabled={uploading}
          >
            {uploading ? s["clinical.attachmentUploading"] : s["clinical.cameraOpen"]}
          </Button>
        )}
      </div>
    </div>
  );
}
