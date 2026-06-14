"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Review queue error boundary (SPEC-staff-screens §11.3): ErrorState + retry. */
export default function ReviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title={s["review.errorTitle"]}
      description={s["review.errorHelp"]}
      retryLabel={s["common.retry"]}
      onRetry={reset}
    />
  );
}
