"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Patients list error boundary (SPEC-staff-screens §11.1): ErrorState + retry. */
export default function PatientsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <ErrorState
        title={s["patients.errorTitle"]}
        description={s["patients.errorHelp"]}
        retryLabel={s["common.retry"]}
        onRetry={reset}
      />
    </main>
  );
}
