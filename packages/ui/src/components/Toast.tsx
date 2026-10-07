"use client";

import { Check, CircleAlert, Info, X } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  appendToStack,
  createDismissTimer,
  createToastLifecycle,
  createToasterRegistry,
  pickRegionParent,
  type Toaster,
} from "./toast-store";

/**
 * Toast — SPEC-foundation §4.9.
 *
 * Transient bottom-right (bottom-above-nav on mobile) notifications. surface bg,
 * border, radius lg, shadow lg; a 20px semantic icon, body-sm message, optional
 * single ghost action, and an X dismiss. Auto-dismiss after 5s, paused while a
 * toast is hovered or focused. The viewport is one aria-live="polite" region;
 * error toasts carry role="alert" so they announce assertively. At most 3 stack
 * (the oldest is dropped). Enter/exit slide+fade at --duration-base.
 *
 * Wrap the app in <ToastProvider> and call `useToast()` to push toasts. Code
 * that is not a component calls `showToast()` instead (see below).
 *
 * @example
 * const toast = useToast();
 * toast({ tone: "success", message: t("patient.saved") });
 * toast({ tone: "error", message: t("save.failed"),
 *   action: { label: t("common.retry"), onClick: retry } });
 */
export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: ReactNode;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  message: ReactNode;
  action?: ToastAction;
  /** Auto-dismiss delay in ms (default 5000). */
  duration?: number;
  /**
   * Called ONCE when the toast leaves, for whatever reason: its timeout, its X,
   * its action, being pushed out of the stack by a newer toast, being closed
   * by the function `showToast` returned, or its provider unmounting.
   */
  onClose?: () => void;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

const DEFAULT_DURATION = 5000;

const TONE_ICON = { success: Check, error: CircleAlert, info: Info } as const;
const TONE_COLOR: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-error",
  info: "text-info",
};

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

export function useToast(): (options: ToastOptions) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>.");
  return ctx;
}

/**
 * SKEW-01 - EVERY MOUNTED PROVIDER, MOST RECENTLY MOUNTED LAST.
 *
 * `useToast` throws without a provider above it, and it is a hook, so code that
 * is not a component (the server-action wrapper in apps/web) cannot use it at
 * all. `showToast` is the non-throwing accessor for that code: it pushes into
 * the provider mounted last and returns a function that closes that toast, or
 * `null` when no provider is mounted, so the caller decides what a page with no
 * provider gets. The rules are in toast-store.ts and proven by its test.
 */
const registry = createToasterRegistry<ToastOptions>();

