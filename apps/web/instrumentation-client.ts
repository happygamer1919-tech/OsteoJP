import * as Sentry from "@sentry/nextjs";

import { clientSentryDsn } from "./lib/observability/sentry-dsn";
import { isForeignFrameEvent } from "./lib/observability/extension-noise";
import { scrubLinkCodesIn } from "./lib/observability/link-codes";
import { scrubQueryErrorsIn } from "./lib/observability/query-errors";

Sentry.init({
  dsn: clientSentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Explicit, not inherited. It already defaults to false; pinning it means a
  // future SDK default change cannot silently flip PII capture on. On the
  // browser SDK this is what keeps request headers, cookies and the user IP
  // off the event. CLAUDE.md rule 7.
  sendDefaultPii: false,

  /**
   * OBS-02 - browser-extension noise, and it is a CLIENT-ONLY filter.
   *
   * `denyUrls` matches on the event's culprit URL and catches the common
   * injected-script schemes outright. It is the cheap half.
   */
  denyUrls: [
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-(web-)?extension:\/\//i,
    /^extensions\//i,
  ],

  /**
   * The half that actually does the work. An extension injected as a plain
   * script into the page (executors/200.js, the observed example) has an
   * ordinary http(s) URL, so `denyUrls` cannot see it. `isForeignFrameEvent`
   * decides on the STACK instead: an event with frames, none of which is under
   * /_next/, is not about our code.
   *
   * IT FAILS OPEN BY CONSTRUCTION. Every case the predicate cannot decide -
   * no exception values, no stacktrace, no frames, or any frame of ours
   * anywhere in the stack - returns the event unchanged. Read the file: the
   * reasoning for each is written there, and the direction is deliberate.
   * Losing noise costs an unread issue; losing a real error costs the channel.
   *
   * OBS-07 is composed here and not assigned beside it: `beforeSend` takes one
   * function. The noise filter decides first, on the frames as they arrived;
   * what is kept then leaves with no one-time link code in it.
   *
   * OBS-09 sits between the two: what is kept loses the parameters of any
   * failed query first. In production Next sends a browser no server error's
   * message, only its digest; in development it does, and a page may still
   * show or log one. See lib/observability/query-errors.ts.
   */
  beforeSend(event, hint) {
    return isForeignFrameEvent(event) ? null : scrubLinkCodesIn(scrubQueryErrorsIn(event, hint));
  },

  // OBS-07: the browser is where the code is most exposed. The page's own
  // address IS /c/<code> or /s/<code>, so the event's url, every navigation
  // and fetch breadcrumb, the pageload transaction's name and the span of the
  // form's POST all carry it. See lib/observability/link-codes.ts.
  beforeSendTransaction: (event) => scrubLinkCodesIn(scrubQueryErrorsIn(event)),
  beforeSendSpan: (span) => scrubLinkCodesIn(scrubQueryErrorsIn(span)),
  beforeBreadcrumb: (breadcrumb, hint) => scrubLinkCodesIn(scrubQueryErrorsIn(breadcrumb, hint)),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
