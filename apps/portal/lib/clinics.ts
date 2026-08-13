/**
 * The clinic contact details, in ONE place.
 *
 * WHY THIS FILE EXISTS. PG9's DoD asks that a patient-facing dead end give
 * "what happened, what to do, and the clinic's telephone where the answer is
 * 'call us'". Five patient-facing strings already say **"contacte a clínica"** —
 * `otp_no_phone`, `otp_landline`, `otp_shared_number`, `otp_refused`,
 * `otp_unavailable` — and none of them, nor any screen showing them, gave a
 * number. The portal HAD the numbers all along, hardcoded inside
 * `app/portal/clinics/page.tsx`, where only the Clínicas screen could reach them.
 *
 * TELLING A PATIENT TO CALL WITHOUT SAYING WHAT TO CALL IS THE DEFECT. A patient
 * locked out of the portal — no mobile on record, a landline, a shared number —
 * is exactly who reads that copy, and they cannot act on it. Decision D's
 * degradation copy exists to prevent that dead end, and it was one datum short.
 *
 * THIS IS A MOVE, NOT NEW DATA. Every value below is copied verbatim from the
 * page that held them; `clinics/page.tsx` now imports from here and renders
 * exactly what it rendered before. Nothing is invented, and no patient-facing
 * sentence is authored anywhere in this change — the numbers are rendered under
 * `clinics.phone_label` ("Telefone"), a string that already exists.
 *
 * Source of record remains osteojp.pt/contactos; static, updated on redeploy,
 * unchanged from the previous comment on this data.
 */

export type ClinicPhone = {
  /** E.164, for the `tel:` href. */
  number: string
  /** Grouped for reading, as the Clínicas screen already displays it. */
  display: string
}

export type Clinic = {
  id: string
  name: string
  address: string
  postalCode: string
  city: string
  phone: ClinicPhone[]
  email: string
  mapsUrl: string
}

/** Both clinics, in the order the Clínicas screen has always listed them. */
export const CLINIC_CONTACTS: Clinic[] = [
  {
    id: 'linda-a-velha',
    name: 'Linda-a-Velha',
    address: 'Praça Central Plaza, n.º 1 – A',
    postalCode: '2795-246',
    city: 'Linda-a-Velha',
    phone: [
      { number: '+351969472111', display: '969 472 111' },
      { number: '+351214191988', display: '214 191 988' },
    ],
    email: 'clinica.osteojp@gmail.com',
    mapsUrl: 'https://maps.google.com/?q=Praça+Central+Plaza+1+Linda-a-Velha+2795-246',
  },
  {
    id: 'castelo-branco',
    name: 'Castelo Branco',
    address: 'R. Fernando Namora, n.º 6',
    postalCode: '6000-140',
    city: 'Castelo Branco',
    phone: [
      { number: '+351969877553', display: '969 877 553' },
      { number: '+351272328221', display: '272 328 221' },
    ],
    email: 'geral.castelobranco@osteojp.pt',
    mapsUrl: 'https://maps.google.com/?q=R.+Fernando+Namora+6+Castelo+Branco+6000-140',
  },
]

/**
 * Every clinic telephone, flattened, for surfaces that must offer "call us"
 * without knowing which clinic the patient belongs to.
 *
 * THE LOGIN SCREEN IS EXACTLY THAT CASE, and deliberately so: it runs BEFORE
 * authentication, so it does not know who the patient is and must not appear to.
 * Showing every clinic's number discloses nothing — the numbers are published on
 * osteojp.pt — and it is the only honest thing a screen with no identity can do.
 */
export const ALL_CLINIC_PHONES: ClinicPhone[] = CLINIC_CONTACTS.flatMap((c) => c.phone)
