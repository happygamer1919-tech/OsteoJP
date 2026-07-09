// On-screen patient-signature capture helpers (SPEC-ficha-medica.md sec 7.1).
//
// The patient signs on a <canvas>; the strokes are exported to a PNG Blob and
// uploaded through the EXISTING patient-documents signed-URL path
// (createPatientDocumentUploadUrl -> direct PUT -> confirmPatientDocument) so the
// signature image lands in the patient's Documentos, tenant-scoped, signed URLs
// only, never public (CLAUDE.md rule 8). PNG keeps the transparent background /
// crisp strokes; document-validation already accepts image/png.
//
// Client-safe (no `server-only`). Kept DOM-thin + dependency-injected so the
// stroke math and the blob export are unit-testable in the node test env.

/** Signatures are PNG — crisp strokes, transparent background, universally read. */
export const SIGNATURE_MIME = "image/png";

/** A point on the signature canvas, in canvas pixel coordinates. */
export type SignaturePoint = { x: number; y: number };
/** One continuous pen stroke (pointer-down → pointer-up). */
export type SignatureStroke = SignaturePoint[];

/** True once at least one non-empty stroke has been drawn. */
export function hasSignature(strokes: readonly SignatureStroke[]): boolean {
  return strokes.some((stroke) => stroke.length > 0);
}

/**
 * Map a pointer event's client coordinates to canvas pixel coordinates,
 * accounting for the element's on-screen size vs its backing pixel size (CSS
 * scaling / devicePixelRatio). Pure given a rect + backing size.
 */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): SignaturePoint {
  const sx = rect.width === 0 ? 1 : canvasWidth / rect.width;
  const sy = rect.height === 0 ? 1 : canvasHeight / rect.height;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

/**
 * Draw the accumulated strokes onto a 2D context. Clears first so a re-render is
 * idempotent. Pure DOM draw — no state. Line style is a solid ink stroke.
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly SignatureStroke[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#212121";
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i]!.x, stroke[i]!.y);
    }
    // A single-point stroke (a tap) draws a small dot so it is still visible.
    if (stroke.length === 1) {
      ctx.lineTo(stroke[0]!.x + 0.1, stroke[0]!.y + 0.1);
    }
    ctx.stroke();
  }
}

/** Export the canvas to a PNG Blob. Rejects if the browser returns no blob. */
export async function canvasToSignatureBlob(
  canvas: HTMLCanvasElement,
  mimeType: string = SIGNATURE_MIME,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("signature: toBlob returned null"))),
      mimeType,
    );
  });
}

/** Friendly, collision-safe file name; the server appends a UUID to the path. */
export function signatureFileName(now: number = Date.now()): string {
  return `assinatura-${now}.png`;
}
