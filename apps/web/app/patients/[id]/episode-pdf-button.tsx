"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import { downloadEpisodeReportUrlAction } from "./episode-pdf-actions";

/**
 * EPI-01b, piece 3: "PDF do episódio" on an episode group of the Registos tab.
 * The per-record "Transferir PDF" button's behaviour (DownloadReportButton):
 * it asks the server action for a short-lived SIGNED URL (the PDF is generated
 * server-side and never proxied through Next), then navigates the browser to
 * it; while the action runs the button holds still, and a refusal or a failure
 * shows one error line. WHICH groups show it is the page's gate
 * (`episodeExportCount`); the labels are the page's, as for "+ Avaliação".
 */
export function EpisodePdfButton({
  patientId,
  episodeId,
  label,
  ariaLabel,
  errorLabel,
}: {
  patientId: string;
  episodeId: string;
  label: string;
  ariaLabel: string;
  errorLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function onClick() {
    setError(false);
    startTransition(async () => {
      const { url } = await downloadEpisodeReportUrlAction(patientId, episodeId);
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
        data-testid="record-group-episode-pdf"
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-error" data-testid="record-group-episode-pdf-error">
          {errorLabel}
        </p>
      )}
    </div>
  );
}
