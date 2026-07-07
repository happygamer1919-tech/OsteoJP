import { vi, describe, it, expect } from "vitest";
import { uploadRecording, type AudioUploadDeps } from "./upload-audio";

// W4-08 — client orchestration: sign → PUT-direct-to-S3. Deps injected (no
// network). Pins: the blob is PUT to the signed URL, sign/put failures
// short-circuit, and a `config` (missing AUDIO_S3_* env) surfaces.

const res = () => ({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
  consultationStartedAt: "2026-07-07T01:00:00.000Z",
  consultationEndedAt: "2026-07-07T01:30:00.000Z",
  patientId: "p1",
});

describe("uploadRecording", () => {
  it("signs then PUTs the blob DIRECT to the presigned S3 URL", async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const deps: AudioUploadDeps = {
      sign: vi.fn().mockResolvedValue({ ok: true, url: "https://s3.example/obj?sig", objectKey: "t1/p1/ts/consultation.webm" }),
      put,
    };
    const r = res();
    const out = await uploadRecording(r, deps);
    expect(out).toEqual({ ok: true, objectKey: "t1/p1/ts/consultation.webm" });
    expect(deps.sign).toHaveBeenCalledWith({ patientId: "p1", consultationStartedAt: r.consultationStartedAt });
    expect(put).toHaveBeenCalledWith("https://s3.example/obj?sig", r.blob);
  });

  it("stops at sign when the signer fails (e.g. config missing) — no PUT", async () => {
    const put = vi.fn();
    const deps: AudioUploadDeps = {
      sign: vi.fn().mockResolvedValue({ ok: false, error: "config" }),
      put,
    };
    const out = await uploadRecording(res(), deps);
    expect(out).toEqual({ ok: false, step: "sign", error: "config" });
    expect(put).not.toHaveBeenCalled();
  });

  it("reports a PUT failure (e.g. CORS / non-200)", async () => {
    const deps: AudioUploadDeps = {
      sign: vi.fn().mockResolvedValue({ ok: true, url: "https://s3.example/obj", objectKey: "k" }),
      put: vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    };
    const out = await uploadRecording(res(), deps);
    expect(out).toEqual({ ok: false, step: "put" });
  });
});
