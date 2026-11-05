"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import type { ExportOverride } from "@/lib/clinical/report/export-overrides";
import { downloadImportedGroupReportUrlAction, readImportedGroupExportRowsAction } from "./episode-pdf-actions";
import { ExportEditDialog } from "./export-edit-dialog";

/**
 * EXPORT-01: "PDF do episódio" on an IMPORTED group of the Registos tab. The
 * app episode's button (EpisodePdfButton) for the group the tab draws from the
 * imported history: it asks the server action for a short-lived SIGNED URL and
 * navigates the browser to it; while the action runs the button holds still,
 * and a refusal or a failure shows one error line. WHICH groups show it is the
 * page's gate (`importedGroupPdfTarget`); the labels are the page's.
 *
 * RODICA-export-edit-before-download (owner ruling 2026-11-02): a press opens
 * the export dialog (export-edit-dialog.tsx) and nothing downloads until it
 * answers, as "Exportar ficha" does (ficha-export-button.tsx). An imported
 * registo's heading, "Conteúdo importado", is the text the dialog lets the
 * user change or remove.
 */
export function ImportedGroupPdfButton({
  patientId,
  specialty,
  label,
  ariaLabel,
  errorLabel,
}: {
  patientId: string;
  specialty: string;
  label: string;
  ariaLabel: string;
  errorLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [asking, setAsking] = useState(false);

  function onClick() {
    setError(false);
    setAsking(true);
  }

  function exportWith(overrides: ExportOverride[] | null) {
    setAsking(false);
    startTransition(async () => {
      const { url } = overrides
        ? await downloadImportedGroupReportUrlAction(patientId, specialty, overrides)
        : await downloadImportedGroupReportUrlAction(patientId, specialty);
      if (!url) {
        setError(true);
        return;
      }
      // Content-Disposition (set on the signed URL) names the file. Same tab
      // keeps the Registos tab in history.
      window.location.assign(url);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={onClick}
        loading={pending}
        variant="secondary"
        size="sm"
        aria-label={ariaLabel}
        data-testid="record-group-imported-pdf"
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-error" data-testid="record-group-imported-pdf-error">
          {errorLabel}
        </p>
      )}
      {asking && (
        <ExportEditDialog
          onClose={() => setAsking(false)}
          loadRows={() => readImportedGroupExportRowsAction(patientId, specialty)}
          onExport={exportWith}
          testId="record-group-imported-pdf-dialog"
        />
      )}
    </div>
  );
}
