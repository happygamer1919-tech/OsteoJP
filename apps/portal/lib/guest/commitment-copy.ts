import { s } from '@/lib/i18n'

/**
 * GUEST-04 — THE CONFIRMATION SCREEN'S COPY IS A COMMITMENT, AND IT IS NOT
 * WRITTEN YET.
 *
 * WHAT THE SCREEN HAS TO SAY. A person who is not a patient has just given the
 * clinic their name and telephone number and asked for an appointment. The next
 * screen tells them what happens now: whether anybody will call, when, and what
 * they should do if nobody does. Every one of those is a PROMISE THE CLINIC IS
 * MAKING, which is the one category of copy this terminal is not allowed to
 * author under the standing microcopy delegation. JP words it.
 *
 * THE GUARD, AND WHY IT IS SHAPED THIS WAY. The keys ship EMPTY, and empty is
 * the state the code must not paper over:
 *
 *   - `guestConfirmationCopy()` THROWS when either key is empty, so the
 *     confirmation screen cannot render a blank promise. A blank screen after a
 *     submit is the worst outcome available here - the person cannot tell
 *     whether their request went anywhere.
 *   - `isGuestConfirmationCopyReady()` is checked by the server action BEFORE it
 *     posts anything, so an unfilled deployment REFUSES THE SUBMIT rather than
 *     writing a row and then failing to acknowledge it. Nothing lands in
 *     reception's queue that the sender was never told about.
 *
 * SO THE FAILURE IS LOUD IN BOTH DIRECTIONS AND SILENT IN NEITHER. The form is
 * fully walkable for the owner's WF-03 acceptance; only the final submit refuses,
 * with the ordinary unavailable copy, until JP's words land. The moment the two
 * keys are filled the whole flow works with no code change.
 *
 * NO DEFAULT, NO PLACEHOLDER, NO `??`. A fallback string here is precisely the
 * one-line convenience PORTAL-REHYDRATE §1.3 is about: it would ship a promise
 * nobody approved, on the screen where the clinic's word is the only thing the
 * person leaves with.
 */

export type GuestConfirmationCopy = { title: string; body: string }

/** The dictionary slice this reads, injectable so tests can supply filled copy. */
export type GuestCopySource = { confirmation_title: string; confirmation_body: string }

export function isGuestConfirmationCopyReady(
  source: GuestCopySource = s.guest,
): boolean {
  return source.confirmation_title.trim() !== '' && source.confirmation_body.trim() !== ''
}

export function guestConfirmationCopy(
  source: GuestCopySource = s.guest,
): GuestConfirmationCopy {
  if (!isGuestConfirmationCopyReady(source)) {
    throw new Error(
      'guest.confirmation_title / guest.confirmation_body are empty. The guest ' +
        'booking confirmation carries a commitment to the person who just wrote ' +
        'to the clinic, and it must be written by JP before this screen can be ' +
        'shown. See the board card GUEST-05-confirmation-copy.',
    )
  }
  return {
    title: source.confirmation_title,
    body: source.confirmation_body,
  }
}
