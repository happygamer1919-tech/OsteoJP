import { parseGuestEmail } from '@osteojp/db/guest-email'

/**
 * THE EMAIL FIELD'S CHECK IN THE BROWSER IS THE SERVER'S OWN FUNCTION.
 *
 * The field used to be `type="email"`, and the browser's check is not ours: by
 * the HTML specification it refuses a non-ASCII local part (`coração@exemplo.pt`),
 * which the server accepts, and it lets through `a@b`, which the server refuses.
 * A visitor with an accent in their address could not send the form at all.
 *
 * So the input is a text field with the email keyboard and autofill hints, and
 * what decides is `parseGuestEmail`, the one rule the server action and the API
 * route call. It is imported from the database package's `./guest-email` entry,
 * which imports nothing: the package's root would bring the `postgres` driver
 * into the browser bundle (see `state.ts` on `GUEST_EMAIL_INPUT_MAX`).
 *
 * THIS IS A CONVENIENCE, NOT THE CHECK. Without JavaScript nothing here runs,
 * and the server action tells the visitor at step 4 exactly as before.
 */

/**
 * The message the browser shows on the field, or '' when the value may be sent.
 * `message` is the form's own "check the details" line, so the visitor reads the
 * same words whichever side noticed.
 */
export function guestEmailFieldMessage(typed: string, message: string): string {
  return parseGuestEmail(typed).ok ? '' : message
}

/** The part of an input this needs, so a suite can hand it a stand-in. */
export type EmailFieldLike = {
  type: string
  value: string
  setCustomValidity: (message: string) => void
}

/**
 * Set the field's validity FROM ITS VALUE AS IT IS NOW. Never from an earlier
 * one: a validity message that outlived the value it was about would stop the
 * form for a visitor who had already corrected the address.
 *
 * It is called from three places, and the third is the one that makes a stale
 * message impossible: when the field mounts or re-renders (a value the page
 * arrived with), on every input event (typing, paste, autofill), and on EVERY
 * CLICK INSIDE THE FORM, in the capture phase, which is before the browser
 * validates. A press of Enter is a click on the default button, so it is
 * covered too. A value changed by something that fires no input event is
 * therefore still judged as it stands when the visitor presses a button.
 *
 * A hidden field (every step but 4) and a missing one are left alone.
 */
export function syncEmailFieldValidity(field: EmailFieldLike | null | undefined, message: string): void {
  if (!field || field.type === 'hidden') return
  field.setCustomValidity(guestEmailFieldMessage(field.value, message))
}
