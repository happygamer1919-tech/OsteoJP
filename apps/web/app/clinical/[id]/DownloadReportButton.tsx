"use client";
import { useState, useTransition } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { downloadReportUrlAction } from "./actions";

// "Descarregar PDF" trigger for a finalized record. Asks the server action for a
// short-lived SIGNED URL (the PDF is generated server-side via lib/clinical/report
// and never proxied through Next), then navigates the browser to it. The URL is a
// Supabase signed-storage URL: it carries an opaque token + expiry, no fiscal data.
// Rendered only when record_status is locked/signed (gate in page.tsx).

export function DownloadReportButton({ recordId }: { recordId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function onClick() {
    setError(false);
    startTransition(async () => {
      const { url } = await downloadReportUrlAction(recordId);
      if (!url) {
        setError(true);
        return;
      }
      // Trigger the download via the signed URL; Content-Disposition (set on the
      // signed URL) names the file. Same tab keeps the record page in history.
      window.location.assign(url);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={onClick} loading={pending} variant="secondary" size="sm">
        {s["clinical.downloadPdf"]}
      </Button>
      {error && <p role="alert" className="text-xs text-error">{s["clinical.downloadPdfError"]}</p>}
    </div>
  );
}
