import { getPortalStrings, type PortalLocale } from '@osteojp/i18n'

import { DEFAULT_PORTAL_LOCALE } from '@/lib/locale'

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
 *
 * ==========================================================================
 * LANG-01, 2026-09-07 — "NOT EMPTY" AND "APPROVED" ARE DIFFERENT QUESTIONS,
 * AND UNTIL NOW ONLY ONE OF THEM WAS ASKED.
 * ==========================================================================
 * THE GUARD ABOVE CHECKS EMPTINESS. That was sufficient for exactly as long as
 * `pt` was the only locale anything rendered, because a non-empty `pt` string
 * could only have got there through GUEST-05, where JP's words were landed
 * character for character and pinned by equality.
 *
 * THE ENGLISH STRINGS ARE NON-EMPTY AND THEIR PROVENANCE IS NOT RECORDED. They
 * arrived in the same commit (#915) whose message verifies only the `pt` pair
 * against the dispatched text, and `commitment-copy.test.ts` says of them, in
 * committed words: "EN is not patient-facing commitment copy in production; it
 * mirrors the meaning so the dictionary has no holes."
 *
 * THAT SENTENCE WAS TRUE BECAUSE NOTHING RENDERED THE EN DICTIONARY. LANG-01
 * makes it false: `/marcacao?lang=en` renders the guest flow in English, so the
 * English confirmation would become patient-facing commitment copy on the
 * clinic's public booking form - authored by nobody the delegation names.
 *
 * SO THE EMPTINESS GUARD WOULD HAVE PASSED IT. A non-empty unratified promise
 * satisfies every assertion in this file, and the screen reports success. That
 * is the exact shape §1.3 is about, one locale over: the cheap property is
 * checked, the expensive one is assumed, and nothing says which was which.
 *
 * THE ANSWER IS AN EXPLICIT LIST, NOT AN INFERENCE. A locale is approved when
 * it is named below and for no other reason. `pt` is named because GUEST-05
 * landed it.
 *
 * ==========================================================================
 * `en` WAS ADDED 2026-09-08. Q-LANG-COPY-1 IS CLOSED, AND BY WHOM MATTERS.
 * ==========================================================================
 * RATIFIED BY STRATEGY, UNDER JP'S STANDING MICROCOPY DELEGATION, ON
 * 2026-09-08. The two Portuguese clauses and the two English ones were read
 * side by side and found to say the same thing: the request has been received
 * and is under review, the appointment is NOT yet confirmed, and the clinic
 * will make contact once it is scheduled. Nothing is promised in one language
 * that is not promised in the other, and nothing is softened.
 *
 * IT IS A RATIFICATION OF A TRANSLATION, NOT AN AUTHORSHIP. The promise is
 * still JP's; what was approved is that the English renders his Portuguese
 * faithfully. If his Portuguese changes, the English is unratified again and
 * this entry comes back out - the list records a decision about a SPECIFIC
 * pair of strings, which is why it names the date the decision was taken.
 *
 * WHAT FLIPPING IT DOES, exactly: `/marcacao?lang=en` can now COMPLETE. Until
 * today the English form was fully walkable and only the final submit refused,
 * so no visitor was ever left holding a promise nobody had made.
 *
 * WHAT AN UNAPPROVED LOCALE ACTUALLY DOES, and it is the behaviour this flow
 * already had for EVERYBODY while JP's Portuguese was outstanding: the form is
 * fully walkable in that language and only the FINAL SUBMIT refuses, with the
 * ordinary `unavailable` message. So the commitment screen is never rendered in
 * a language nobody ratified, the owner can still walk the whole English form
 * on a deployed screen for WF-03, and no visitor is left holding a promise the
 * clinic did not make.
 */

export type GuestConfirmationCopy = { title: string; body: string }

/** The dictionary slice this reads, injectable so tests can supply filled copy. */
export type GuestCopySource = { confirmation_title: string; confirmation_body: string }

/**
 * The locales whose confirmation copy the clinic has RATIFIED.
 *
 * NOT "the locales that have a non-empty string". See the block above. Adding a
 * locale here is a statement that the person who owns the clinic's word
 * approved that text, and it is the only thing that makes the submit legal in
 * that language.
 */
export const GUEST_COPY_APPROVED_LOCALES: readonly PortalLocale[] = ['pt', 'en']

/** Whether the clinic's commitment has been ratified in this language. */
export function isGuestCopyApprovedFor(locale: PortalLocale): boolean {
  return GUEST_COPY_APPROVED_LOCALES.includes(locale)
}

/**
 * The dictionary slice for a locale, so a caller never has to reach for a
 * frozen module constant to get one.
 */
export function guestCopySourceFor(locale: PortalLocale): GuestCopySource {
  return getPortalStrings(locale).guest
}

export function isGuestConfirmationCopyReady(
  source: GuestCopySource = guestCopySourceFor(DEFAULT_PORTAL_LOCALE),
): boolean {
  return source.confirmation_title.trim() !== '' && source.confirmation_body.trim() !== ''
}

export function guestConfirmationCopy(
  source: GuestCopySource = guestCopySourceFor(DEFAULT_PORTAL_LOCALE),
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
