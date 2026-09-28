import type { ActionErrorClass } from "./classify-action-error";

/**
 * SKEW-01 - THE ONE WRAPPER EVERY SERVER-ACTION CALL ON /agenda GOES THROUGH.
 *
 * Pure: no React, no Next, no Sentry, no window. Everything it touches is
 * injected, so the unit tests drive it with plain functions (apps/web vitest
 * runs in node with no DOM). The browser instance is in run-action.ts.
 *
 * THE CONTRACT, which every call site relies on:
 *
 *   1. IT NEVER REJECTS. Every outcome, including a bug in this file or in an
 *      injected dependency, resolves to an ActionOutcome. Before SKEW-01, 27 of
 *      the 28 call sites let a rejection escape (un-caught `.then`, try/finally
 *      with no catch, a bare await, or a transition that hands it to the error
 *      boundary).
 *   2. A VALUE IS PASSED THROUGH UNTOUCHED. `{ok:false}` results are values,
 *      not failures, so every call site keeps its own handling of them.
 *   3. A READ that fails on the network is retried ONCE after READ_RETRY_DELAY_MS.
 *      A WRITE is never retried automatically: it may have reached the server.
 *      Both then offer "Tentar novamente", which runs the caller's own `retry`:
 *      the caller's handler, so its validation and the server's conflict check
 *      run again.
 *   4. SKEW (an action id the server does not know) shows one toast and reloads
 *      the page ONCE for the life of this runner - the browser instance is a
 *      module singleton, so once per page - however many calls fail together.
 *      It is reported to Sentry tagged as handled skew, once per page, BEFORE
 *      the reload is asked for, so the flush that precedes the reload has the
 *      event to send.
 *   5. Next's control-flow errors are not treated as failures (see
 *      classify-action-error.ts).
 *   6. Anything else is reported and shown as the generic sentence, never as
 *      Next's English message. It is REPORTED even while a reload is on its
 *      way (a skew, or S6's quiet reload): only the toast is held back then,
 *      because the page is going. The window before that reload (the toast,
 *      the Sentry flush, the lazy import) is exactly when a deploy's own
 *      failures happen, and those are what the owner's skew watch looks for.
 *      A skew is likewise reported once per page, whichever path asked for
 *      the reload first.
 *   7. A NETWORK CLASS IS EARNED, NOT ASSUMED. Only a promise the call RETURNED
 *      can fail on the network: the fetch is asynchronous, so an error the thunk
 *      throws while it is still building its arguments (`() => action(a.b)` with
 *      `a` undefined throws a TypeError synchronously) is a bug in the page and
 *      is reported as one. A network failure while the browser says it is ONLINE
 *      is reported too, once per page and as a warning: that is either the
 *      server being unreachable or a TypeError from Next's own client code
 *      dressed as one, and both are worth one event. Offline, nothing is sent.
 *   8. A WRITE'S TOAST BELONGS TO ITS FORM. With `owner`, the toast is closed
 *      when the form unmounts and its retry never runs after that; a write that
 *      fails after its form is gone still says so, without a retry.
 *   9. A RETRY HANDLER THAT THROWS IS A BUG IN THE PAGE, AND IS REPORTED. It is
 *      not thrown out of the toast's button (the toast must still close), but
 *      it is never silent either: pressing the original button would have
 *      surfaced it as an uncaught error.
 */

export type ActionKind = "read" | "write";

export type ActionFailure = "skew" | "network" | "navigation" | "error";

export type ActionOutcome<T> =
  | { failed: false; value: T }
  | { failed: true; failure: ActionFailure };

/**
 * The component a write belongs to (useActionOwner in use-action-owner.ts):
 * a drawer or dialog that can close while the write's toast is still up.
 */
export interface ActionOwner {
  /** False once the component has unmounted. */
  alive(): boolean;
  /** Runs `fn` when the component unmounts; at once if it already has. */
  onEnd(fn: () => void): void;
}

export interface RunActionOptions {
  /** "read" is idempotent and retried once on a network failure; "write" never is. */
  kind: ActionKind;
  /** The caller's own handler, offered as the toast's "Tentar novamente". */
  retry: () => void;
  /** A write's form: its toast closes with it and its retry dies with it. */
  owner?: ActionOwner;
}

