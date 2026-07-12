import "server-only";

// W5-31 — Declaração de Presença tenant configuration, read from the
// tenants.settings JSONB `declaracao` namespace (no schema change). Both fields
// are OVERRIDES with sane defaults so the declaration renders out of the box for
// the single OsteoJP tenant; a tenant may override the responsável name or turn
// the signature/stamp off. The PDF RENDERER (declaracao-pdf.ts) never contains
// the responsável literal — it draws whatever this layer resolves, so the name is
// configuration, not a hardcoded string in the PDF code path.

/** The clinic's default responsável (owner-confirmed, Fisiozero template). A
 *  tenant may override it via settings.declaracao.responsavel. Lives here (the
 *  config layer), never in the PDF renderer. */
export const DEFAULT_RESPONSAVEL = "Dr. João Paulo Santos Silva";

export type DeclaracaoSettings = {
  /** Name printed on the "(responsável)" line under the signature/stamp. */
  responsavel: string;
  /** Whether the owner-supplied signature + carimbo image is embedded. When
   *  false, the PDF leaves blank vertical space for a physical stamp. */
  signatureStamp: boolean;
};

/** Resolve the Declaração settings from a tenant's `settings` JSONB, applying the
 *  sane defaults. Tolerant of missing/malformed input (fail-safe to defaults). */
export function readDeclaracaoSettings(settings: unknown): DeclaracaoSettings {
  const root = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const d =
    root.declaracao && typeof root.declaracao === "object"
      ? (root.declaracao as Record<string, unknown>)
      : {};
  const responsavel =
    typeof d.responsavel === "string" && d.responsavel.trim().length > 0
      ? d.responsavel.trim()
      : DEFAULT_RESPONSAVEL;
  // Default ON (the clinic's own carimbo); an explicit `false` disables it.
  const signatureStamp = d.signatureStamp === false ? false : true;
  return { responsavel, signatureStamp };
}
