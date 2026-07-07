import { describe, it, expect, vi } from "vitest";
import {
  RECORDING_AUDIO_CONSTRAINTS,
  RECORDING_BITRATE,
  RECORDING_MIME,
  machineStamp,
  recorderOptions,
  recordingSupported,
  stopStream,
} from "./recording";

// W4-07 — the recording config is FIXED by SPEC-ai-recording §3 (webm/opus,
// 32 kbps, mono, Chrome-only, machine timestamps). These pin the contract so a
// silent codec/bitrate drift (which would break the Whisper size budget) fails
// CI. Node env — DOM objects are minimal fakes.

describe("recording config (SPEC §3, must not drift)", () => {
  it("is audio/webm;codecs=opus at 32 kbps, mono", () => {
    expect(RECORDING_MIME).toBe("audio/webm;codecs=opus");
    expect(RECORDING_BITRATE).toBe(32000);
    expect(RECORDING_AUDIO_CONSTRAINTS).toEqual({ channelCount: 1 });
    expect(recorderOptions()).toEqual({
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 32000,
    });
  });
});

describe("recordingSupported (Chrome-only, feature-detect)", () => {
  it("true when the opus/webm type is supported AND getUserMedia exists", () => {
    expect(
      recordingSupported({ isTypeSupported: (t) => t === RECORDING_MIME, hasGetUserMedia: true }),
    ).toBe(true);
  });
  it("false when the codec is unsupported (non-Chrome)", () => {
    expect(recordingSupported({ isTypeSupported: () => false, hasGetUserMedia: true })).toBe(false);
  });
  it("false when MediaRecorder is absent", () => {
    expect(recordingSupported({ hasGetUserMedia: true })).toBe(false);
  });
  it("false when getUserMedia is absent", () => {
    expect(
      recordingSupported({ isTypeSupported: () => true, hasGetUserMedia: false }),
    ).toBe(false);
  });
});

describe("machineStamp (machine clock, never hand-typed)", () => {
  it("is a deterministic ISO string for a given clock", () => {
    expect(machineStamp(new Date("2026-07-07T01:00:00.000Z"))).toBe("2026-07-07T01:00:00.000Z");
  });
  it("start < end for sequential stamps", () => {
    const start = machineStamp(new Date("2026-07-07T01:00:00.000Z"));
    const end = machineStamp(new Date("2026-07-07T01:30:00.000Z"));
    expect(start < end).toBe(true);
  });
});

describe("stopStream (release the microphone)", () => {
  it("stops every track", () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopStream({ getTracks: () => tracks } as unknown as MediaStream);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });
  it("no-op on null/undefined", () => {
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });
});
