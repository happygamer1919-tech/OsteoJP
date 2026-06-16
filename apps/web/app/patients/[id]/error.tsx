"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Patient profile error boundary: ErrorState with retry. */
export default function PatientProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <ErrorState
        title={s["dashboard.error.title"]}
        description={s["dashboard.error.help"]}
        retryLabel={s["common.retry"]}
        onRetry={reset}
      />
    </main>
  );
}
