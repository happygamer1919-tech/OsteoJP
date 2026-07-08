import { describe, it, expect, vi } from "vitest";
import {
  cameraSupported,
  captureFileName,
  captureFrame,
  downloadStill,
  startCamera,
  startCameraCancellable,
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

// W5-07 first-open regression. getUserMedia resolves asynchronously (real
// hardware takes time); React StrictMode's dev double-mount tears the component
// down and remounts it on EVERY first open, so a stream granted after teardown
// used to leak (camera indicator stayed on; on exclusive-camera devices the
// racing second acquisition failed NotReadableError -> "denied" alert on first
// open). startCameraCancellable stops a stale grant instead of leaking it.
describe("startCameraCancellable (W5-07 first-open fix)", () => {
  /** getUserMedia that resolves only when released — like real hardware. */
  function deferredMediaDevices(stream: MediaStream) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const md = {
      getUserMedia: vi.fn().mockImplementation(async () => {
        await gate;
        return stream;
      }),
    } as unknown as MediaDevices;
    return { md, release };
  }

  it("stops a stream granted AFTER cancellation and applies nothing (the first-open leak)", async () => {
    const { tracks, stream } = fakeStream();
    const { md, release } = deferredMediaDevices(stream);
    let cancelled = false;
    const pending = startCameraCancellable(() => cancelled, md);
    // Teardown happens while getUserMedia is still pending (StrictMode
    // dev double-mount on first open, or the user closing the panel fast).
    cancelled = true;
    release();
    await expect(pending).resolves.toBeNull();
    // The granted stream was STOPPED, not leaked.
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  it("StrictMode first-open sequence: the cancelled first start is stopped, the second start wins", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const firstMd = deferredMediaDevices(first.stream);
    const secondMd = deferredMediaDevices(second.stream);

    // Mount #1 starts, is torn down, then mount #2 starts (React dev order).
    let firstCancelled = false;
    const p1 = startCameraCancellable(() => firstCancelled, firstMd.md);
    firstCancelled = true; // cleanup #1
    const p2 = startCameraCancellable(() => false, secondMd.md); // mount #2
    firstMd.release();
    secondMd.release();

    await expect(p1).resolves.toBeNull();
    await expect(p2).resolves.toEqual({ ok: true, stream: second.stream });
    for (const t of first.tracks) expect(t.stop).toHaveBeenCalledTimes(1); // no leak
    for (const t of second.tracks) expect(t.stop).not.toHaveBeenCalled(); // live preview
  });

  it("passes the result through untouched when not cancelled", async () => {
    const { tracks, stream } = fakeStream();
    const { md, release } = deferredMediaDevices(stream);
    const pending = startCameraCancellable(() => false, md);
    release();
    await expect(pending).resolves.toEqual({ ok: true, stream });
    for (const t of tracks) expect(t.stop).not.toHaveBeenCalled();
  });

  it("returns the typed failure (not null) when the start fails without cancellation", async () => {
    const md = {
      getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
    } as unknown as MediaDevices;
    await expect(startCameraCancellable(() => false, md)).resolves.toEqual({
      ok: false,
      reason: "denied",
    });
  });
});

// W5-07 "Transferir": explicit user-initiated download of the in-page still.
// Distinct from the silent gallery persistence W4-05 forbids — bytes leave the
// page only through this deliberate anchor click (or the signed-URL upload).
describe("downloadStill (Transferir)", () => {
  function fakeDocument() {
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const doc = {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild: vi.fn() },
    } as unknown as Document;
    return { doc, anchor };
  }

  it("clicks a temporary anchor pointing at the in-page object URL", () => {
    const { doc, anchor } = fakeDocument();
    downloadStill("blob:https://app/abc", "foto-1.jpg", doc);
    expect(anchor.href).toBe("blob:https://app/abc");
    expect(anchor.download).toBe("foto-1.jpg");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
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
