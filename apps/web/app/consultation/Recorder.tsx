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

type Phase = "unsupported" | "idle" | "recording" | "recorded";

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
      setPhase("recorded");
      onComplete?.({ ...res, patientId });
    };
    // Record stamps the start time (machine clock — never hand-typed).
    startedAtRef.current = machineStamp();
    recorder.start();
    setPhase("recording");
  }

  function onStop() {
    recorderRef.current?.stop();
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

      {phase !== "recorded" && (
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

      {phase === "recorded" && result && (
        <p role="status" className="rounded border border-teal-600 bg-teal-50 px-3 py-2 text-sm">
          {s["recording.done"]}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-error">
          {s["recording.micError"]}
        </p>
      )}
    </div>
  );
}
