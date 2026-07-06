"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import {
  CAPTURE_MIME,
  captureFrame,
  startCamera,
  stopStream,
  type CameraStartResult,
} from "@/lib/clinical/camera-capture";

type Phase = "starting" | "preview" | "captured" | "denied" | "unsupported";

/**
 * In-page camera capture (W4-05). Opens the camera with `getUserMedia`, lets the
 * clinician capture / retake / attach a still, and releases the camera as soon
 * as the still is taken (and on cancel/unmount). The photo never touches the
 * device gallery — it lives in the page until uploaded via the signed-URL path.
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
  // (the mount effect's .then callback, or an event handler after await) — never
  // synchronously in the effect body.
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

  useEffect(() => {
    let cancelled = false;
    startCamera().then((r) => {
      if (!cancelled) applyStart(r);
    });
    return () => {
      cancelled = true;
      releaseStream();
      releaseUrl();
    };
  }, []);

  async function onCapture() {
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

  async function onRetake() {
    releaseUrl();
    setPreviewUrl(null);
    blobRef.current = null;
    setPhase("starting");
    applyStart(await startCamera());
  }

  function close() {
    releaseStream();
    releaseUrl();
    onClose();
  }

  async function onConfirm() {
    const blob = blobRef.current;
    if (!blob) return;
    setUploading(true);
    const ok = await onAttach(blob);
    setUploading(false);
    if (ok) close();
  }

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
      {phase === "captured" && previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- ephemeral in-page blob preview, never a remote asset
        <img
          src={previewUrl}
          alt={s["clinical.cameraTitle"]}
          className="w-full max-w-sm rounded"
        />
      )}
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-wrap gap-2">
        {phase === "preview" && (
          <Button type="button" size="sm" onClick={onCapture}>
            {s["clinical.cameraCapture"]}
          </Button>
        )}
        {phase === "captured" && (
          <>
            <Button type="button" size="sm" onClick={onConfirm} disabled={uploading}>
              {uploading ? s["clinical.attachmentUploading"] : s["clinical.cameraConfirm"]}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onRetake}
              disabled={uploading}
            >
              {s["clinical.cameraRetake"]}
            </Button>
          </>
        )}
        {(phase === "denied" || phase === "unsupported") && (
          <Button type="button" size="sm" variant="secondary" onClick={onRetake}>
            {s["clinical.cameraRetry"]}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={close}
          disabled={uploading}
        >
          {s["clinical.cameraCancel"]}
        </Button>
      </div>
    </div>
  );
}
