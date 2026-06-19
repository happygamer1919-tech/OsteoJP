import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { s } from '@/lib/i18n'

// Clinic data sourced from osteojp.pt/contactos — kept static, updated on redeploy.
const CLINICS = [
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
    hours: [{ days: 'Segunda a Sexta', time: '09:00 – 19:00' }],
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
    hours: [{ days: 'Segunda a Sexta', time: '09:00 – 19:00' }],
    mapsUrl: 'https://maps.google.com/?q=R.+Fernando+Namora+6+Castelo+Branco+6000-140',
  },
]

const CONTACT_LINK =
  'flex min-h-11 items-center gap-2 text-sm font-medium text-accent-2-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

export default function ClinicsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-text-primary">{s.clinics.title}</h2>
        <p className="text-sm text-text-secondary">
          {s.clinics.subtitle}
        </p>
      </div>

      {CLINICS.map((clinic) => (
        <article
          key={clinic.id}
          aria-label={`Clínica ${clinic.name}`}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-xl text-text-primary">{clinic.name}</h3>
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <MapPin size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
              <span>
                {clinic.address}, {clinic.postalCode} {clinic.city}
              </span>
            </p>
          </div>

          <div className="h-px bg-border" aria-hidden="true" />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-secondary">{s.clinics.contacts_heading}</p>
            {clinic.phone.map((p) => (
              <a key={p.number} href={`tel:${p.number}`} className={CONTACT_LINK} aria-label={`${s.clinics.call} ${p.display}`}>
                <Phone size={16} strokeWidth={1.75} aria-hidden="true" />
                {p.display}
              </a>
            ))}
            <a href={`mailto:${clinic.email}`} className={CONTACT_LINK}>
              <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
              {clinic.email}
            </a>
          </div>

          <div className="h-px bg-border" aria-hidden="true" />

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-secondary">{s.clinics.hours_heading}</p>
            {clinic.hours.map((h) => (
              <div key={h.days} className="flex justify-between text-sm">
                <span className="text-text-secondary">{h.days}</span>
                <span className="font-medium text-text-primary">{h.time}</span>
              </div>
            ))}
            <p className="text-xs text-text-secondary">{s.clinics.weekend_closed}</p>
          </div>

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
