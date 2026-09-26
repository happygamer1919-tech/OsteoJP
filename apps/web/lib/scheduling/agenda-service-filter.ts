// AGENDA-FILTER-SERVICE - the agenda filtered by service, with multi-select
// chips, remembered PER DEVICE.
//
// WHAT IS DECIDED HERE: which services are offered as chips, which bookings a
// selection keeps, how a press changes the selection, and how the selection is
// stored and read back. Pure, no DOM, no clock: the component renders the
// answer (app/agenda/service-filter.tsx, mounted by agenda-view.tsx).
//
// HOW IT COMBINES WITH THE THERAPIST FILTER. The therapist filter narrows on the
// SERVER (page.tsx hands `?therapist=` to listAppointments, which also widens a
// shared resource's diary to its Terapeuta 2 rows). This filter runs on the
// client, over exactly the rows the server returned. A booking is on screen only
// if the server kept it AND this filter keeps it, which is "both apply". The
// therapist rule is deliberately NOT restated here: a second copy on the client
// would have to reproduce the shared-resource widening and a therapist's merged
// { self, machines } set, and a copy that drifted would hide real bookings.
//
// STORAGE: localStorage only, through the same guarded accessor the Dia/Semana
// preference uses (agenda-view-preference.ts), and every read and write is in a
// try/catch. A storage that is missing, throws on read, throws on write or holds
// garbage means "nothing selected, nothing remembered", and the agenda renders
// every booking exactly as it did before this card.
//
// THE DEFAULTS, each one logged for the owner:
//   - Time-off blocks are not bookings and are never filtered (the component
//     simply passes `blocks` through; nothing here reads them).
//   - A booking with no service is hidden as soon as one chip is selected: it
//     matches no selected service.
//   - A stored id that is no longer offered is dropped when read. Storage is not
//     rewritten on read; the next press stores the cleaned list.
//   - Chips are the services' own names, in the order the app already lists
//     services (getAgendaOptions: by name).
//   - One selection for the device, not one per clinic.

import { browserViewStorage, type ViewStorage } from "./agenda-view-preference";
import type { Option } from "./types";

export const AGENDA_SERVICE_FILTER_STORAGE_KEY = "osteojp.agenda.services";

/** A service as the agenda options carry it; `locationId` null = every clinic. */
export type ServiceWithClinic = Option & { locationId?: string | null };

/**
 * The chips: the services visible at the viewer's clinics.
 *
 * A service with `location_id` NULL is offered at every clinic; one bound to a
 * clinic is offered only when that clinic is one of the viewer's. The same rule
 * the portal catalog applies (apps/api/lib/appointments/store.ts getCatalog).
 * `locationId` UNDEFINED means the row did not say, and is treated like null:
 * hiding a service because a field was not selected would be a silent loss.
 *
 * `clinicIds` undefined means the caller has no clinic list (an options mock);
 * every service is offered then. Order is the input's, never re-sorted here.
 */
export function servicesAtClinics(
  services: readonly ServiceWithClinic[],
  clinicIds: readonly string[] | undefined,
): Option[] {
  const clinics = clinicIds ? new Set(clinicIds) : null;
  return services
    .filter((svc) => svc.locationId == null || clinics === null || clinics.has(svc.locationId))
    .map((svc) => ({ id: svc.id, label: svc.label }));
}

/**
 * Does this booking pass the service filter?
 *
 * Empty selection = every booking (the filter is off). Otherwise the booking's
 * service must be selected; a booking with NO service matches nothing and is
 * hidden (default logged for the owner).
 */
export function passesServiceFilter(
  appt: { serviceId: string | null },
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  return appt.serviceId !== null && selected.includes(appt.serviceId);
}

/**
 * The bookings a selection keeps, in their original order. With nothing
 * selected it returns the SAME array, so an unfiltered agenda hands its
 * surfaces exactly the prop it was given.
 */
export function filterByService<T extends { serviceId: string | null }>(
  appointments: T[],
  selected: readonly string[],
): T[] {
  if (selected.length === 0) return appointments;
  return appointments.filter((a) => passesServiceFilter(a, selected));
}

/**
 * Keep only ids that are offered, once each, in the order the chips are listed.
 * Anything that is not an array of strings is "nothing selected".
 */
export function sanitizeServiceSelection(raw: unknown, offered: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set(raw.filter((v): v is string => typeof v === "string"));
  return offered.filter((id) => wanted.has(id));
}

/** One press on a chip: select it if it was not, clear it if it was. */
export function toggleServiceSelection(
  selected: readonly string[],
  id: string,
  offered: readonly string[],
): string[] {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return sanitizeServiceSelection([...next], offered);
}

/**
 * The raw stored value, or null for none or a storage that throws.
 *
 * A PRIMITIVE on purpose: agenda-view.tsx reads it through
 * `useSyncExternalStore`, whose snapshot must compare equal between two reads
 * of the same state. A string does; a freshly parsed array would not.
 */
export function readStoredServiceFilter(storage: ViewStorage | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(AGENDA_SERVICE_FILTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Parse a stored value into a selection. Malformed JSON is "nothing selected". */
export function parseServiceFilter(raw: string | null, offered: readonly string[]): string[] {
  if (raw === null) return [];
  try {
    return sanitizeServiceSelection(JSON.parse(raw), offered);
  } catch {
    return [];
  }
}

/** Read the device's selection, keeping only services still offered. */
export function readServiceFilter(storage: ViewStorage | null, offered: readonly string[]): string[] {
  return parseServiceFilter(readStoredServiceFilter(storage), offered);
}

/** Remember the selection. Returns whether it was stored; a refusal is not an error. */
export function writeServiceFilter(storage: ViewStorage | null, selected: readonly string[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AGENDA_SERVICE_FILTER_STORAGE_KEY, JSON.stringify(selected));
    return true;
  } catch {
    return false;
  }
}

/**
 * What the SERVER render reads as the stored value: nothing, always. The server
 * has no device storage, and hydration must reproduce the server's markup, so
 * the first client render reads this too and the real value follows one render
 * later (the same accepted flash as the Dia/Semana preference). Exported so a
 * render test can hand the component a stored selection through the same seam.
 */
export function serverStoredServiceFilter(): string | null {
  return null;
}

/** What the BROWSER reads as the stored value: this device's localStorage. */
export function clientStoredServiceFilter(): string | null {
  return readStoredServiceFilter(browserViewStorage());
}

/**
 * `useSyncExternalStore` needs a subscribe; nothing outside the agenda writes
 * this key, and the agenda re-renders on its own writes (it holds the pressed
 * selection in state), so there is nothing to listen to.
 */
export function subscribeNothing(): () => void {
  return () => {};
}
