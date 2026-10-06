/**
 * The clinic contact details a patient is shown, in ONE place.
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
 * ==========================================================================
 * R45 (strategy, 2026-10-06): WHICH CLINICS IS NO LONGER DECIDED HERE
 * ==========================================================================
 * This file used to BE the list: two clinics, written out. The Clínicas page,
 * the telephones on the login screen and on the public form, and the footer
 * now take their list from the ACTIVE LOCATIONS the API offers to patients
 * (`lib/clinics-server.ts`), so a clinic the owner adds in Administração >
 * Locais appears once somebody bookable works there, and one he archives
 * leaves, with no change to this file.
 *
 * WHAT STAYS HERE IS WHAT A LOCATION ROW CANNOT HOLD. A row has one address
 * line and one telephone. The clinic publishes more than that for each of the
 * two it had when this was written: a second number, an email address, a map
 * link and the reception hours. Those are kept below, keyed by the short code
 * in the row's name, and shown IN PLACE OF the row's own address and telephone
 * when the code is known. So for those clinics an edit to the address or the
 * telephone in Administração > Locais does not reach the portal; it still
 * needs a change here. A location with no entry here is shown from its row
 * alone: its name, its address and its telephone, and nothing this file would
 * have to guess.
 *
 * AND THE LIST A SCREEN FALLS BACK ON WHEN IT CANNOT ASK. An error boundary
 * renders because a read failed, and the login screen must still give a number
 * when the API does not answer. `PUBLISHED_CLINIC_PHONES` and
 * `PUBLISHED_CLINIC_CARDS` are that fallback. They can be stale by exactly one
 * redeploy; an empty "call us" cannot be acted on at all.
 *
 * Source of record for the published details remains osteojp.pt/contactos.
 */
import { locationDisplayName, locationShortCode } from './locationLabel'

export type ClinicPhone = {
  /** E.164, for the `tel:` href. */
  number: string
  /** Grouped for reading, as the Clínicas screen already displays it. */
  display: string
}

/** One clinic as a patient-facing screen shows it. */
export type ClinicCard = {
  /** The location's id, or the short code on the fallback list. A React key. */
  id: string
  /** The patient-facing name: `locationDisplayName` of the stored one. */
  name: string
  /** One line. Null when the clinic has none on file. */
  addressLine: string | null
  phone: ClinicPhone[]
  email: string | null
  mapsUrl: string | null
  /**
   * The weekday reception hours the clinic publishes, or null. NEVER DERIVED
   * from a location's `opens_at` and `closes_at`: those bound the booking grid,
   * and a new row carries defaults nobody chose. A clinic with no published
   * hours shows no hours.
   */
  weekdayHours: string | null
}

/** What the API's public catalogue says about one location. */
export type ClinicLocation = {
  id: string
  name: string
  /** Absent from an API deployed before R45; treated as null. */
  address?: string | null
  phone?: string | null
}

type PublishedDetails = Omit<ClinicCard, 'id' | 'name'>

/**
 * Keyed by the short code a location's stored name ends in. Every value is
 * copied verbatim from the Clínicas page as it stood: this is a move, not new
 * data.
 */
const PUBLISHED_BY_CODE: Record<string, PublishedDetails> = {
  LV: {
    addressLine: 'Praça Central Plaza, n.º 1 – A, 2795-246 Linda-a-Velha',
    mapsUrl: 'https://maps.google.com/?q=Praça+Central+Plaza+1+Linda-a-Velha+2795-246',
    phone: [
      { number: '+351969472111', display: '969 472 111' },
      { number: '+351214191988', display: '214 191 988' },
    ],
    email: 'clinica.osteojp@gmail.com',
    weekdayHours: '09:00 – 19:00',
  },
  CB: {
    addressLine: 'R. Fernando Namora, n.º 6, 6000-140 Castelo Branco',
    mapsUrl: 'https://maps.google.com/?q=R.+Fernando+Namora+6+Castelo+Branco+6000-140',
    phone: [
      { number: '+351969877553', display: '969 877 553' },
      { number: '+351272328221', display: '272 328 221' },
    ],
    email: 'geral.castelobranco@osteojp.pt',
    weekdayHours: '09:00 – 19:00',
  },
}

const groupNational = (nine: string) => `${nine.slice(0, 3)} ${nine.slice(3, 6)} ${nine.slice(6)}`

/**
 * The telephone numbers in a location's free-text `phone` field, as `tel:`
 * links.
 *
 * THE FIELD IS WHAT SOMEBODY TYPED, 32 characters of it: "969 472 111",
 * "+351 969 472 111", or two numbers with a slash between them. Each piece is
 * read as a Portuguese number (nine digits, with or without the 351) or as an
 * international one (a leading + or 00). Pieces are separated by a slash, a
 * comma, a semicolon, a bar, a new line, a dash, a spaced hyphen, or "e" /
 * "ou". An unspaced hyphen stays inside its number ("969-472-111"). A PIECE THAT IS NEITHER IS LEFT OUT
 * rather than rendered as a link that dials nothing, which is the same dead
 * end one layer down.
 */
