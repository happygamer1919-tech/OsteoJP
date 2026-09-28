// The two parts of /ajuda and their addresses.
//
// KEPT APART FROM guide-routes.ts ON PURPOSE: the tab bar is a client
// component, and guide-routes.ts imports guide-data.json. Importing it from the
// tab bar would ship every lesson of the guide to the browser to draw two tabs.
// This module imports nothing.

export const AJUDA_PATH = "/ajuda";

/** The two parts of /ajuda, as the value of its ?tab= parameter. */
export const AJUDA_TABS = ["guia", "perguntas"] as const;
export type AjudaTab = (typeof AJUDA_TABS)[number];

/** The tab a ?tab= value opens; anything else opens the guide, the default. */
export function ajudaTab(value: string | string[] | undefined): AjudaTab {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "perguntas" ? "perguntas" : "guia";
}

/** The address of a tab: the guide is /ajuda itself. */
export function ajudaTabHref(tab: AjudaTab): string {
  return tab === "guia" ? AJUDA_PATH : `${AJUDA_PATH}?tab=${tab}`;
}
