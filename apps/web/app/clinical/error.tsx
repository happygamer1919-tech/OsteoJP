"use client";

import { ErrorState, GlassPanel } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Clinical fichas list error boundary (SPEC-v2-fichas §3): ErrorState inside
 *  the glass container, with retry. /clinical/[id] keeps its own error boundary. */
export default function ClinicalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <GlassPanel>
      <ErrorState
        title={s["clinical.errorTitle"]}
        description={s["clinical.errorHelp"]}
        retryLabel={s["common.retry"]}
        onRetry={reset}
      />
    </GlassPanel>
  );
}