export function parseClinicPhones(raw: string | null | undefined): ClinicPhone[] {
  if (!raw) return []
  const out: ClinicPhone[] = []
  for (const piece of raw.split(/[/,;|\n]|\s*[–—]\s*|\s+-\s+|\s+(?:ou|e)\s+/i)) {
    const text = piece.trim()
    if (!text) continue
    let digits = text.replace(/\D/g, '')
    let number: string | null = null
    if (text.startsWith('+') || digits.startsWith('00')) {
      if (digits.startsWith('00')) digits = digits.slice(2)
      // A Portuguese number written with its country code is 351 and nine
      // digits, no fewer: "+351 969 472" is a typing slip, not a number.
      const wellFormed = digits.startsWith('351')
        ? digits.length === 12
        : digits.length >= 8 && digits.length <= 15
      if (wellFormed) number = `+${digits}`
    } else if (digits.length === 9 && !digits.startsWith('351')) {
      // Nine digits that begin 351 are a country code and six digits of a
      // number, not a number: no Portuguese range starts there.
      number = `+351${digits}`
    } else if (digits.length === 12 && digits.startsWith('351')) {
      number = `+${digits}`
    }
    if (!number || out.some((p) => p.number === number)) continue
    const national = /^\+351\d{9}$/.test(number) ? number.slice(4) : null
    out.push({ number, display: national ? groupNational(national) : text })
  }
  return out
}

/**
 * The card for one location the API listed.
 *
 * A KNOWN SHORT CODE GETS THE PUBLISHED DETAILS, whole, and the row's own
 * address and telephone are not mixed in: the published entry is the fuller of
 * the two and mixing them would print one number twice in two formats. An
 * unknown one gets its row and nothing else.
 */
export function clinicCardFor(location: ClinicLocation): ClinicCard {
  const name = locationDisplayName(location.name) ?? location.name
  const code = publishedCodeOf(location.name)
  if (code) return { id: location.id, name, ...PUBLISHED_BY_CODE[code]! }

  const addressLine = location.address?.trim() || null
  return {
    id: location.id,
    name,
    addressLine,
    phone: parseClinicPhones(location.phone),
    email: null,
    mapsUrl: addressLine ? `https://maps.google.com/?q=${encodeURIComponent(addressLine)}` : null,
    weekdayHours: null,
  }
}

/**
 * The published entry a stored location name selects, or null.
 *
 * THE BRAND AND THE CODE, NOTHING LOOSER. `locationDisplayName` expands any
 * name that ENDS in a known code, which is right for a label. This selects a
 * clinic's telephones and email, so it asks for the whole convention, "OsteoJP
 * (LV)": a location somebody named "Sala de testes (LV)" must not be handed a
 * real clinic's contact details.
 */
function publishedCodeOf(name: string): string | null {
  if (!/^\s*OsteoJP\s*\([A-Za-z]+\)\s*$/i.test(name)) return null
  const code = locationShortCode(name)
  return code && Object.hasOwn(PUBLISHED_BY_CODE, code) ? code : null
}

/**
 * The cards for the locations the API listed, in the order a patient reads them.
 *
 * THE CLINICS WITH PUBLISHED DETAILS FIRST, IN THE ORDER OF THAT TABLE, then the
 * rest in the API's order (by stored name). The table's order is the order the
 * Clínicas screen has always had; the API sorts by the STORED name, which would
 * put "OsteoJP (CB)" ahead of "OsteoJP (LV)" and so reorder the page, the login
 * telephones and both footers for no reason a patient could see. It is also
 * the fallback list's order, so the page reads the same whether or not the
 * list could be read.
 */
export function clinicCardsFor(locations: readonly ClinicLocation[]): ClinicCard[] {
  const codes = Object.keys(PUBLISHED_BY_CODE)
  const rank = (l: ClinicLocation) => {
    const at = codes.indexOf(publishedCodeOf(l.name) ?? '')
    return at === -1 ? codes.length : at
  }
  return locations
    .map((location, index) => ({ location, index }))
    .sort((a, b) => rank(a.location) - rank(b.location) || a.index - b.index)
    .map(({ location }) => clinicCardFor(location))
}

/** Every telephone on a list of cards, once each, in the order of the cards. */
export function phonesOf(cards: readonly ClinicCard[]): ClinicPhone[] {
  const out: ClinicPhone[] = []
  for (const p of cards.flatMap((c) => c.phone)) {
    if (!out.some((seen) => seen.number === p.number)) out.push(p)
  }
  return out
}

/**
 * The clinics with published details, as cards, FOR WHEN THE LIST CANNOT BE
 * READ. In the order the Clínicas screen has always listed them. Named through
 * the same label rule as a live card, so the two cannot spell a clinic two ways.
 */
export const PUBLISHED_CLINIC_CARDS: ClinicCard[] = Object.entries(PUBLISHED_BY_CODE).map(
  ([code, details]) => ({
    id: code,
    name: locationDisplayName(`OsteoJP (${code})`) ?? code,
    ...details,
  }),
)

/**
 * Every published clinic telephone, flattened, for the surfaces that must offer
 * "call us" without asking anything: the error boundaries, which render because
 * a read just failed, and the login screen when the list cannot be read.
 *
 * Showing every clinic's number discloses nothing — the numbers are published
 * on osteojp.pt — and it is the only honest thing a screen with no identity can
 * do.
 */
export const PUBLISHED_CLINIC_PHONES: ClinicPhone[] = phonesOf(PUBLISHED_CLINIC_CARDS)