export interface ActionToast {
  tone: "info" | "error";
  message: string;
  action?: { label: string; onClick: () => void };
  /** Called once when the toast leaves the screen, for whatever reason. */
  onClose?: () => void;
}

export type ActionReportKind = "skew" | "network" | "error";

export interface ActionRunnerDeps {
  classify(error: unknown): ActionErrorClass;
  /** Shows a toast. Returns a function that closes it (a no-op once it is gone). */
  notify(toast: ActionToast): (() => void) | void;
  report(error: unknown, handledAs: ActionReportKind): void;
  /** Resolves when the skew toast has had time to paint and Sentry to flush. */
  beforeReload(): Promise<void>;
  reload(): void;
  /** Hands a Next control-flow error back to Next's own handling. */
  rethrowControlFlow(error: unknown): void;
  wait(ms: number): Promise<void>;
  now(): number;
  /** navigator.onLine: false only when the browser KNOWS it is offline. */
  online(): boolean;
  messages: { skew: string; network: string; generic: string; retry: string };
}

export interface ActionRunner {
  runAction<T>(call: () => Promise<T>, options: RunActionOptions): Promise<ActionOutcome<T>>;
  /** The same once-per-page guard, without a toast (SKEW-01 S6's quiet reload). */
  reloadQuietly(): boolean;
}

/** About 600 to 1000 ms, per the card: long enough for a blip, short enough to wait on. */
export const READ_RETRY_DELAY_MS = 800;
/**
 * Read failures of one kind share ONE toast and ONE retry while that toast is
 * on screen. The toast's own close ends the group (ActionToast.onClose); this
 * window is only the backstop for a toast that never reports its close.
 */
export const READ_TOAST_WINDOW_MS = 5_000;

/** `sync`: the thunk threw before it returned a promise, so no request was made. */
type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown; sync: boolean };

async function attempt<T>(call: () => Promise<T>): Promise<Attempt<T>> {
  let pending: Promise<T>;
  try {
    pending = Promise.resolve(call());
  } catch (error) {
    return { ok: false, error, sync: true };
  }
  try {
    return { ok: true, value: await pending };
  } catch (error) {
    return { ok: false, error, sync: false };
  }
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // A failing toast, reporter or reload must not turn into a rejection.
  }
}

