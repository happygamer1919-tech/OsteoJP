import { describe, expect, it, vi } from "vitest";
import {
  SIGNATURE_MIME,
  canvasToSignatureBlob,
  drawStrokes,
  hasSignature,
  signatureFileName,
  toCanvasPoint,
  type SignatureStroke,
} from "./signature-capture";

describe("signature-capture (SPEC 7.1)", () => {
  it("hasSignature is false for no strokes / only empty strokes, true once drawn", () => {
    expect(hasSignature([])).toBe(false);
    expect(hasSignature([[]])).toBe(false);
    expect(hasSignature([[{ x: 1, y: 2 }]])).toBe(true);
  });

  it("maps client coords to canvas pixels accounting for CSS scaling", () => {
    // Canvas is 600x200 backing but rendered at 300x100 on screen (2x scale).
    const rect = { left: 10, top: 20, width: 300, height: 100 };
    const p = toCanvasPoint(160, 70, rect, 600, 200);
    expect(p.x).toBeCloseTo((160 - 10) * (600 / 300)); // 300
    expect(p.y).toBeCloseTo((70 - 20) * (200 / 100)); // 100
  });

  it("toCanvasPoint tolerates a zero-size rect without dividing by zero", () => {
    const p = toCanvasPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 600, 200);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("drawStrokes clears then strokes each path (single-point tap draws a dot)", () => {
    const calls: string[] = [];
    const ctx = {
      clearRect: () => calls.push("clear"),
      beginPath: () => calls.push("begin"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      stroke: () => calls.push("stroke"),
      lineWidth: 0,
      lineJoin: "",
      lineCap: "",
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const strokes: SignatureStroke[] = [[{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 9, y: 9 }]];
    drawStrokes(ctx, strokes, 600, 200);
    expect(calls[0]).toBe("clear");
    // Two paths stroked (multi-point + single-point-as-dot).
    expect(calls.filter((c) => c === "stroke").length).toBe(2);
    expect(calls).toContain("moveTo");
    expect(calls).toContain("lineTo");
  });

  it("canvasToSignatureBlob resolves the PNG blob (default mime)", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: SIGNATURE_MIME });
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void, mime: string) => {
        expect(mime).toBe(SIGNATURE_MIME);
        cb(blob);
      },
    } as unknown as HTMLCanvasElement;
    await expect(canvasToSignatureBlob(canvas)).resolves.toBe(blob);
  });

  it("canvasToSignatureBlob rejects when the browser returns no blob", async () => {
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
    } as unknown as HTMLCanvasElement;
    await expect(canvasToSignatureBlob(canvas)).rejects.toThrow(/toBlob/);
  });

  it("signatureFileName is a deterministic .png name given a fixed clock", () => {
    vi.useFakeTimers();
    expect(signatureFileName(123)).toBe("assinatura-123.png");
    vi.useRealTimers();
  });
});
