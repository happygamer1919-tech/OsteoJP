"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/**
 * SAT-01 (copy texts 56 and 57): the list could not be loaded. The sentence
 * says in words that this is not an empty list, because a page that fails and
 * shows nothing reads as "nobody answered".
 */
export default function AvaliacoesDeSatisfacaoError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title={s["surveyList.errorTitle"]}
        description={s["surveyList.errorBody"]}
        retryLabel={s["common.retry"]}
        onRetry={reset}
      />
    </div>
  );
}
