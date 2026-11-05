"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import type { ExportOverride } from "@/lib/clinical/report/export-overrides";
import { downloadEpisodeReportUrlAction, readEpisodeExportRowsAction } from "./episode-pdf-actions";
import { ExportEditDialog } from "./export-edit-dialog";

/**
 * EPI-01b, piece 3: "PDF do episódio" on an episode group of the Registos tab.
 * The per-record "Transferir PDF" button's behaviour (DownloadReportButton):
 * it asks the server action for a short-lived SIGNED URL (the PDF is generated
 * server-side and never proxied through Next), then navigates the browser to
 * it; while the action runs the button holds still, and a refusal or a failure
 * shows one error line. WHICH groups show it is the page's gate
 * (`episodeExportCount`); the labels are the page's, as for "+ Avaliação".
 *
 * RODICA-export-edit-before-download (owner ruling 2026-11-02): a press opens
 * the export dialog (export-edit-dialog.tsx) and nothing downloads until it
 * answers, as "Exportar ficha" does (ficha-export-button.tsx).
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
  const [asking, setAsking] = useState(false);

  function onClick() {
    setError(false);
    setAsking(true);
  }

  function exportWith(overrides: ExportOverride[] | null) {
    setAsking(false);
    startTransition(async () => {
      const { url } = overrides
        ? await downloadEpisodeReportUrlAction(patientId, episodeId, overrides)
        : await downloadEpisodeReportUrlAction(patientId, episodeId);
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
      {asking && (
        <ExportEditDialog
          onClose={() => setAsking(false)}
          loadRows={() => readEpisodeExportRowsAction(patientId, episodeId)}
          onExport={exportWith}
          testId="record-group-episode-pdf-dialog"
        />
      )}
    </div>
  );
}
