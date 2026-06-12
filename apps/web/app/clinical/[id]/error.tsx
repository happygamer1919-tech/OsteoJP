"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Clinical record editor error boundary (SPEC §7): ErrorState, full column. */
export default function ClinicalRecordError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <ErrorState
        title={s["clinical.error"]}
        description={s["dashboard.error.help"]}
        retryLabel={s["common.retry"]}
        onRetry={reset}
      />
    </main>
  );
}
