import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { agendaClientModules, codeOnly } from "@/lib/testing/module-graph";

import { startVisibleInterval, type VisibilitySource } from "./visible-interval";

/**
 * SKEW-01 S5 - every timer on /agenda is paused while the tab is hidden and
 * resumed, with an immediate catch-up tick, when it is visible again.
 */

function fakeDoc(hidden = false) {
  const listeners = new Set<() => void>();
  const doc: VisibilitySource & { hidden: boolean; set(h: boolean): void; listeners: Set<() => void> } = {
    hidden,
    listeners,
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    set(h: boolean) {
      this.hidden = h;
      for (const l of [...listeners]) l();
    },
  };
  return doc;
}

function fakeTimers() {
  const live = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    live,
    setInterval: (fn: () => void, ms: number) => {
      const id = next++;
      live.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id: number) => {
      live.delete(id);
    },
    /** Fires every live interval once, as if one period elapsed. */
    elapse() {
      for (const t of [...live.values()]) t.fn();
    },
  };
}

describe("startVisibleInterval", () => {
  it("runs on its period while visible", () => {
    const doc = fakeDoc(false);
    const timers = fakeTimers();
    const tick = vi.fn();
    startVisibleInterval({ tick, periodMs: 60_000, doc, ...timers });
    expect([...timers.live.values()].map((t) => t.ms)).toEqual([60_000]);
    timers.elapse();
    timers.elapse();
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("is PAUSED while hidden: no interval exists and nothing ticks", () => {
    const doc = fakeDoc(false);
    const timers = fakeTimers();
    const tick = vi.fn();
    startVisibleInterval({ tick, periodMs: 60_000, doc, ...timers });
    doc.set(true);
    expect(timers.live.size).toBe(0);
    timers.elapse();
    expect(tick).not.toHaveBeenCalled();
  });

  it("RESUMES on visible with an immediate catch-up tick, then its period", () => {
    const doc = fakeDoc(false);
    const timers = fakeTimers();
    const tick = vi.fn();
    startVisibleInterval({ tick, periodMs: 60_000, doc, ...timers });
    doc.set(true);
    doc.set(false);
    expect(tick).toHaveBeenCalledTimes(1); // the catch-up
    expect(timers.live.size).toBe(1);
    timers.elapse();
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("a page opened in a hidden tab starts paused and starts on first visible", () => {
    const doc = fakeDoc(true);
    const timers = fakeTimers();
    const tick = vi.fn();
    startVisibleInterval({ tick, periodMs: 60_000, doc, ...timers });
    expect(timers.live.size).toBe(0);
    doc.set(false);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(timers.live.size).toBe(1);
  });

  it("repeated visible events never stack a second interval or a second catch-up", () => {
    const doc = fakeDoc(false);
    const timers = fakeTimers();
    const tick = vi.fn();
    startVisibleInterval({ tick, periodMs: 60_000, doc, ...timers });
    doc.set(false);
    doc.set(false);
    expect(timers.live.size).toBe(1);
    expect(tick).not.toHaveBeenCalled();
  });

  it("tickOnStart ticks once at start (the compact week's now line needs it)", () => {
    const doc = fakeDoc(false);
    const timers = fakeTimers();
    const tick = vi.fn();
    startVisibleInterval({ tick, periodMs: 60_000, tickOnStart: true, doc, ...timers });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("stop removes the interval and the listener", () => {
    const doc = fakeDoc(false);
    const timers = fakeTimers();
    const stop = startVisibleInterval({ tick: vi.fn(), periodMs: 60_000, doc, ...timers });
    stop();
    expect(timers.live.size).toBe(0);
    expect(doc.listeners.size).toBe(0);
  });
});

describe("the timers on /agenda go through it", () => {
  const APP_DIR = join(__dirname, "..", "..");
  for (const file of ["app/agenda/agenda-grid.tsx", "app/agenda/agenda-week-compact.tsx"]) {
    it(`${file} uses useVisibleInterval and no raw setInterval`, () => {
      const src = readFileSync(join(APP_DIR, file), "utf8");
      expect(src).toContain("useVisibleInterval(");
      expect(src).not.toMatch(/\bsetInterval\s*\(/);
    });
  }

  /**
   * Not only the two clocks: every module /agenda runs in the browser (every
   * "use client" module the route reaches and all they import, @osteojp
   * packages included; lib/testing/module-graph.ts), comments and strings
   * stripped. A setInterval anywhere in it other than inside this hook fails,
   * naming the file and line, so a new periodic timer on /agenda cannot skip
   * the pause.
   */
  it("NO module /agenda runs in the browser calls setInterval except this hook", () => {
    const client = agendaClientModules();
    const hook = join(APP_DIR, "lib/timers/visible-interval.ts");
    // Not vacuous: the walk reaches the agenda's client tree, both clocks, the
    // hook, and a workspace package (the Toast, which uses setTimeout only).
    expect(client.size).toBeGreaterThan(60);
    for (const f of [
      "app/agenda/agenda-grid.tsx",
      "app/agenda/agenda-week-compact.tsx",
      "app/agenda/appointment-drawer.tsx",
      "lib/timers/visible-interval.ts",
    ]) {
      expect(client.has(join(APP_DIR, f)), `${f} is not in /agenda's client tree`).toBe(true);
    }
    expect(client.has(resolve(APP_DIR, "..", "..", "packages/ui/src/components/Toast.tsx"))).toBe(true);

    const offenders: string[] = [];
    for (const file of client) {
      if (file === hook) continue;
      const code = codeOnly(readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (/\bsetInterval\s*\(/.test(line)) offenders.push(`${relative(APP_DIR, file)}:${i + 1}`);
      });
    }
    expect(offenders, "a periodic timer on /agenda that does not go through useVisibleInterval").toEqual([]);
  });

  it("the scan itself finds a setInterval, and not one in a comment or a string", () => {
    const code = codeOnly(
      ["// setInterval(tick, 1000)", "const s = 'setInterval(x)';", "const id = window.setInterval(tick, 60_000);"].join(
        "\n",
      ),
    );
    const hits = code.split("\n").flatMap((line, i) => (/\bsetInterval\s*\(/.test(line) ? [i + 1] : []));
    expect(hits).toEqual([3]);
  });
});