export function createActionRunner(deps: ActionRunnerDeps): ActionRunner {
  /** THE once-per-page guard. Set before anything else happens, never cleared. */
  let reloadRequested = false;
  /** One "network failure while online" event per page, never more. */
  let networkReported = false;
  /**
   * One skew event per page. Separate from reloadRequested: S6's quiet reload
   * sets that guard too, and a skew that lands after it is still news.
   */
  let skewReported = false;
  /**
   * One open toast per read-failure kind. Opening an existing appointment fires
   * about eight reads at once; offline, eight identical toasts would each carry
   * one retry. They share one toast, and its button re-runs every read that
   * joined it, in the order they failed. The group ends when its toast closes
   * (timeout, X, pushed out of the stack, or its button), so a read failing
   * after that opens a new toast instead of joining one nobody can see.
   */
  const readGroups = new Map<"network" | "error", { openedAt: number; retries: Array<() => void> }>();

  function classify(error: unknown): ActionErrorClass {
    try {
      return deps.classify(error);
    } catch {
      return "other";
    }
  }

  function isOnline(): boolean {
    try {
      return deps.online() !== false;
    } catch {
      return true;
    }
  }

  function isAlive(owner: ActionOwner | undefined): boolean {
    if (!owner) return true;
    try {
      return owner.alive();
    } catch {
      return false;
    }
  }

  /** Runs the caller's own handler from a toast's button (contract 9). */
  function runRetry(retry: () => void): void {
    try {
      retry();
    } catch (error) {
      safely(() => deps.report(error, "error"));
    }
  }

  function requestReload(withToast: boolean): boolean {
    if (reloadRequested) return false;
    reloadRequested = true;
    if (withToast) safely(() => deps.notify({ tone: "info", message: deps.messages.skew }));
    let before: Promise<void>;
    try {
      before = deps.beforeReload();
    } catch {
      before = Promise.resolve();
    }
    void before.then(
      () => safely(() => deps.reload()),
      () => safely(() => deps.reload()),
    );
    return true;
  }

  function offerWriteRetry(message: string, options: RunActionOptions): void {
    const { owner, retry } = options;
    if (!isAlive(owner)) {
      // The form is gone: the failure is still news, but there is nothing to
      // retry, and its handler must not run against an unmounted form.
      safely(() => deps.notify({ tone: "error", message }));
      return;
    }
    // A write keeps its own toast and its own retry: it is one press of one
    // button, and merging it with another would re-send something twice.
    let close: (() => void) | void = undefined;
    safely(() => {
      close = deps.notify({
        tone: "error",
        message,
        action: {
          label: deps.messages.retry,
          onClick: () => {
            if (isAlive(owner)) runRetry(retry);
          },
        },
      });
    });
    if (owner) {
      safely(() =>
        owner.onEnd(() => {
          if (typeof close === "function") safely(close);
        }),
      );
    }
  }

  function offerReadRetry(failure: "network" | "error", message: string, retry: () => void): void {
    const open = readGroups.get(failure);
    if (open && deps.now() - open.openedAt < READ_TOAST_WINDOW_MS) {
      open.retries.push(retry);
      return;
    }
    const group = { openedAt: deps.now(), retries: [retry] };
    readGroups.set(failure, group);
    const end = () => {
      if (readGroups.get(failure) === group) readGroups.delete(failure);
    };
    safely(() =>
      deps.notify({
        tone: "error",
        message,
        action: {
          label: deps.messages.retry,
          onClick: () => {
            end();
            for (const r of group.retries) runRetry(r);
          },
        },
        onClose: end,
      }),
    );
  }

  function offerRetry(failure: "network" | "error", options: RunActionOptions): void {
    const message = failure === "network" ? deps.messages.network : deps.messages.generic;
    if (options.kind === "write") offerWriteRetry(message, options);
    else offerReadRetry(failure, message, options.retry);
  }

  function fail(error: unknown, cls: ActionErrorClass, options: RunActionOptions): ActionFailure {
    switch (cls) {
      case "handled-redirect":
        // Next is already navigating (classify-action-error.ts). Nothing to show.
        return "navigation";
      case "control-flow":
        safely(() => deps.rethrowControlFlow(error));
        return "navigation";
      case "skew":
        if (!skewReported) {
          // Reported FIRST: the reload's beforeReload() flushes Sentry, and a
          // flush that runs before the capture has nothing to send. Once per
          // page, even when S6's quiet reload got there first (contract 6).
          skewReported = true;
          safely(() => deps.report(error, "skew"));
        }
        requestReload(true);
        return "skew";
      case "network":
        // A reload is already on its way: the page is going, say nothing more.
        // Not reported either, unlike an "other" error: a request cut off by
        // the page leaving rejects as the same TypeError, so a report here
        // would record the reload itself, not an outage.
        if (!reloadRequested) {
          if (!networkReported && isOnline()) {
            networkReported = true;
            safely(() => deps.report(error, "network"));
          }
          offerRetry("network", options);
        }
        return "network";
      default:
        // ALWAYS reported (contract 6); only the toast waits on the reload.
        safely(() => deps.report(error, "error"));
        if (!reloadRequested) offerRetry("error", options);
        return "error";
    }
  }

  async function runAction<T>(
    call: () => Promise<T>,
    options: RunActionOptions,
  ): Promise<ActionOutcome<T>> {
    try {
      let result = await attempt(call);
      if (result.ok) return { failed: false, value: result.value };
      let cls = classifyAttempt(result);
      if (cls === "network" && options.kind === "read" && !reloadRequested) {
        await deps.wait(READ_RETRY_DELAY_MS);
        result = await attempt(call);
        if (result.ok) return { failed: false, value: result.value };
        cls = classifyAttempt(result);
      }
      return { failed: true, failure: fail(result.error, cls, options) };
    } catch {
      // Unreachable by construction; here so the contract holds even if not.
      return { failed: true, failure: "error" };
    }
  }

  function classifyAttempt(result: { error: unknown; sync: boolean }): ActionErrorClass {
    const cls = classify(result.error);
    // Contract 7: a synchronous throw made no request, so it cannot be one.
    return result.sync && cls === "network" ? "other" : cls;
  }

  return {
    runAction,
    reloadQuietly: () => requestReload(false),
  };
}
