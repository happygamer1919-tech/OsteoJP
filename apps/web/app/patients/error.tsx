"use client";

import { ErrorState, GlassPanel } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Patients list error boundary (SPEC-v2-patients §3): ErrorState inside the glass container, with retry. */
export default function PatientsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <GlassPanel>
        <ErrorState
          title={s["patients.errorTitle"]}
          description={s["patients.errorHelp"]}
          retryLabel={s["common.retry"]}
          onRetry={reset}
        />
      </GlassPanel>
    </main>
  );
}
