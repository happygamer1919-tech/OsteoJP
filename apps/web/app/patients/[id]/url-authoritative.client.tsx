"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { marcacoesViewIsStale } from "@/lib/scheduling/marcacoes-search";

/**
 * U1 / Q-U1-1 — after a Back or a Forward, the URL wins.
 *
 * ==========================================================================
 * WHAT WAS MEASURED, AND WHY A LISTENER IS NOT ENOUGH ON ITS OWN
 * ==========================================================================
 * Apply an Estado filter, reload, press Back. Measured on a throttled CPU, in a
 * dev server AND in a production build:
 *
 *   popstate fires at ?tab=consultas          (the URL really does go back)
 *   then history.replaceState -> ?tab=consultas&estado=cancelled
 *   server requests made: ZERO
 *   rows on screen: 1 of 250, Estado still ticked
 *
 * The client router has no cache entry for that history entry — the reload
 * destroyed the document that owned it — and instead of fetching the URL it
 * reconciles the URL back to the payload it is holding. Nothing re-renders, so
 * nothing downstream can notice: with no round trip the server values never
 * change, which is why the tick stays on. The tick is a SYMPTOM, not the cause.
 *
 * The window that matters is BEFORE hydration. On an unthrottled machine the
 * router is ready and Back refetches on its own, which is why this never
 * reproduced locally and failed every time on CI. So the popstate is captured
 * twice:
 *
 *   1. by an inline script in the page, which runs while the document is still
 *      parsing and therefore exists during the gap this defect lives in; and
 *   2. by the listener below, for every Back after hydration.
 *
 * Both write the same global. This component drains it.
 *
 * ==========================================================================
 * IT COMPARES AGAINST WHAT THE SERVER RENDERED, NOT AGAINST ITS OWN GUESS
 * ==========================================================================
 * `search` is the canonical query string the SERVER built for the payload on
 * screen, from the same builder the filter bar writes URLs with. So "stale"
 * means "the address bar asks for something other than what you are looking
 * at", which is exactly the condition the ruling says must resolve in the URL's
 * favour — and the extra round trip is accepted.
 */

/** Where both capture points record the last history navigation. */
declare global {
  interface Window {
    __osteojpPoppedSearch?: string | null;
  }
}

/**
 * The inline script, rendered by the server INSIDE the page so it runs during
 * parse — before any of this component's JavaScript has loaded.
 *
 * It is deliberately tiny and does nothing but record: no framework, no imports,
 * nothing that can fail while the page is still arriving.
 */
export const POPSTATE_CAPTURE_SCRIPT =
  "(function(){try{window.__osteojpPoppedSearch=null;" +
  "addEventListener('popstate',function(){window.__osteojpPoppedSearch=location.search},true)}catch(e){}})()";

export function UrlIsAuthoritative({ search }: { search: string }) {
  const router = useRouter();

  useEffect(() => {
    const reconcile = (addressBar: string) => {
      if (!marcacoesViewIsStale(search, addressBar)) return;
      // A real navigation, so the SERVER re-answers for the URL in the address
      // bar. `replace`, not `push`: the entry already exists in history and a
      // push would grow the stack every time someone holds Back.
      router.replace(`${window.location.pathname}${addressBar}`);
      router.refresh();
    };

    // Drain whatever the inline script recorded during the pre-hydration gap.
    const pending = window.__osteojpPoppedSearch;
    window.__osteojpPoppedSearch = null;
    if (typeof pending === "string") reconcile(pending);
    // Nothing was recorded, but the address bar can still disagree: the router
    // may have rewritten it before this component ever mounted.
    else if (marcacoesViewIsStale(search, window.location.search)) reconcile(window.location.search);

    const onPop = () => {
      // Read synchronously, in the capture phase, so the value is the URL the
      // user navigated to rather than whatever the router rewrites it to.
      const addressBar = window.location.search;
      window.__osteojpPoppedSearch = null;
      // Let the router's own popstate handling run first: when it does the right
      // thing the payload changes, `search` changes with it, and this effect is
      // torn down and re-created before the timeout fires — so the common case
      // costs nothing and only a genuine disagreement navigates.
      window.setTimeout(() => reconcile(addressBar), 0);
    };
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, [router, search]);

  return null;
}
