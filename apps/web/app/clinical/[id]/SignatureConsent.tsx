"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@osteojp/ui";
import { Check, X } from "lucide-react";
import { s, locale } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CONSENT_ITEM_KEYS,
  CONSENT_ITEM_STRINGS,
  type ConsentDecision,
  type ConsentItemKey,
  type ConsentState,
} from "@/lib/clinical/consent";
import {
  SIGNATURE_MIME,
  canvasToSignatureBlob,
  drawStrokes,
  hasSignature,
  signatureFileName,
  toCanvasPoint,
  type SignatureStroke,
} from "@/lib/clinical/signature-capture";
import {
  confirmSignatureAction,
  createSignatureUploadUrlAction,
  generateRgpdFormUrlAction,
} from "./actions";

// Must match storage.ts ATTACHMENTS_BUCKET (that module is server-only).
const BUCKET = "clinical-attachments";
const CANVAS_W = 600;
const CANVAS_H = 200;

type UploadState = "idle" | "uploading" | "saved" | "error";

/**
 * Ficha Médica signature + consent section (SPEC-ficha-medica.md sec 5.14 / 7).
 *
 * Three parts:
 *  1. On-screen patient SIGNATURE (canvas capture) → PNG blob → uploaded via the
 *     patient-documents signed-URL path (createSignatureUploadUrl → direct PUT →
 *     confirmSignature) so it lands in the patient's Documentos. Signed URL only,
 *     never public, never proxied through Next (CLAUDE.md rule 8).
 *  2. GERAR PDF: an A4 RGPD print-and-sign form (clinic logo + print-branding),
 *     server-generated, handed back as a 60s signed URL.
 *  3. CONSINTO block: three individually-confirmable items (RGPD, SMS, data
 *     handling), each with an EXPLICIT check / X state (never a bare unchecked
 *     box). The state persists in the record's `data` (migration-free) — this
 *     component reports changes up to RecordForm which folds them into `data`.
 *
 * Finalized (locked/signed) records render read-only: no drawing, no toggles,
 * the persisted consent state shown as static check / X (rule 4).
 */
