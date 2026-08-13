import { ALL_CLINIC_PHONES } from '@/lib/clinics'
import { s } from '@/lib/i18n'

/**
 * The clinic telephones, as `tel:` links. ONE component, every dead end.
 *
 * WHY IT EXISTS. PG9's DoD asks that a patient-facing dead end give "what
 * happened, what to do, and the clinic's telephone where the answer is 'call
 * us'". The portal's error states said what happened and offered a retry, and
 * a retry is not an answer when the thing that failed keeps failing. The numbers
 * were in the app all along, reachable only by the Clínicas screen.
 *
 * NO SENTENCE IS AUTHORED HERE. The heading is `clinics.phone_label`
 * ("Telefone"), which already existed for the Clínicas screen; the numbers are
 * data from `lib/clinics.ts`. Rendering them is presentation, not copy.
 *
 * EVERY CLINIC'S NUMBER, DELIBERATELY, and it is the same reasoning the login
 * screen uses: an error boundary does not know which clinic the patient belongs
 * to — the read that would have told it is the one that just failed. Narrowing
 * the list would be a guess, and on the login screen it would leak the
 * membership the OTP endpoint refuses to disclose. The numbers are published on
 * osteojp.pt, so showing all of them discloses nothing.
 *
 * `min-h-11` is 44px, the target size PG9 audits for.
 */
export function ClinicPhones({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="mt-3 block text-sm font-medium text-text-primary">
        {s.clinics.phone_label}
      </span>
      <span className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {ALL_CLINIC_PHONES.map((p) => (
          <a
            key={p.number}
            href={`tel:${p.number}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent-2-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {p.display}
          </a>
        ))}
      </span>
    </span>
  )
}
