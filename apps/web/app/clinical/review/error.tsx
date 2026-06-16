"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Review queue error boundary (SPEC-v2-review §4): ErrorState inside the glass
 * container, with retry. */
export default function ReviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="glass-card p-6">
      <ErrorState
        title={s["review.errorTitle"]}
        description={s["review.errorHelp"]}
        retryLabel={s["common.retry"]}
        onRetry={reset}
      />
    </div>
  );
}
