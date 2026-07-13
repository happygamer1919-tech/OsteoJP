"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import {
  RECORDING_AUDIO_CONSTRAINTS,
  RECORDING_MIME,
  machineStamp,
  recorderOptions,
  recordingSupported,
  stopStream,
  type RecordingResult,
} from "@/lib/consultation/recording";
import { putToPresignedUrl, uploadRecording } from "@/lib/consultation/upload-audio";
import { fireConsultationWebhookAction, signAudioUploadAction } from "./actions";
import { GuiaoPanel } from "./GuiaoPanel";

type Phase =
  | "unsupported"
  | "idle"
  | "recording"
  | "uploading"
  | "firing"
  | "fired"
  | "fire_pending"
  | "upload_error";

/**
 * W4-07 recording UI. Chrome-only (feature-detected): non-Chrome shows the
 * pt-PT block and cannot record. Record stamps consultation_started_at (machine
 * clock), Stop stamps consultation_ended_at, and produces the webm/opus blob.
 * This loop does NOT upload — the blob + timestamps are handed to onComplete
 * for W4-08 to sign + PUT to S3.
 */
export function Recorder({
  patientId,
  onComplete,
}: {
  patientId: string;
  onComplete?: (result: RecordingResult & { patientId: string }) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [error, setError] = useState(false);

  // Chrome-only gate — feature-detect once on mount (SPEC §4). Deferred via a
  // microtask so it is not a synchronous setState in the effect body
  // (react-hooks/set-state-in-effect) and so SSR + first client render both stay
  // "idle" (no hydration mismatch); non-Chrome then flips to the block message.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && !recordingSupported()) setPhase("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Always release the microphone on unmount.
  useEffect(() => {
    return () => stopStream(streamRef.current);
  }, []);

  function release() {
    stopStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
  }

  async function onRecord() {
    setError(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: RECORDING_AUDIO_CONSTRAINTS });
    } catch {
      setError(true);
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, recorderOptions());
    } catch {
      release();
      setError(true);
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      // Stop stamps the end time; assemble the webm/opus blob and release the mic.
      const consultationEndedAt = machineStamp();
      const blob = new Blob(chunksRef.current, { type: RECORDING_MIME });
      release();
      const res: RecordingResult = {
        blob,
        consultationStartedAt: startedAtRef.current ?? consultationEndedAt,
        consultationEndedAt,
      };
      setResult(res);
      onComplete?.({ ...res, patientId });
      void startUpload(res);
    };
    // Record stamps the start time (machine clock — never hand-typed).
    startedAtRef.current = machineStamp();
    recorder.start();
    setPhase("recording");
  }

  function onStop() {
    recorderRef.current?.stop();
  }

  // W4-08 upload → W4-09 fire. After Stop: sign a presigned PUT and upload the
  // blob DIRECT to S3 (never through Vercel), then fire the M1 webhook so André's
  // pipeline can pull + transcribe it. If the upload fails, that is a hard error;
  // if only the webhook fire fails (e.g. env not set), the audio is safely stored
  // and processing is retried — surfaced as a non-error "saved, pending" state.
  async function startUpload(res: RecordingResult) {
    setPhase("uploading");
    const outcome = await uploadRecording(
      { ...res, patientId },
      { sign: signAudioUploadAction, put: putToPresignedUrl },
    );
    if (!outcome.ok) {
      setPhase("upload_error");
      return;
    }
    setPhase("firing");
    const fired = await fireConsultationWebhookAction({
      objectKey: outcome.objectKey,
      patientId,
      consultationStartedAt: res.consultationStartedAt,
      consultationEndedAt: res.consultationEndedAt,
    });
    setPhase(fired.ok ? "fired" : "fire_pending");
  }

  if (phase === "unsupported") {
    return (
      <div className="max-w-lg space-y-2">
        <h1 className="text-lg font-semibold">{s["consultation.title"]}</h1>
        <p role="alert" className="text-sm text-error">
          {s["recording.unsupported"]}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-3">
      <h1 className="text-lg font-semibold">{s["consultation.title"]}</h1>

      {(phase === "idle" || phase === "recording") && (
        <div className="flex items-center gap-3">
          {phase === "recording" ? (
            <Button type="button" variant="destructive" onClick={onStop}>
              {s["recording.stop"]}
            </Button>
          ) : (
            <Button type="button" onClick={onRecord}>
              {s["recording.record"]}
            </Button>
          )}
          {phase === "recording" && (
            <span role="status" className="text-sm text-error">
              {s["recording.inProgress"]}
            </span>
          )}
        </div>
      )}

      {(phase === "uploading" || phase === "firing") && (
        <p role="status" className="text-sm text-text-secondary">
          {phase === "uploading" ? s["recording.uploading"] : s["recording.processing"]}
        </p>
      )}
      {phase === "fired" && (
        <p role="status" className="rounded border border-teal-600 bg-teal-50 px-3 py-2 text-sm">
          {s["recording.processed"]}
        </p>
      )}
      {phase === "fire_pending" && (
        <p role="status" className="rounded border border-amber-500 bg-amber-50 px-3 py-2 text-sm">
          {s["recording.savedPending"]}
        </p>
      )}
      {phase === "upload_error" && (
        <p role="alert" className="text-xs text-error">
          {s["recording.uploadError"]}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-error">
          {s["recording.micError"]}
        </p>
      )}

      {/* W5-34: read-only "Guião do Exame Subjetivo" reference, collapsed by
          default, below the controls. Native <details> - never overlaps or
          blocks the recording controls above. */}
      <GuiaoPanel />
    </div>
  );
}
