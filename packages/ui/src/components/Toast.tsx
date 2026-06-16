"use client";

import { Check, CircleAlert, Info, X } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
 * Wrap the app in <ToastProvider> and call `useToast()` to push toasts.
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
}

interface ToastRecord extends ToastOptions {
  id: number;
}

const MAX_STACK = 3;
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

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export interface ToastProviderProps {
  children: ReactNode;
  /** Accessible name for the notifications region (from i18n). */
  regionLabel?: string;
}

export function ToastProvider({ children, regionLabel = "Notificações" }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = (idRef.current += 1);
    setToasts((prev) => [...prev, { ...options, id }].slice(-MAX_STACK));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        aria-label={regionLabel}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
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
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const clear = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
  };
  const resume = useCallback(() => {
    clear();
    startedAt.current = Date.now();
    timer.current = window.setTimeout(onDismiss, remaining.current);
  }, [onDismiss]);
  const pause = () => {
    clear();
    remaining.current -= Date.now() - startedAt.current;
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    resume();
    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [resume]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
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
