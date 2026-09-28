import { useEffect, useRef } from "react";

import { reloadQuietly } from "@/lib/actions/run-action";

import { deploymentIdOrNull } from "./build-id";
import { createDeploymentCheck, type DeploymentCheck } from "./deployment-check";

/**
 * SKEW-01 S6 - the React binding of deployment-check.ts, used by AgendaView.
 *
 * `holdReload` is AgendaView's own "a form is open" state
 * (`modal !== null || blockOpen !== null`). Every surface on /agenda that can
 * hold unsaved input renders only under one of those two, so while either is
 * set a detected mismatch waits, and the reload happens when the form closes.
 *
 * The client's id is Next's own deployment id (process.env.NEXT_DEPLOYMENT_ID,
 * which Turbopack rewrites to the id the page was served with); the server's is
 * /api/version reading the same name at request time (lib/deployment/build-id.ts).
 * An unknown id on either side means no check and no reload.
 */

const RELOAD_MARKER_KEY = "osteojp.skew.reloadedFor";

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return null;
    return deploymentIdOrNull((body as { buildId?: unknown }).buildId);
  } catch {
    return null;
  }
}

function readReloadMarker(): string | null {
  try {
    return window.sessionStorage.getItem(RELOAD_MARKER_KEY);
  } catch {
    return null;
  }
}

function writeReloadMarker(id: string): boolean {
  try {
    window.sessionStorage.setItem(RELOAD_MARKER_KEY, id);
    return window.sessionStorage.getItem(RELOAD_MARKER_KEY) === id;
  } catch {
    return false;
  }
}

export function useDeploymentCheck(holdReload: boolean): void {
  const check = useRef<DeploymentCheck | null>(null);

  useEffect(() => {
    const ctl = createDeploymentCheck({
      clientBuildId: deploymentIdOrNull(process.env.NEXT_DEPLOYMENT_ID),
      fetchServerBuildId,
      now: () => Date.now(),
      reloadQuietly,
      readReloadMarker,
      writeReloadMarker,
    });
    check.current = ctl;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void ctl.check();
    };
    const onFocus = () => void ctl.check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      check.current = null;
    };
  }, []);

  useEffect(() => {
    check.current?.setHeld(holdReload);
  }, [holdReload]);
}
