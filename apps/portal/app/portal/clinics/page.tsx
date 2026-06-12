import { ArrowRight, MapPin } from 'lucide-react'
import Link from 'next/link'

// Clinic data sourced from osteojp.pt/contactos — kept static, updated on redeploy.
const CLINICS = [
  {
    id: 'linda-a-velha',
    name: 'Linda-a-Velha',
    area: 'Lisboa',
    address: 'Praça Central Plaza, n.º 1 – A',
    postalCode: '2795-246',
    city: 'Linda-a-Velha',
    phone: [
      { number: '+351969472111', display: '969 472 111' },
      { number: '+351214191988', display: '214 191 988' },
    ],
    email: 'clinica.osteojp@gmail.com',
    hours: [
      { days: 'Segunda a Sexta', time: '09:00 – 19:00' },
    ],
    mapsUrl: 'https://maps.google.com/?q=Praça+Central+Plaza+1+Linda-a-Velha+2795-246',
    mapsEmbed: 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3113.0954717325562!2d-9.239672!3d38.715617!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd1ecd103a2cbd2d%3A0x651e1157319a036b!2sOSTEOJP%20osteopatia%2Ffisioterapia!5e0!3m2!1spt-PT!2spt!4v1696348134865!5m2!1spt-PT!2spt',
  },
  {
    id: 'castelo-branco',
    name: 'Castelo Branco',
    area: 'Castelo Branco',
    address: 'R. Fernando Namora, n.º 6',
    postalCode: '6000-140',
    city: 'Castelo Branco',
    phone: [
      { number: '+351969877553', display: '969 877 553' },
      { number: '+351272328221', display: '272 328 221' },
    ],
    email: 'geral.castelobranco@osteojp.pt',
    hours: [
      { days: 'Segunda a Sexta', time: '09:00 – 19:00' },
    ],
    mapsUrl: 'https://maps.google.com/?q=R.+Fernando+Namora+6+Castelo+Branco+6000-140',
    mapsEmbed: 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d6129.073312582797!2d-7.502755!3d39.817384!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd3d5fa6fead6927%3A0x5c7764c668366ac7!2sOsteoJP!5e0!3m2!1spt-PT!2spt!4v1696348085968!5m2!1spt-PT!2spt',
  },
]

export default function ClinicsPage() {
  return (
    <div>
      <h2 className="text-lg font-medium text-text-primary mb-1">As nossas clínicas</h2>
      <p className="text-sm text-text-secondary mb-6">
        Estamos presentes em Linda-a-Velha e Castelo Branco.
      </p>

      <div className="space-y-6">
        {CLINICS.map((clinic) => (
          <article
            key={clinic.id}
            className="bg-surface rounded-xl border border-border overflow-hidden"
            aria-label={`Clínica ${clinic.name}`}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-2 bg-accent-2-100">
              <MapPin size={20} strokeWidth={1.75} aria-hidden="true" className="text-accent-2-800" />
              <div>
                <p className="font-medium text-sm text-accent-2-800">
                  {clinic.name}
                </p>
                <p className="text-xs text-accent-2-800">{clinic.area}</p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Address */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Morada
                </p>
                <address className="not-italic text-sm text-text-primary leading-relaxed">
                  {clinic.address}<br />
                  {clinic.postalCode} {clinic.city}
                </address>
                <a
                  href={clinic.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-medium mt-2 text-accent-2-700"
                  aria-label={`Ver ${clinic.name} no Google Maps`}
                >
                  Ver no mapa
                  <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                </a>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" aria-hidden="true" />

              {/* Phone */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Telefone
                </p>
                <div className="space-y-1">
                  {clinic.phone.map((p) => (
                    <a
                      key={p.number}
                      href={`tel:${p.number}`}
                      className="flex items-center min-h-11 text-sm font-medium text-accent-2-700"
                      aria-label={`Ligar para ${p.display}`}
                    >
                      {p.display}
                    </a>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" aria-hidden="true" />

              {/* Email */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Email
                </p>
                <a
                  href={`mailto:${clinic.email}`}
                  className="text-sm text-accent-2-700"
                >
                  {clinic.email}
                </a>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" aria-hidden="true" />

              {/* Hours */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Horário
                </p>
                {clinic.hours.map((h) => (
                  <div key={h.days} className="flex justify-between text-sm">
                    <span className="text-text-secondary">{h.days}</span>
                    <span className="font-medium text-text-primary">{h.time}</span>
                  </div>
                ))}
                <p className="text-xs text-text-muted mt-1">
                  Sábado e Domingo encerrado
                </p>
              </div>

              {/* CTA */}
              <Link
                href="/portal/booking"
                className="flex w-full items-center justify-center min-h-11 text-center rounded-lg text-sm font-medium text-text-inverse mt-2 bg-accent-2-700"
                aria-label={`Marcar consulta em ${clinic.name}`}
              >
                Marcar consulta aqui
              </Link>
            </div>
          </article>
        ))}
      </div>

      {/* General contact note */}
      <div className="mt-6 bg-surface rounded-xl border border-border p-4">
        <p className="text-sm text-text-secondary leading-relaxed text-center">
          Para urgências ou questões gerais, ligue directamente para a clínica. As marcações online estão disponíveis até 24 horas antes da consulta.
        </p>
      </div>
    </div>
  )
}
