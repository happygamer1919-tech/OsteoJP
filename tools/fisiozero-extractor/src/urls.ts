// tools/fisiozero-extractor/src/urls.ts
//
// Fisiozero endpoint URL builders. Only the SET-ACTIVE url carries a constructed
// param (the base64 patient id). Every other per-patient page is fetched at a
// fixed `op=` because the app keeps the "current patient" in server session.
//
// Episode-detail and attachment URLs are deliberately NOT constructed here: their
// ids/hashes are not derivable and must be scraped from rendered HTML (see
// html.ts). Constructing them would mean guessing, which the recon forbids.

import { encodePatientId } from "./ids";

/** The fixed per-patient page reads, fetched in this order after set-active. */
export const PATIENT_OPS = {
  ficha: "editar_ficha",
  episodes: "osteo_epi",
  evaluations: "avl",
  history: "consultar_hist",
} as const;

export type PatientOp = keyof typeof PATIENT_OPS;

function joinBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** GET this first: sets the active patient in the server session. */
export function setActiveUrl(baseUrl: string, id: number): string {
  const i = encodePatientId(id);
  // encodeURIComponent: base64 can contain '+' '/' '=' which must be escaped in a query value.
  return `${joinBase(baseUrl)}/index.php?op=r&action=ficha&i=${encodeURIComponent(i)}`;
}

/** A fixed `index.php?op=<op>` page for the currently-active patient. */
export function opUrl(baseUrl: string, op: string): string {
  return `${joinBase(baseUrl)}/index.php?op=${encodeURIComponent(op)}`;
}

/** The per-patient XLS export, scoped to the active patient. */
export function xlsExportUrl(baseUrl: string): string {
  return `${joinBase(baseUrl)}/export_ficha_utente.php`;
}

/** Resolve a possibly-relative href (scraped from HTML) against the base URL. */
export function resolveHref(baseUrl: string, href: string): string {
  return new URL(href, `${joinBase(baseUrl)}/`).toString();
}
