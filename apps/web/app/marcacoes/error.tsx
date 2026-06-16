"use client";

import { ErrorState, GlassPanel } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/** Marcações error boundary (V2-W7, SPEC-v2-agenda §4): ErrorState inside the
 *  glass list container, with retry. */
export default function MarcacoesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="space-y-6">
      <GlassPanel>
        <ErrorState
          title={s["marcacoes.errorTitle"]}
          description={s["marcacoes.errorHelp"]}
          retryLabel={s["common.retry"]}
          onRetry={reset}
        />
      </GlassPanel>
    </main>
  );
}
