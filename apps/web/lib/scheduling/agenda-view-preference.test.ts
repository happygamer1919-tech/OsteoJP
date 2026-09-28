// AGENDA-MOBILE-WEEK - the Dia/Semana preference is per device, in
// localStorage, and every access survives a storage that throws.
//
// The failure this file exists for is not "the preference is not remembered".
// It is "the agenda does not render", because some iPhone privacy setting made
// `window.localStorage` throw a SecurityError on ACCESS and nothing caught it.
// So each path is driven with a storage that throws at that exact step.

import { afterEach, describe, expect, it } from "vitest";

import {
  AGENDA_VIEW_STORAGE_KEY,
  browserViewStorage,
  preferredViewRedirect,
  readViewPreference,
  writeViewPreference,
  type ViewStorage,
} from "./agenda-view-preference";

function memory(initial: Record<string, string> = {}): ViewStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const THROWS: ViewStorage = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

describe("readViewPreference", () => {
  it("reads a stored day or week", () => {
    expect(readViewPreference(memory({ [AGENDA_VIEW_STORAGE_KEY]: "day" }))).toBe("day");
    expect(readViewPreference(memory({ [AGENDA_VIEW_STORAGE_KEY]: "week" }))).toBe("week");
  });

  it("is null for no storage, no entry, and a value that is not a view", () => {
    expect(readViewPreference(null)).toBeNull();
    expect(readViewPreference(memory())).toBeNull();
    expect(readViewPreference(memory({ [AGENDA_VIEW_STORAGE_KEY]: "month" }))).toBeNull();
  });

  it("is null, not an exception, when getItem throws", () => {
    expect(() => readViewPreference(THROWS)).not.toThrow();
    expect(readViewPreference(THROWS)).toBeNull();
    // CONTROL: the stub really does throw, so the arm above measured the catch.
    expect(() => THROWS.getItem(AGENDA_VIEW_STORAGE_KEY)).toThrow();
  });
});

describe("writeViewPreference", () => {
  it("stores the view and says so", () => {
    const m = memory();
    expect(writeViewPreference(m, "day")).toBe(true);
    expect(m.data[AGENDA_VIEW_STORAGE_KEY]).toBe("day");
    // Round trip through the reader.
    expect(readViewPreference(m)).toBe("day");
  });

  it("returns false, not an exception, for no storage or a setItem that throws", () => {
    expect(writeViewPreference(null, "week")).toBe(false);
    expect(() => writeViewPreference(THROWS, "week")).not.toThrow();
    expect(writeViewPreference(THROWS, "week")).toBe(false);
    expect(() => THROWS.setItem(AGENDA_VIEW_STORAGE_KEY, "week")).toThrow();
  });
});

describe("browserViewStorage", () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it("is null on the server, where there is no window", () => {
    expect(g.window).toBeUndefined();
    expect(browserViewStorage()).toBeNull();
  });

  it("is null, not an exception, when READING window.localStorage throws", () => {
    // Safari with site data blocked throws on the property access itself.
    g.window = Object.defineProperty({}, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(() => browserViewStorage()).not.toThrow();
    expect(browserViewStorage()).toBeNull();
  });

  it("CONTROL: returns the storage when the browser has one", () => {
    const m = memory();
    g.window = { localStorage: m };
    expect(browserViewStorage()).toBe(m);
  });
});

describe("preferredViewRedirect", () => {
  it("a bare /agenda goes to the stored view, keeping every other parameter", () => {
    expect(preferredViewRedirect("", "week", "day")).toBe("/agenda?view=day");
    expect(preferredViewRedirect("?date=2026-09-25&location=x", "week", "day")).toBe(
      "/agenda?date=2026-09-25&location=x&view=day",
    );
  });

  it("an explicit ?view= ALWAYS wins over the stored one", () => {
    expect(preferredViewRedirect("?view=week", "week", "day")).toBeNull();
    expect(preferredViewRedirect("?view=day&date=2026-09-25", "day", "week")).toBeNull();
  });

  it("does nothing with no preference, or a preference the page already shows", () => {
    expect(preferredViewRedirect("", "week", null)).toBeNull();
    expect(preferredViewRedirect("", "week", "week")).toBeNull();
  });

  it("leaves a patient deep link alone: it opens a drawer and must not be navigated under", () => {
    expect(preferredViewRedirect("?novaMarcacaoPaciente=p-1", "week", "day")).toBeNull();
  });
});
