"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Dashboard error boundary (SPEC §3): ErrorState with a retry that re-renders. */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
