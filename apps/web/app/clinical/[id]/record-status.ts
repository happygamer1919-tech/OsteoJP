// Pure view helpers for the clinical-record detail page. No `server-only`, no DB:
// kept node-testable so the header↔status coupling and the finalized-only
// download gate can't silently drift (BUG-15 regression guard + PDF visibility).

import { s } from "@/lib/i18n";
import type { RecordStatus } from "@/lib/clinical/records";
// Read-only call into lib/clinical/report: reuse the SAME finalized-only gate the
// PDF engine enforces, so the button never appears for a record the engine would
// reject. Imported from the pure submodule (report-model has no `server-only`) to
// stay node-testable; the index re-exports server-only orchestration.
import { isPrintable } from "@/lib/clinical/report/report-model";

/**
 * Live record_status → its localized header label. The header subtitle and the
 * read-only banner both derive from `record.status` (single source of truth), so
 * once a record is signed the header reads "Assinada", never a stale "Rascunho".
 */
export function statusLabel(status: RecordStatus): string {
  return status === "signed"
    ? s["clinical.statusSigned"]
    : status === "locked"
      ? s["clinical.statusLocked"]
      : s["clinical.statusDraft"];
}

/**
 * Whether the "Descarregar PDF" button shows: finalized records only
 * (locked / signed). Draft is hidden; an under-AI-review record is a draft
 * (record_status never finalizes from AI ingestion), so it is hidden too — and
 * the engine re-checks the full gate server-side (defense in depth).
 */
export function canDownloadReport(status: RecordStatus): boolean {
  return isPrintable({ status, aiReviewState: null });
}
