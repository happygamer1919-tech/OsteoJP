import { describe, it, expect, vi } from "vitest";
import {
  cameraSupported,
  captureFileName,
  captureFrame,
  startCamera,
  stopStream,
  CAPTURE_MIME,
} from "./camera-capture";

// W4-05 — in-page camera capture for ficha attachments. These pin the two
// safety-critical behaviours: the camera is ALWAYS released (stopStream stops
// every track), and permission/unsupported paths return a typed result instead
// of throwing (so the UI shows pt-PT guidance and never falls back to a
// gallery-persisting file input). The web test env is node, so DOM objects are
// minimal fakes.

function fakeStream(trackCount = 2) {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }));
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream };
}

describe("cameraSupported", () => {
  it("false when mediaDevices is absent", () => {
    expect(cameraSupported(undefined)).toBe(false);
  });
  it("false when getUserMedia is not a function", () => {
    expect(cameraSupported({} as unknown as MediaDevices)).toBe(false);
  });
  it("true when getUserMedia exists", () => {
    expect(cameraSupported({ getUserMedia: vi.fn() } as unknown as MediaDevices)).toBe(true);
  });
});

describe("startCamera", () => {
  it("returns unsupported when getUserMedia is missing", async () => {
    await expect(startCamera(undefined)).resolves.toEqual({ ok: false, reason: "unsupported" });
  });

  it("returns denied when getUserMedia rejects (permission blocked / no camera)", async () => {
    const md = {
      getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
    } as unknown as MediaDevices;
    await expect(startCamera(md)).resolves.toEqual({ ok: false, reason: "denied" });
  });

  it("returns the stream and requests video-only, rear-facing", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const md = { getUserMedia } as unknown as MediaDevices;
    const r = await startCamera(md);
    expect(r).toEqual({ ok: true, stream });
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" }, audio: false });
  });
});

describe("stopStream (release the camera)", () => {
  it("stops every track", () => {
    const { tracks, stream } = fakeStream(3);
    stopStream(stream);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });
  it("no-op on null/undefined", () => {
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });
});

describe("captureFrame", () => {
  function fakeCanvas(blob: Blob | null) {
    const ctx = { drawImage: vi.fn() };
    return {
      canvas: {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(ctx),
        toBlob: (cb: (b: Blob | null) => void) => cb(blob),
      } as unknown as HTMLCanvasElement,
      ctx,
    };
  }
  const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;

  it("draws the frame and resolves the exported blob", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: CAPTURE_MIME });
    const { canvas, ctx } = fakeCanvas(blob);
    const out = await captureFrame(video, canvas, CAPTURE_MIME);
    expect(out).toBe(blob);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });

  it("throws when the video has no frame yet", async () => {
    const { canvas } = fakeCanvas(new Blob());
    const noFrame = { videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement;
    await expect(captureFrame(noFrame, canvas)).rejects.toThrow(/no frame/);
  });

  it("rejects when toBlob yields null", async () => {
    const { canvas } = fakeCanvas(null);
    await expect(captureFrame(video, canvas)).rejects.toThrow(/toBlob/);
  });
});

describe("captureFileName", () => {
  it("is deterministic for a given clock and ends in .jpg", () => {
    expect(captureFileName(1751840000000)).toBe("foto-1751840000000.jpg");
  });
});
