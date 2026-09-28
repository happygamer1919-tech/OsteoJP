import { flushSync } from "react-dom";
import { ToastProvider, showToast, type ToastOptions } from "@osteojp/ui";

import { s } from "@/lib/i18n";

import { createToastBridge } from "./toast-bridge-core";

/**
 * SKEW-01 S4 - A TOAST ON EVERY PAGE, AND NO PAGE CAN CRASH ON ONE.
 *
 * `useToast()` throws when no <ToastProvider> is above it
 * (packages/ui/src/components/Toast.tsx), and /horarios has already crashed on
 * exactly that (app/horarios/AlternatingWeeksPanel.tsx). The wrapper is not a
 * component and cannot use a hook anyway, so it goes through `showToast`, the
 * non-throwing accessor, which pushes into the provider mounted last.
 *
 * WHEN NO PROVIDER IS MOUNTED (every staff page renders the logout form, and
 * most have no provider) a provider is mounted ONCE, on its own root at the end
 * of <body>, and the toast is pushed into it. It is created only on the first
 * failure that needs it, so a page that never fails never grows one. Every step
 * is caught: a toast that cannot be shown is dropped, never thrown, and the
 * skew reload does not depend on it. agenda-action-skew.spec.ts proves the
 * fallback on a page with no provider (/patients).
 */

let fallbackHost: Promise<void> | null = null;

function mountFallbackProvider(): Promise<void> {
  if (!fallbackHost) {
    // react-dom/client is loaded only here, on the first failure that needs it.
    fallbackHost = import("react-dom/client")
      .then(({ createRoot }) => {
        const el = document.createElement("div");
        el.setAttribute("data-toast-fallback", "");
        document.body.appendChild(el);
        const root = createRoot(el);
        // flushSync so the provider has registered with showToast (it does so
        // in a layout effect) before this promise resolves.
        flushSync(() => {
          root.render(<ToastProvider regionLabel={s["toast.regionLabel"]}>{null}</ToastProvider>);
        });
      })
      .catch((error: unknown) => {
        fallbackHost = null;
        throw error;
      });
  }
  return fallbackHost;
}

/**
 * Shows a toast on any page and returns a function that closes it. The
 * decisions (provider or fallback, mount once, never throw, a dropped toast
 * still reports its close) are in toast-bridge-core.ts, unit-tested there.
 */
export const notifyToast: (options: ToastOptions) => () => void = createToastBridge<ToastOptions>({
  // Looked up per toast, not at module load: this module is imported by every
  // agenda component, and render tests mock @osteojp/ui without showToast.
  show: (options) => showToast(options),
  mountFallback: mountFallbackProvider,
});
