import { useCallback, useEffect, useRef } from "react";

/**
 * SKEW-01 - "Tentar novamente" re-runs the caller's CURRENT handler.
 *
 * A write's retry is offered in a toast that stays up for seconds, and the form
 * behind it stays editable. A retry that closed over the render in which the
 * button was first pressed would re-send the values of THAT render, not what is
 * on screen now. This returns a stable function that always calls the handler
 * from the latest committed render, so the retry re-runs today's validation on
 * today's values.
 *
 * Once the component has unmounted there is no current render, so the function
 * does nothing: a retry pressed after its form closed must not re-send the
 * closed form (use-action-owner.ts also closes that toast).
 */
export function useLatestCallback<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const ref = useRef(fn);
  const mounted = useRef(true);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback((...args: A) => {
    if (mounted.current) ref.current(...args);
  }, []);
}
