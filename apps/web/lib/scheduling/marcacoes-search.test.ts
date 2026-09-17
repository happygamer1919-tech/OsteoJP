/**
 * U1 / Q-U1-1 — the canonical Marcações query string, and the staleness rule
 * that makes Back authoritative.
 *
 * The staleness cases are the ones this ticket exists for: after a Back, the
 * address bar and the rendered payload disagree, and something has to notice.
 * They are pure functions of two strings, so they are asserted directly rather
 * than through a browser.
 */
import { describe, expect, it } from "vitest";

import {
  canonicalMarcacoesSearch,
  marcacoesViewIsStale,
  type MarcacoesFilterValues,
} from "./marcacoes-search";

const EMPTY: MarcacoesFilterValues = {
  from: "",
  to: "",
  estado: [],
  therapist: "",
  clinic: "",
  service: "",
  semNota: false,
  order: "newest",
};

describe("canonicalMarcacoesSearch", () => {
  it("writes the tab even with no filter at all", () => {
    expect(canonicalMarcacoesSearch(EMPTY)).toBe("?tab=consultas");
  });

  it("omits every empty value, so 'no filter' has ONE spelling", () => {
    expect(canonicalMarcacoesSearch({ ...EMPTY, from: "", therapist: "" })).toBe("?tab=consultas");
  });

  it("carries a single Estado", () => {
    expect(canonicalMarcacoesSearch({ ...EMPTY, estado: ["cancelled"] })).toBe(
      "?tab=consultas&estado=cancelled",
    );
  });

  it("joins several Estados with commas, in the order ticked", () => {
    expect(canonicalMarcacoesSearch({ ...EMPTY, estado: ["completed", "cancelled"] })).toBe(
      "?tab=consultas&estado=completed%2Ccancelled",
    );
  });

  it("writes semnota only when it is on, and ordem only when oldest", () => {
    expect(canonicalMarcacoesSearch({ ...EMPTY, semNota: true })).toContain("semnota=1");
    expect(canonicalMarcacoesSearch({ ...EMPTY, order: "oldest" })).toContain("ordem=antigas");
    expect(canonicalMarcacoesSearch({ ...EMPTY, order: "newest" })).not.toContain("ordem");
  });

  it("never writes page — a filter change cannot land on page 7 of a two-page result", () => {
    expect(canonicalMarcacoesSearch({ ...EMPTY, estado: ["no_show"] })).not.toContain("page");
  });
});

describe("marcacoesViewIsStale — the Q-U1-1 rule", () => {
  it("is NOT stale when the address bar is the URL that was rendered", () => {
    expect(marcacoesViewIsStale("?tab=consultas&estado=cancelled", "?tab=consultas&estado=cancelled")).toBe(false);
  });

  // THE FAILURE THIS TICKET IS ABOUT: Back put the unfiltered URL in the address
  // bar while the filtered payload stayed on screen.
  it("IS stale when Back drops a filter the rendered view still shows", () => {
    expect(marcacoesViewIsStale("?tab=consultas&estado=cancelled", "?tab=consultas")).toBe(true);
  });

  // ...and the same in reverse, which is what Forward does.
  it("IS stale when Forward re-adds a filter the rendered view does not have", () => {
    expect(marcacoesViewIsStale("?tab=consultas", "?tab=consultas&estado=cancelled")).toBe(true);
  });

  it("IS stale when the filter merely CHANGES value", () => {
    expect(marcacoesViewIsStale("?tab=consultas&estado=cancelled", "?tab=consultas&estado=completed")).toBe(true);
  });

  // Param order is not meaning. Treating it as meaning would make the fix
  // navigate to a URL that re-spells itself, and the two would alternate.
  it("is NOT stale when only the param ORDER differs", () => {
    expect(marcacoesViewIsStale("?tab=consultas&estado=cancelled", "?estado=cancelled&tab=consultas")).toBe(false);
  });

  it("is NOT stale when the only difference is a blank param", () => {
    expect(marcacoesViewIsStale("?tab=consultas", "?tab=consultas&terapeuta=")).toBe(false);
  });

  it("tolerates a missing leading question mark on either side", () => {
    expect(marcacoesViewIsStale("tab=consultas", "?tab=consultas")).toBe(false);
    expect(marcacoesViewIsStale("?tab=consultas", "tab=consultas&estado=no_show")).toBe(true);
  });

  it("round-trips: a built search is never stale against itself", () => {
    const v: MarcacoesFilterValues = {
      ...EMPTY,
      estado: ["cancelled", "no_show"],
      semNota: true,
      order: "oldest",
      therapist: "t-1",
    };
    const built = canonicalMarcacoesSearch(v);
    expect(marcacoesViewIsStale(built, built)).toBe(false);
  });
});
