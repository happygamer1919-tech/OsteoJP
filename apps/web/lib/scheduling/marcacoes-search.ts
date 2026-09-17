/**
 * U1 / Q-U1-1 — the Marcações tab's canonical query string, as a plain module.
 *
 * ==========================================================================
 * ONE BUILDER, BECAUSE TWO WOULD DRIFT
 * ==========================================================================
 * `pager.client.tsx` states the rule this follows: the SERVER owns the
 * canonical query shape (which params exist, which are omitted when empty), and
 * a client component that re-derives it becomes a second source of truth for the
 * same URL. The filter bar was already building this string inside its own
 * `apply()`; the page now needs the identical string to know whether what it
 * rendered still matches the address bar. So the rule moves here and both call
 * it, rather than the page growing a second copy that agrees today.
 *
 * It is a pure function of the filter values, so the decision this ticket turns
 * on is testable without a DOM — `apps/web` runs vitest in the node environment
 * with no jsdom, the same reason `page-items.ts` and `search-rule.ts` exist.
 *
 * ==========================================================================
 * WHY "IS THIS STALE" IS A SET COMPARISON, NOT A STRING COMPARISON
 * ==========================================================================
 * `?tab=consultas&estado=cancelled` and `?estado=cancelled&tab=consultas`
 * describe the same view. A raw string compare would call the second one stale
 * and navigate, and since that navigation produces the first spelling, the two
 * would trade places forever. The comparison is therefore on the sorted set of
 * non-empty params, which is what actually decides what the server returns.
 */
import type { AppointmentStatusValue } from "./types";

/** The tab this filter bar lives on. Written on every navigation, never dropped. */
export const MARCACOES_TAB = "consultas";

/**
 * The filter state, in the shape the URL round-trips.
 *
 * It lives HERE rather than in the client component so the server page can name
 * it without importing a `"use client"` module for a type.
 */
export type MarcacoesFilterValues = {
  from: string;
  to: string;
  estado: readonly AppointmentStatusValue[];
  therapist: string;
  clinic: string;
  service: string;
  semNota: boolean;
  order: "newest" | "oldest";
};

/**
 * The canonical `?...` for a filter state.
 *
 * ALWAYS DROPS `page`, and always writes `tab`. Both rules are the filter bar's
 * and are restated in its own comments; this is the one implementation of them.
 * An empty value is OMITTED rather than written blank, so "no filter" has
 * exactly one spelling and a cleared filter returns to the canonical URL.
 */
export function canonicalMarcacoesSearch(v: MarcacoesFilterValues): string {
  const p = new URLSearchParams();
  p.set("tab", MARCACOES_TAB);
  if (v.from) p.set("de", v.from);
  if (v.to) p.set("ate", v.to);
  if (v.estado.length > 0) p.set("estado", v.estado.join(","));
  if (v.therapist) p.set("terapeuta", v.therapist);
  if (v.clinic) p.set("clinica", v.clinic);
  if (v.service) p.set("servico", v.service);
  if (v.semNota) p.set("semnota", "1");
  if (v.order === "oldest") p.set("ordem", "antigas");
  return `?${p.toString()}`;
}

/** The sorted, blank-free param set — the part of a URL the server acts on. */
function normalize(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return [...new URLSearchParams(raw).entries()]
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, value]) => `${k}=${value}`)
    .join("&");
}

/**
 * Does the address bar disagree with the view that was rendered?
 *
 * THIS IS THE WHOLE OF Q-U1-1. After a Back or a Forward the browser can hold a
 * URL the rendered payload does not describe: the client router has no cache
 * entry for that history entry, and rather than fetching it, it reconciles the
 * URL to the payload it already has. Measured: zero server requests, the
 * filtered rows still on screen, and the Estado box still ticked.
 *
 * The ruling is that the URL wins and the extra round trip is accepted, so this
 * is the predicate that triggers it.
 */
export function marcacoesViewIsStale(renderedSearch: string, addressBarSearch: string): boolean {
  return normalize(renderedSearch) !== normalize(addressBarSearch);
}
