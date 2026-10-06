import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { s } from '@/lib/i18n'
import { PUBLISHED_CLINIC_CARDS } from '@/lib/clinics'
import { loadClinicCards } from '@/lib/clinics-server'

/**
 * R45 (strategy, 2026-10-06): WHICH CLINICS THIS PAGE SHOWS IS READ, NOT WRITTEN.
 *
 * The cards are the active locations the API offers to patients, so a clinic
 * with nobody bookable yet is not on this page and a new one appears without a
 * change here. What each card SAYS still comes from `lib/clinics.ts`: the
 * published details where the clinic has them, the location's own address and
 * telephone where it does not.
 *
 * DYNAMIC, FOR THE REASON `app/marcacao/page.tsx` RECORDS. Prerendered at build
 * time this page would ask an API that is not there, take the fallback, and
 * bake it: the published list forever, whatever the locations say.
 *
 * WHEN THE LIST CANNOT BE READ the page shows the published clinics, which is
 * what it showed before it could read anything. A contact page that renders
 * nothing because a read failed is the dead end PG9 exists to remove.
 */
export const dynamic = 'force-dynamic'

const CONTACT_LINK =
  'flex min-h-11 items-center gap-2 text-sm font-medium text-accent-2-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export default async function ClinicsPage() {
  const clinics = (await loadClinicCards()) ?? PUBLISHED_CLINIC_CARDS

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-text-primary">{s.clinics.title}</h2>
      </div>

      {clinics.map((clinic) => (
        <article
          key={clinic.id}
          aria-label={s.clinics.clinic_label.replace('{{name}}', () => clinic.name)}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-xl text-text-primary">{clinic.name}</h3>
            {clinic.addressLine && (
              <p className="flex items-center gap-2 text-sm text-text-secondary">
                <MapPin size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                <span>{clinic.addressLine}</span>
              </p>
            )}
          </div>

          {(clinic.phone.length > 0 || clinic.email) && (
            <>
              <div className="h-px bg-border" aria-hidden="true" />

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-text-secondary">{s.clinics.contacts_heading}</p>
                {clinic.phone.map((p) => (
                  <a key={p.number} href={`tel:${p.number}`} className={CONTACT_LINK} aria-label={`${s.clinics.call} ${p.display}`}>
                    <Phone size={16} strokeWidth={1.75} aria-hidden="true" />
                    {p.display}
                  </a>
                ))}
                {clinic.email && (
                  <a href={`mailto:${clinic.email}`} className={CONTACT_LINK}>
                    <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
                    {clinic.email}
                  </a>
                )}
              </div>
            </>
          )}

          {/* HOURS ONLY WHERE THE CLINIC PUBLISHES THEM. A location's opening and
              closing times bound the booking grid and a new row carries
              defaults nobody chose, so they are never shown here as reception
              hours. The "closed at the weekend" line belongs to the same
              published hours and goes with them. */}
          {clinic.weekdayHours && (
            <>
              <div className="h-px bg-border" aria-hidden="true" />

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-text-secondary">{s.clinics.hours_heading}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">{s.clinics.weekdays}</span>
                  <span className="font-medium text-text-primary">{clinic.weekdayHours}</span>
                </div>
                <p className="text-xs text-text-secondary">{s.clinics.weekend_closed}</p>
              </div>
            </>
          )}

          {clinic.mapsUrl && (
            <a
              href={clinic.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${s.clinics.open_in_map} ${clinic.name}`}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border-strong text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {s.clinics.open_in_map}
              <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
            </a>
          )}
        </article>
      ))}

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-center text-sm leading-relaxed text-text-secondary">
          {s.clinics.general_info}
        </p>
      </div>
    </div>
  )
}
