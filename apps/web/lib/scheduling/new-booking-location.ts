// AGENDA-NEW-LOC-01 - NOVA MARCACAO STARTS AT THE CLINIC THE AGENDA SHOWS.
//
// The owner and the clinic manager, 2026-11-06: with the agenda filtered to LV,
// "Nova marcação" opened on CB, because the create form's Localização fell back
// to the first bookable clinic whatever the agenda was showing.
//
// THE RULE. When the agenda's clinic filter names ONE clinic and the viewer may
// book into it, a create drawer opened by hand (the Nova marcação button or an
// empty slot) starts with Localização on that clinic. Under "Todas as
// localizações", or for a clinic outside the viewer's booking scope, this
// returns undefined and the drawer keeps its first-bookable default.
//
// WHY THE BOOKABLE CHECK. The read scope (`options.locations`) and the write
// scope (`options.bookableLocations`) are different lists (STAFF-02). A value
// the Localização <select> has no <option> for would paint the FIRST option
// instead (STAFF-01), so a clinic the viewer cannot book into is dropped here
// rather than handed over.
//
// IT IS A DEFAULT, NOTHING MORE. The result rides the drawer's existing
// `prefill` shape, the same one a converted guest request uses, so the drawer
// treats it exactly as it treats that one: an initial value, never a user
// change. The W12-23 people scoping still waits for a hand-made Localização
// change, and W4-12's therapist auto-fill may still move it.

/** The create drawer's `prefill`, carrying only the clinic. */
export type NewBookingPrefill = { serviceId: null; locationId: string };

export function newBookingPrefill(
  filterLocationId: string | null | undefined,
  bookableLocations: readonly { id: string }[],
): NewBookingPrefill | undefined {
  if (!filterLocationId) return undefined;
  if (!bookableLocations.some((l) => l.id === filterLocationId)) return undefined;
  return { serviceId: null, locationId: filterLocationId };
}
