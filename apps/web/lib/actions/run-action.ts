import * as Sentry from "@sentry/nextjs";

import { s } from "@/lib/i18n";

import { classifyActionError } from "./classify-action-error";
import {
  createActionRunner,
  type ActionOutcome,
  type RunActionOptions,
} from "./run-action-core";
import { notifyToast } from "./toast-bridge";

export type {
  ActionFailure,
  ActionKind,
  ActionOutcome,
  ActionOwner,
  RunActionOptions,
} from "./run-action-core";

/**
 * SKEW-01 - the browser instance of the server-action wrapper. ONE per page:
 * this module is evaluated once per page load, so the reload guard inside the
 * runner below is the module-level, once-per-page guard the card asks for.
 *
 * Every call site on /agenda, and in the shared components it renders, calls
 * its action as
 *
 *     runAction(() => someAction(args), { kind: "read" | "write", retry, owner? })
 *
 * and nothing else. apps/web/lib/actions/call-sites.test.ts reads those files
 * and fails, naming the file and line, on any other call of an imported action.
 */

/** Long enough for the "Nova versão disponível" toast to be read. */
const SKEW_TOAST_MS = 1_200;
/** Sentry's own flush cap, so a slow ingest never holds the reload hostage. */
const SENTRY_FLUSH_MS = 2_000;

/**
 * STATIC, not `import("@sentry/nextjs")`. A real skew is an old page talking to
 * a newer deployment, which is exactly when the old deployment's chunks can
 * stop being served; a lazy import that needed a chunk fetch then would fail,
 * and its catch would drop the one event the owner's three-day skew watch
 * counts. The browser already loads this module on every page
 * (instrumentation-client.ts, app/global-error.tsx), so importing it here costs
 * nothing and leaves no fetch between the failure and its report.
 */
const runner = createActionRunner({
  classify: classifyActionError,
  notify: notifyToast,
  report(error, handledAs) {
    try {
      if (handledAs === "skew") {
        // SKEW-01: reported AND handled. The owner watches this tag for three
        // days before any filter is written; this PR adds no beforeSend and
        // no ignoreErrors for it.
        Sentry.captureException(error, {
          tags: { server_action: "skew-handled", handled_as: "skew" },
        });
      } else if (handledAs === "network") {
        // Once per page, and only while the browser says it is online: the
        // server was unreachable, or Next's own client code threw a TypeError
        // that reads as a network failure. The user saw the network toast.
        Sentry.captureException(error, {
          level: "warning",
          tags: { server_action: "network-while-online", handled_as: "network" },
          fingerprint: ["server-action-network-while-online"],
        });
      } else {
        Sentry.captureException(error, { tags: { server_action: "failed" } });
      }
    } catch {
      // Reporting must never turn a handled failure into a thrown one.
    }
  },
  async beforeReload() {
    // Every capture above was handed to Sentry synchronously, before the reload
    // was asked for, and flush() waits for events still being processed, so the
    // flush cannot overtake a capture.
    const flush = Promise.resolve()
      .then(() => Sentry.flush(SENTRY_FLUSH_MS))
      .catch(() => false);
    await Promise.all([flush, new Promise((resolve) => setTimeout(resolve, SKEW_TOAST_MS))]);
  },
  reload() {
    window.location.reload();
  },
  rethrowControlFlow(error) {
    // Raised as an UNCAUGHT error on a fresh task, not as a rejection: Next's
    // app router listens for window "error" as well as "unhandledrejection" and
    // performs a redirect it finds there (next/dist/client/components/
    // app-router.js:181-197). Anything else surfaces exactly as an uncaught
    // error does today.
    setTimeout(() => {
      throw error;
    }, 0);
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine),
  messages: {
    skew: s["actions.skewReload"],
    network: s["actions.networkError"],
    generic: s["errors.generic"],
    retry: s["common.retry"],
  },
});

/** Runs one server-action call. Never rejects; see run-action-core.ts. */
export function runAction<T>(
  call: () => Promise<T>,
  options: RunActionOptions,
): Promise<ActionOutcome<T>> {
  return runner.runAction(call, options);
}

/**
 * SKEW-01 S6: reload without a toast, under the SAME once-per-page guard the
 * skew toast uses, so a version mismatch and a skewed action can never reload
 * the page twice between them. Returns false when a reload was already asked for.
 */
export function reloadQuietly(): boolean {
  return runner.reloadQuietly();
}
