"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import type { ExportOverride } from "@/lib/clinical/report/export-overrides";
import { ExportEditDialog } from "./export-edit-dialog";
import { downloadPatientFichaUrlAction, readPatientFichaExportRowsAction } from "./ficha-pdf-actions";

/**
 * EXPORT-01: "Exportar ficha" on the Registos tab: one PDF of the whole
 * patient. A group's "PDF do episódio" button (EpisodePdfButton) for the whole
 * tab: it asks the server action for a short-lived SIGNED URL and navigates
 * the browser to it; while the action runs the button holds still, and a
 * refusal or a failure shows one error line. WHETHER the tab shows it is the
 * page's gate (`fichaExportTarget`); the labels are the page's.
 *
 * RODICA-export-edit-before-download (owner ruling 2026-11-02): a press opens
 * the export dialog (export-edit-dialog.tsx) and nothing downloads until it
 * answers. "Manter os dados da consulta" asks the action exactly as before;
 * "Alterar" hands it the date, hour and heading of every registo for this
 * file. Closing the dialog exports nothing.
 */
export function FichaExportButton({
  patientId,
  label,
  errorLabel,
}: {
  patientId: string;
  label: string;
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
        ? await downloadPatientFichaUrlAction(patientId, overrides)
        : await downloadPatientFichaUrlAction(patientId);
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
      <Button type="button" onClick={onClick} loading={pending} variant="secondary" data-testid="ficha-export">
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-error" data-testid="ficha-export-error">
          {errorLabel}
        </p>
      )}
      {asking && (
        <ExportEditDialog
          onClose={() => setAsking(false)}
          loadRows={() => readPatientFichaExportRowsAction(patientId)}
          onExport={exportWith}
          testId="ficha-export-dialog"
        />
      )}
    </div>
  );
}
