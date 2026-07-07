import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// W4-08 — the presigned S3 signer (AWS SigV4 via node:crypto, no SDK). These
// pin: server-derived object key, a well-formed SigV4 presigned URL, that the
// SECRET never appears in the URL (only the derived signature), that the
// signature is deterministic and actually depends on the secret, and that a
// MISSING env THROWS (never a stub key).

import {
  AUDIO_FILENAME,
  AudioStorageConfigError,
  audioObjectKey,
  signAudioDownload,
  signAudioUpload,
} from "./audio-storage";

const ENV = {
  AUDIO_S3_REGION: "eu-central-1",
  AUDIO_S3_BUCKET: "osteojp-audio-intake",
  AUDIO_S3_ACCESS_KEY_ID: "AKIAEXAMPLETESTKEY",
  AUDIO_S3_SECRET_ACCESS_KEY: "test-secret-value-do-not-log",
};
const NOW = new Date("2026-07-07T01:02:03.456Z");

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
});

describe("audioObjectKey (server-derived)", () => {
  it("is tenant/patient/slugged-timestamp/consultation.webm", () => {
    expect(audioObjectKey("t1", "p1", "2026-07-07T01:02:03.456Z")).toBe(
      `t1/p1/2026-07-07T01-02-03-456Z/${AUDIO_FILENAME}`,
    );
  });
});

describe("signAudioUpload (SigV4 presigned PUT)", () => {
  it("returns a well-formed presigned URL for the scoped bucket + the object key", async () => {
    const { url, objectKey } = await signAudioUpload("t1", "p1", "2026-07-07T01:02:03.456Z", NOW);
    expect(objectKey).toBe("t1/p1/2026-07-07T01-02-03-456Z/consultation.webm");
    expect(url).toContain("https://osteojp-audio-intake.s3.eu-central-1.amazonaws.com/");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Expires=600");
    expect(url).toContain("X-Amz-Credential=AKIAEXAMPLETESTKEY");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}/); // hex HMAC-SHA256
  });

  it("NEVER leaks the secret into the URL (only the derived signature)", async () => {
    const { url } = await signAudioUpload("t1", "p1", "2026-07-07T01:02:03.456Z", NOW);
    expect(url).not.toContain(ENV.AUDIO_S3_SECRET_ACCESS_KEY);
  });

  it("is deterministic for the same inputs", async () => {
    const a = await signAudioUpload("t1", "p1", "2026-07-07T01:02:03.456Z", NOW);
    const b = await signAudioUpload("t1", "p1", "2026-07-07T01:02:03.456Z", NOW);
    expect(a.url).toBe(b.url);
  });

  it("the signature actually depends on the secret (changing it changes the signature)", async () => {
    const a = await signAudioUpload("t1", "p1", "2026-07-07T01:02:03.456Z", NOW);
    process.env.AUDIO_S3_SECRET_ACCESS_KEY = "a-different-secret";
    const b = await signAudioUpload("t1", "p1", "2026-07-07T01:02:03.456Z", NOW);
    const sigA = a.url.match(/X-Amz-Signature=([0-9a-f]+)/)![1];
    const sigB = b.url.match(/X-Amz-Signature=([0-9a-f]+)/)![1];
    expect(sigA).not.toBe(sigB);
  });

  it("THROWS AudioStorageConfigError naming the missing var (never a stub key)", async () => {
    delete process.env.AUDIO_S3_SECRET_ACCESS_KEY;
    await expect(signAudioUpload("t1", "p1", "2026-07-07T01:00:00.000Z")).rejects.toBeInstanceOf(
      AudioStorageConfigError,
    );
    process.env.AUDIO_S3_SECRET_ACCESS_KEY = ENV.AUDIO_S3_SECRET_ACCESS_KEY;
    delete process.env.AUDIO_S3_REGION;
    await expect(signAudioUpload("t1", "p1", "2026-07-07T01:00:00.000Z")).rejects.toThrow(
      /AUDIO_S3_REGION/,
    );
  });
});

describe("signAudioDownload (same scoped key, round-trip readback)", () => {
  it("returns a presigned GET URL for the object", async () => {
    const url = await signAudioDownload("t1/p1/ts/consultation.webm", 600, NOW);
    expect(url).toContain("t1/p1/ts/consultation.webm");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}/);
  });
});