export function showToast(options: ToastOptions): (() => void) | null {
  return registry.show(options);
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

/**
 * SKEW-01 - THE REGION LIVES IN THE TOP LAYER, INSIDE THE TOPMOST MODAL.
 *
 * Drawer and Dialog open with `showModal()`, which makes everything outside the
 * dialog INERT. A region rendered in the page therefore sat UNDER the drawer and
 * its backdrop: a toast raised while a drawer was open was covered, and its
 * action button could not be clicked or focused. Measured on 2026-09-27 in
 * Chromium, Firefox and WebKit through Playwright: a popover outside an open
 * modal dialog is inert in all three, and the same popover appended INSIDE the
 * dialog is hit-testable, focusable, clickable and still positioned against the
 * viewport.
 *
 * So the region is a `popover="manual"` element this provider owns (created
 * imperatively, because React must never see its own node moved) and portalled
 * into. The classes reset the popover's UA styles (margin, border, background,
 * overflow, inset, size) and otherwise keep the old region's placement.
 *
 * WHERE IT GOES: INTO A MODAL ONLY FOR A TOAST RAISED IN THAT MODAL. Each toast
 * remembers the topmost modal that was open when it was raised (its origin).
 * The region sits in the topmost OPEN modal that is the origin of a toast on
 * screen, and in the body otherwise. A toast raised in a drawer (a failed save's
 * "Tentar novamente") is therefore on top of it and clickable; when that drawer
 * closes the region returns to the body, and a drawer opened AFTER a toast was
 * raised stays above it, as every modal did before SKEW-01. The first version
 * followed whichever modal was topmost: the "Marcação guardada" toast of one
 * save was carried into the next drawer the user opened, sat over its
 * "Guardar", and hovering it to click paused its dismissal (measured on the
 * blue lane, 2026-09-27: scheduling.spec.ts reschedule, 231 blocked clicks).
 * A nested dialog (the drawer's discard Dialog) is a DOM descendant of its
 * drawer and therefore later in document order, which is also the order they
 * are shown in.
 */
const REGION_CLASS =
  "pointer-events-none fixed inset-x-0 top-auto bottom-0 z-50 m-0 flex h-auto w-auto flex-col items-stretch gap-2 overflow-visible border-0 bg-transparent p-4 text-inherit sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end";

function topmostModalDialog(): HTMLDialogElement | null {
  const open = document.querySelectorAll("dialog[open]");
  for (let i = open.length - 1; i >= 0; i -= 1) {
    const d = open[i] as HTMLDialogElement;
    let modal = true;
    try {
      modal = d.matches(":modal");
    } catch {
      // A browser without `:modal` gets the open dialog, which is the only kind
      // this repository opens.
    }
    if (modal) return d;
  }
  return null;
}

/**
 * The topmost open modal that is the origin of a toast on screen, or the body.
 * A closed or unmounted origin no longer counts (toast-store.ts, pickRegionParent).
 */
function regionParent(origins: Iterable<Element | null>): HTMLElement {
  return pickRegionParent(document.querySelectorAll<HTMLDialogElement>("dialog[open]"), origins) ?? document.body;
}

/** Puts the region where it belongs now. True when it had to move. */
function placeRegion(host: HTMLElement, origins: Iterable<Element | null>): boolean {
  const parent = regionParent(origins);
  // Moving a showing popover hides it, so it is re-shown below.
  const moved = host.parentElement !== parent;
  if (moved) parent.appendChild(host);
  if (!host.hasAttribute("popover") || typeof host.showPopover !== "function") return moved;
  try {
    if (!host.matches(":popover-open")) host.showPopover();
  } catch {
    // Not connected, or no popover support: it stays a fixed element.
  }
  return moved;
}

/**
 * A live region has to be in the accessibility tree BEFORE its content changes,
 * or a screen reader may announce nothing: moving the region is a removal and a
 * re-insertion, and a polite (role="status") toast inserted in the same frame as
 * the move can go unannounced. So a toast that needs the region moved first
 * waits one frame (with a timer as the backstop, because a hidden tab runs no
 * animation frames).
 */
function afterRegionSettles(fn: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  requestAnimationFrame(run);
  setTimeout(run, 100);
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Accessible name for the notifications region (from i18n). */
  regionLabel?: string;
}

export function ToastProvider({ children, regionLabel = "Notificações" }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  /**
   * Every toast pushed and not yet closed, and the modal it was raised in (null:
   * the page). Its onClose fires as it leaves. See toast-store.ts.
   */
  const [store] = useState(() => createToastLifecycle<ToastOptions, Element>());

  const close = useCallback(
    (id: number) => {
      store.release(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [store],
  );

  const toast = useCallback(
    (options: ToastOptions): number => {
      const id = store.open(options, topmostModalDialog());
      const add = () => {
        // Closed before it was ever added (see afterRegionSettles).
        if (!store.isLive(id)) return;
        // It enters the stack NOW, which for a toast that waited for the region
        // is later than toasts raised after it (toast-store.ts, `committed`).
        store.entered(id);
        setToasts((prev) => appendToStack(prev, { ...options, id }));
      };
      const el = hostRef.current;
      if (el && placeRegion(el, store.origins())) afterRegionSettles(add);
      else add();
      return id;
    },
    [store],
  );

  const toaster = useMemo<Toaster<ToastOptions>>(() => ({ push: toast, close }), [toast, close]);

  // Registered in a LAYOUT effect so a provider mounted with flushSync is
  // reachable through `showToast` the moment the render returns.
  useLayoutEffect(() => registry.register(toaster), [toaster]);

  // A toast pushed out of the stack by a newer one leaves without passing
  // through `close`, so its onClose fires here. Only ids a committed render has
  // already reached count: a toast pushed a moment ago whose render has not
  // committed yet is still on its way, not gone.
  useEffect(() => {
    store.committed(toasts.map((t) => t.id));
  }, [toasts, store]);

  // Leaving the page (or the provider) closes whatever is still up.
  useEffect(() => () => store.releaseAll(), [store]);

  useEffect(() => {
    const el = document.createElement("div");
    el.className = REGION_CLASS;
    el.setAttribute("aria-live", "polite");
    el.setAttribute("data-toast-region", "");
    if (typeof el.showPopover === "function") el.setAttribute("popover", "manual");
    document.body.appendChild(el);
    hostRef.current = el;
    setHost(el);
    return () => {
      hostRef.current = null;
      el.remove();
    };
  }, []);

  useEffect(() => {
    host?.setAttribute("aria-label", regionLabel);
  }, [host, regionLabel]);

  // Place the region before paint, and follow its origin dialogs closing or
  // being unmounted for as long as a toast is on screen. A new toast places the
  // region itself first (toast() above).
  useLayoutEffect(() => {
    if (!host) return;
    const place = () => {
      placeRegion(host, store.origins());
    };
    place();
    if (toasts.length === 0) return;
    const observer = new MutationObserver(place);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, [host, toasts, store]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {host &&
        createPortal(
          toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => close(t.id)} />),
          host,
        )}
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "info";
  const Icon = TONE_ICON[tone];
  const duration = toast.duration ?? DEFAULT_DURATION;

  const [shown, setShown] = useState(false);
  // The countdown and its pause are rules, not rendering: toast-store.ts,
  // createDismissTimer. A toast often appears UNDER the pointer (the drawer's
  // confirm button and the region share the bottom right corner), so the pointer
  // can enter it before the effect below has started the countdown.
  const [timer] = useState(() =>
    createDismissTimer(duration, {
      now: () => Date.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    }),
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    timer.start(onDismiss);
    return () => {
      cancelAnimationFrame(raf);
      timer.stop();
    };
  }, [timer, onDismiss]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      onMouseEnter={timer.hold}
      onMouseLeave={timer.release}
      onFocus={timer.hold}
      onBlur={timer.release}
      className={cx(
        "pointer-events-auto flex w-full max-w-90 items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg",
        "transition-all duration-base ease-standard",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" className={cx("mt-0.5 shrink-0", TONE_COLOR[tone])} />
      <p className="min-w-0 flex-1 text-sm text-text-primary">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded px-2 py-1 text-sm font-semibold text-accent-2-700 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onDismiss}
        className="shrink-0 rounded text-text-muted transition-colors duration-fast ease-standard hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
