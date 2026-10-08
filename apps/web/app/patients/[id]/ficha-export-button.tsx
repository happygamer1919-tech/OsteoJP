"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import { downloadPatientFichaUrlAction } from "./ficha-pdf-actions";

/**
 * EXPORT-01: "Exportar ficha" on the Registos tab: one PDF of the whole
 * patient. A group's "PDF do episódio" button (EpisodePdfButton) for the whole
 * tab: it asks the server action for a short-lived SIGNED URL and navigates
 * the browser to it; while the action runs the button holds still, and a
 * refusal or a failure shows one error line. WHETHER the tab shows it is the
 * page's gate (`fichaExportTarget`); the labels are the page's.
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

  function onClick() {
    setError(false);
    startTransition(async () => {
      const { url } = await downloadPatientFichaUrlAction(patientId);
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
    </div>
  );
}
