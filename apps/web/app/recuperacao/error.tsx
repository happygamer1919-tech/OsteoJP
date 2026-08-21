"use client";

import { ErrorState } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/**
 * Route-level error boundary for /recuperacao. INC 2026-08-21.
 *
 * ==========================================================================
 * IT DID NOT EXIST, AND THAT IS WHY THE OWNER SAW A RAW NEXT ERROR PAGE
 * ==========================================================================
 * A Server Component that throws with no boundary in its own directory falls
 * past every route boundary to the framework default: an English page with a
 * digest and nothing else. The person reading it cannot tell a broken query from
 * a signed-out session, and there is nothing to do but leave.
 *
 * The portal learned this once already - `apps/portal/app/portal/dashboard/`
 * has carried one for months, and #993 wired the portal's ROOT one for the same
 * reason. The staff platform's newest page shipped without.
 *
 * WHAT IT DOES NOT DO: hide the failure. It reports it in Portuguese, offers a
 * retry, and gives the two clinic numbers so somebody can still be reached while
 * the page is down. A boundary that rendered an empty list instead would be the
 * §1.3 defect in its purest form - "nobody to contact" and "this page is broken"
 * are the two screens that must never look alike.
 */
export default function RecuperacaoError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title={s["followup.errorTitle"]}
      description={s["followup.errorDescription"]}
      retryLabel={s["common.retry"]}
      onRetry={reset}
    />
  );
}