export function SignatureConsent({
  patientId,
  readOnly,
  recordId,
  consent,
  onSetDecision,
}: {
  patientId: string;
  readOnly: boolean;
  recordId: string;
  consent: ConsentState;
  /** Set ONE item's decision. RecordForm merges it into `data` from fresh state
   *  inside its functional updater, so concurrent toggles never clobber a
   *  sibling (stale-snapshot safe). */
  onSetDecision: (key: ConsentItemKey, decision: ConsentDecision) => void;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  // Redraw whenever the canvas mounts (read-only records have no canvas).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) drawStrokes(ctx, strokesRef.current, CANVAS_W, CANVAS_H);
  }, []);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) drawStrokes(ctx, strokesRef.current, CANVAS_W, CANVAS_H);
    setEmpty(!hasSignature(strokesRef.current));
  }

  function pointFrom(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return toCanvasPoint(e.clientX, e.clientY, rect, CANVAS_W, CANVAS_H);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    e.preventDefault();
    drawingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    strokesRef.current.push([pointFrom(e)]);
    redraw();
  }
  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly || !drawingRef.current) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (stroke) stroke.push(pointFrom(e));
    redraw();
  }
  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released — ignore */
    }
    redraw();
  }

  function clearSignature() {
    strokesRef.current = [];
    setUploadState("idle");
    redraw();
  }

  // Upload the signature PNG through the patient-documents signed-URL path.
  async function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas || empty) return;
    setUploadState("uploading");
    let blob: Blob;
    try {
      blob = await canvasToSignatureBlob(canvas, SIGNATURE_MIME);
    } catch {
      setUploadState("error");
      return;
    }
    const fileName = signatureFileName();
    const slot = await createSignatureUploadUrlAction(patientId, fileName);
    if (!slot.ok) {
      setUploadState("error");
      return;
    }
    const up = await createSupabaseBrowserClient()
      .storage.from(BUCKET)
      .uploadToSignedUrl(slot.path, slot.token, blob);
    if (up.error) {
      setUploadState("error");
      return;
    }
    const res = await confirmSignatureAction({
      patientId,
      path: slot.path,
      fileName,
      mimeType: SIGNATURE_MIME,
      sizeBytes: blob.size,
    });
    if (!res.ok) {
      setUploadState("error");
      return;
    }
    setUploadState("saved");
    router.refresh();
  }

  async function generatePdf() {
    setPdfError(false);
    setPdfPending(true);
    const { url } = await generateRgpdFormUrlAction(recordId);
    setPdfPending(false);
    if (!url) {
      setPdfError(true);
      return;
    }
    window.location.assign(url);
  }

  function setDecision(key: ConsentItemKey, decision: ConsentDecision) {
    onSetDecision(key, decision);
  }

  return (
    <section
      id="signature-consent"
      aria-label={s["clinical.signatureConsentHeading"]}
      className="scroll-mt-24 flex flex-col gap-6 border-t border-v2-border pt-6"
    >
      <h2 className="text-lg font-semibold text-text-primary">
        {s["clinical.signatureConsentHeading"]}
      </h2>

      {/* 1. On-screen patient signature. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {s["clinical.signatureHeading"]}
        </h3>
        <p className="text-xs text-text-secondary">{s["clinical.signatureHelp"]}</p>

        {readOnly ? (
          <p className="text-sm text-text-secondary">{s["clinical.signatureReadOnly"]}</p>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              role="img"
              aria-label={s["clinical.signatureHeading"]}
              data-testid="signature-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="w-full max-w-xl touch-none rounded-v2 border border-v2-border bg-v2-surface"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={saveSignature}
                loading={uploadState === "uploading"}
                disabled={empty || uploadState === "uploading"}
              >
                {s["clinical.signatureSave"]}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearSignature}
                disabled={empty || uploadState === "uploading"}
              >
                {s["clinical.signatureClear"]}
              </Button>
              {uploadState === "saved" && (
                <span role="status" className="text-xs text-success">
                  {s["clinical.signatureSaved"]}
                </span>
              )}
              {uploadState === "error" && (
                <span role="alert" className="text-xs text-error">
                  {s["clinical.signatureError"]}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. Gerar PDF (A4 RGPD print-and-sign form). */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{s["clinical.rgpdHeading"]}</h3>
        <p className="text-xs text-text-secondary">{s["clinical.rgpdHelp"]}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={generatePdf}
            loading={pdfPending}
          >
            {s["clinical.rgpdGenerate"]}
          </Button>
          {pdfError && (
            <span role="alert" className="text-xs text-error">
              {s["clinical.rgpdError"]}
            </span>
          )}
        </div>
      </div>

      {/* 3. Consinto block — three items, explicit check / X each. */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{s["clinical.consentHeading"]}</h3>
        <p className="text-xs text-text-secondary">{s["clinical.consentPendingNotice"]}</p>
        <ul className="flex flex-col gap-4" data-locale={locale}>
          {CONSENT_ITEM_KEYS.map((key) => {
            const item = CONSENT_ITEM_STRINGS[key];
            const decision = consent[key];
            return (
              <li
                key={key}
                data-consent-item={key}
                className="flex flex-col gap-2 rounded-v2 border border-v2-border p-3"
              >
                <span className="text-sm font-medium text-text-primary">{s[item.label]}</span>
                <span className="text-xs text-text-secondary">{s[item.body]}</span>
                <ConsentToggle
                  itemKey={key}
                  decision={decision}
                  readOnly={readOnly}
                  onSet={(d) => setDecision(key, d)}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * The explicit check / X control for one consent item. NEVER a bare unchecked
 * box: the current decision is always shown affirmatively — a green check
 * (Consinto), a red X (Não consinto), or an explicit "por decidir" chip
 * (unset). In a draft, two toggle buttons set the decision; read-only records
 * show the persisted decision as a static badge.
 */
function ConsentToggle({
  itemKey,
  decision,
  readOnly,
  onSet,
}: {
  itemKey: ConsentItemKey;
  decision: ConsentDecision;
  readOnly: boolean;
  onSet: (d: ConsentDecision) => void;
}) {
  const state = (
    <span
      data-consent-state={decision}
      className={
        decision === "granted"
          ? "inline-flex items-center gap-1 rounded-full bg-v2-green-100 px-2 py-0.5 text-xs font-medium text-v2-green-800"
          : decision === "denied"
            ? "inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning-700"
            : "inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary"
      }
    >
      {decision === "granted" ? (
        <>
          <Check size={14} strokeWidth={2.25} aria-hidden="true" />
          {s["clinical.consentGranted"]}
        </>
      ) : decision === "denied" ? (
        <>
          <X size={14} strokeWidth={2.25} aria-hidden="true" />
          {s["clinical.consentDenied"]}
        </>
      ) : (
        s["clinical.consentUnset"]
      )}
    </span>
  );

  if (readOnly) {
    return <div className="flex items-center gap-2">{state}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={decision === "granted" ? "primary" : "ghost"}
        aria-pressed={decision === "granted"}
        data-consent-action={`${itemKey}:grant`}
        onClick={() => onSet("granted")}
      >
        <Check size={14} strokeWidth={2.25} aria-hidden="true" className="mr-1" />
        {s["clinical.consentGrant"]}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={decision === "denied" ? "destructive" : "ghost"}
        aria-pressed={decision === "denied"}
        data-consent-action={`${itemKey}:deny`}
        onClick={() => onSet("denied")}
      >
        <X size={14} strokeWidth={2.25} aria-hidden="true" className="mr-1" />
        {s["clinical.consentDeny"]}
      </Button>
      {state}
    </div>
  );
}
