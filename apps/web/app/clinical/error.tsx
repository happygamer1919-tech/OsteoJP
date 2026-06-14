"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Clinical fichas list error boundary (SPEC-staff-screens §11.2): ErrorState
 *  with retry. /clinical/[id] keeps its own error boundary. */
export default function ClinicalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title={s["clinical.errorTitle"]}
      description={s["clinical.errorHelp"]}
      retryLabel={s["common.retry"]}
      onRetry={reset}
    />
  );
}
