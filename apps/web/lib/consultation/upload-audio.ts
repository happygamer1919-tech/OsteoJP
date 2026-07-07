// W4-08 — client-side direct-to-S3 upload of the recorded blob (browser PUTs to
// the presigned URL, NEVER through a Vercel/Next route — SPEC §6, the 4.5 MB
// body limit + signed-URL rule). Dependency-injected so the orchestration is
// unit-testable in the node test env (no network, no S3).

import type { RecordingResult } from "./recording";

/** PUT the blob DIRECTLY to the presigned S3 URL. Returns the HTTP status. */
export async function putToPresignedUrl(
  url: string,
  blob: Blob,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(url, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": "audio/webm" },
  });
  return { ok: res.ok, status: res.status };
}

type SignResult =
  | { ok: true; url: string; objectKey: string }
  | { ok: false; error: string };

export interface AudioUploadDeps {
  /** Server action: returns a presigned PUT URL + the server-derived object key. */
  sign: (input: { patientId: string; consultationStartedAt: string }) => Promise<SignResult>;
  /** Direct-to-S3 PUT of the blob to the presigned URL. */
  put: (url: string, blob: Blob) => Promise<{ ok: boolean; status: number }>;
}

export type AudioUploadOutcome =
  | { ok: true; objectKey: string }
  | { ok: false; step: "sign" | "put"; error?: string };

/**
 * Sign → PUT-direct-to-S3. `config` from the signer means the AUDIO_S3_* env is
 * not set (surfaced to the user, never a stub key).
 */
export async function uploadRecording(
  result: RecordingResult & { patientId: string },
  deps: AudioUploadDeps,
): Promise<AudioUploadOutcome> {
  const slot = await deps.sign({
    patientId: result.patientId,
    consultationStartedAt: result.consultationStartedAt,
  });
  if (!slot.ok) return { ok: false, step: "sign", error: slot.error };

  const put = await deps.put(slot.url, result.blob);
  if (!put.ok) return { ok: false, step: "put" };

  return { ok: true, objectKey: slot.objectKey };
}
