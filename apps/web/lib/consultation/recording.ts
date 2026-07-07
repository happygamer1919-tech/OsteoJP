// W4-07 — in-browser audio recording for the AI consultation pipeline.
//
// Config is FIXED by SPEC-ai-recording §3 and MUST NOT deviate: MediaRecorder
// producing `audio/webm;codecs=opus`, 32 kbps, MONO. Rationale: Azure Whisper
// accepts 25 MB max; at 32 kbps mono audio is ~14.4 MB/hour, so a 90-minute
// session (~21.6 MB) fits under the cap. A different codec/bitrate would break
// the deterministic-format assumption and the Whisper size budget downstream.
//
// This loop STOPS at producing the blob + machine-stamped timestamps; upload
// (W4-08) and the webhook (W4-09) are separate. Kept DOM-thin and dependency-
// injected so the config, the Chrome-only gate, and the timestamps are
// unit-testable in the node test env.

export const RECORDING_MIME = "audio/webm;codecs=opus";
/** 32 kbps → ~14.4 MB/hour; a 90-min session stays under Whisper's 25 MB cap. */
export const RECORDING_BITRATE = 32000;
/** Mono (single channel) — half the data of stereo, ample for speech. */
export const RECORDING_AUDIO_CONSTRAINTS: MediaTrackConstraints = { channelCount: 1 };

export interface RecordingCaps {
  /** MediaRecorder.isTypeSupported, bound. */
  isTypeSupported?: (type: string) => boolean;
  /** Whether navigator.mediaDevices.getUserMedia exists. */
  hasGetUserMedia?: boolean;
}

function defaultCaps(): RecordingCaps {
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
  return {
    isTypeSupported: MR ? MR.isTypeSupported.bind(MR) : undefined,
    hasGetUserMedia:
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  };
}

/**
 * Chrome-only gate. Feature-detect (NOT UA-sniff, per the SPEC): the
 * deterministic webm/opus format must be supported by MediaRecorder AND
 * getUserMedia must exist. Non-Chrome engines fail isTypeSupported for
 * opus-in-webm, so they are gated out with a pt-PT block message.
 */
export function recordingSupported(caps: RecordingCaps = defaultCaps()): boolean {
  return (
    typeof caps.isTypeSupported === "function" &&
    caps.isTypeSupported(RECORDING_MIME) &&
    caps.hasGetUserMedia === true
  );
}

/** The exact MediaRecorder options fixed by the SPEC. */
export function recorderOptions(): MediaRecorderOptions {
  return { mimeType: RECORDING_MIME, audioBitsPerSecond: RECORDING_BITRATE };
}

/**
 * A machine timestamp — NEVER hand-typed. Record stamps consultation_started_at,
 * Stop stamps consultation_ended_at; both feed the ingestion idempotency key
 * (SPEC §8, patient_id + both timestamps), so they must be machine-side.
 */
export function machineStamp(now: Date = new Date()): string {
  return now.toISOString();
}

/** Release the microphone: stop every track so the OS mic indicator turns off. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** The hand-off shape produced for W4-08 (sign + upload). No upload here. */
export interface RecordingResult {
  blob: Blob;
  consultationStartedAt: string;
  consultationEndedAt: string;
}
