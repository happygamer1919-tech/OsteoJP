import { useEffect, useRef } from "react";

/**
 * SKEW-01 S5 - A PERIODIC TIMER ON /agenda RUNS ONLY WHILE THE TAB IS VISIBLE.
 *
 * The only periodic timers on /agenda are the two 60 s now-line clocks
 * (app/agenda/agenda-grid.tsx and app/agenda/agenda-week-compact.tsx); the test
 * next to this file walks every client module /agenda reaches and fails on any
 * other setInterval. Both go through here: stopped while `document.hidden`, and
 * on the way back to visible they tick ONCE immediately (the catch-up, so the
 * now line is right the moment the tab is looked at) and then resume the period.
 *
 * NEITHER CLOCK IS THE "CALL TWO MINUTES AFTER OPENING". Measured 2026-09-27
 * over raw CDP on a local production build and on `next dev`, opening an
 * existing appointment as admin and as therapist, tab visible, hidden and
 * frozen, 150 s each: the clocks post nothing, and no server action fired after
 * the drawer's on-open burst (eight reads, the last at 7.5 s in the slowest
 * run). No natural run recorded a late call at all.
 *
 * What the late call IS remains an inference, not a measurement. The leading
 * explanation: an on-open read held in Next's serialized action queue
 * (next/dist/client/components/app-router-instance.js:104-158) behind a slow
 * read ahead of it. It was reproduced only by induction: the probe itself held
 * the FIRST read (getTherapistDayAvailability, availability-panel.tsx:54) for
 * 120 s, and the other seven went out at 120.2 s. That shows the mechanism (a
 * held read delays every read queued behind it by its whole hold); the two
 * minutes are there by construction, not observed. Confidence: low to medium.
 *
 * The controller is pure and injectable so the unit test drives it without a
 * DOM (apps/web vitest runs in node); the hook is a thin binding to the real
 * document and window timers.
 */

export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface VisibleIntervalDeps {
  tick: () => void;
  periodMs: number;
  /** Tick once at start, as well as on every period. */
  tickOnStart?: boolean;
  doc: VisibilitySource;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

/** Starts the timer; the returned function stops it for good. */
export function startVisibleInterval(deps: VisibleIntervalDeps): () => void {
  let id: number | null = null;
  const run = () => {
    if (id === null) id = deps.setInterval(deps.tick, deps.periodMs);
  };
  const pause = () => {
    if (id !== null) {
      deps.clearInterval(id);
      id = null;
    }
  };
  const onVisibility = () => {
    if (deps.doc.hidden) {
      pause();
    } else if (id === null) {
      deps.tick();
      run();
    }
  };
  if (deps.tickOnStart) deps.tick();
  if (!deps.doc.hidden) run();
  deps.doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    deps.doc.removeEventListener("visibilitychange", onVisibility);
    pause();
  };
}

/**
 * setInterval(tick, periodMs), paused while the tab is hidden. `tick` may change
 * between renders; the latest one is always called.
 */
export function useVisibleInterval(
  tick: () => void,
  periodMs: number,
  options: { tickOnStart?: boolean } = {},
): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });
  const tickOnStart = options.tickOnStart ?? false;
  useEffect(
    () =>
      startVisibleInterval({
        tick: () => latest.current(),
        periodMs,
        tickOnStart,
        doc: document,
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (i) => window.clearInterval(i),
      }),
    [periodMs, tickOnStart],
  );
}
