"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import { downloadImportedGroupReportUrlAction } from "./episode-pdf-actions";

/**
 * EXPORT-01: "PDF do episódio" on an IMPORTED group of the Registos tab. The
 * app episode's button (EpisodePdfButton) for the group the tab draws from the
 * imported history: it asks the server action for a short-lived SIGNED URL and
 * navigates the browser to it; while the action runs the button holds still,
 * and a refusal or a failure shows one error line. WHICH groups show it is the
 * page's gate (`importedGroupPdfTarget`); the labels are the page's.
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

  function onClick() {
    setError(false);
    startTransition(async () => {
      const { url } = await downloadImportedGroupReportUrlAction(patientId, specialty);
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
    </div>
  );
}
