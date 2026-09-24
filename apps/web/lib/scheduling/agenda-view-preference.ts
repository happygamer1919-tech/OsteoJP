// AGENDA-MOBILE-WEEK - the Dia/Semana choice is remembered PER DEVICE.
//
// localStorage ONLY, and every access is inside try/catch. Storage can be
// missing (server render), can throw on ACCESS (Safari with site data blocked,
// some private windows) and can throw on WRITE (quota, disabled storage). None
// of those may break the agenda: a failed read means "no preference", a failed
// write means "not remembered", and the page renders exactly as it does today.
//
// THE RULES, each one a default logged for the owner (Q-B6-4):
//   - An explicit `?view=` in the URL ALWAYS wins. Every link that means a view
//     already says so (the dashboard tile, the guest handoff, every press of the
//     toolbar), so the preference only decides a BARE /agenda.
//   - A patient deep link (`novaMarcacaoPaciente`) is left alone: it opens the
//     create drawer, and a second navigation under it would be a race.
//   - It applies at every width. "Per device" is the ruling's unit, and a phone
//     and a desktop are different devices with different storage anyway.
//   - Only the TOGGLE writes it. Tapping a day header on the phone's week is a
//     drill-down into one day, not a choice of view.
//
// THE FLASH IS ACCEPTED. The server renders a bare /agenda as the week before
// any script can read storage, so a device that prefers Dia sees the week for
// one round trip and then Dia. Removing that needs a server-readable mirror (a
// cookie), which is a second store the ruling did not name; it is the open half
// of Q-B6-4.

import type { AgendaView } from "./time";

export const AGENDA_VIEW_STORAGE_KEY = "osteojp.agenda.view";

/** The two calls this module makes, so a test can hand in a stub that throws. */
export type ViewStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * `window.localStorage`, or null when there is none or the browser refuses it.
 * Reading the PROPERTY can itself throw a SecurityError, which is why this is a
 * function with its own try/catch rather than a bare `window.localStorage`.
 */
export function browserViewStorage(): ViewStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored view, or null for none, garbage, or a storage that throws. */
export function readViewPreference(storage: ViewStorage | null): AgendaView | null {
  if (!storage) return null;
  try {
    const v = storage.getItem(AGENDA_VIEW_STORAGE_KEY);
    return v === "day" || v === "week" ? v : null;
  } catch {
    return null;
  }
}

/** Remember the view. Returns whether it was stored; a refusal is not an error. */
export function writeViewPreference(storage: ViewStorage | null, view: AgendaView): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AGENDA_VIEW_STORAGE_KEY, view);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a BARE /agenda should go for this device, or null to stay.
 *
 * `search` is `window.location.search` (with or without the leading "?").
 * Every other parameter is kept, so a bare `/agenda?date=...` keeps its date.
 */
export function preferredViewRedirect(
  search: string,
  current: AgendaView,
  stored: AgendaView | null,
): string | null {
  const params = new URLSearchParams(search);
  if (params.has("view")) return null;
  if (params.has("novaMarcacaoPaciente")) return null;
  if (stored === null || stored === current) return null;
  params.set("view", stored);
  return `/agenda?${params.toString()}`;
}
