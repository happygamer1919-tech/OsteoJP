export default function ClinicsPage() {
  const clinics = [
    {
      name: 'Linda-a-Velha',
      address: 'Praça Central Plaza, n.º 1 – A, 2795-246',
      phone: '969 472 111',
      hours: 'Segunda a sexta, 9h – 20h',
      mapsUrl: 'https://maps.google.com/?q=OsteoJP+Linda-a-Velha',
      services: ['Osteopatia', 'Fisioterapia', 'Massagem', 'Pilates Terapêutico', 'NESA'],
    },
    {
      name: 'Castelo Branco',
      address: 'R. Fernando Namora, n.º 6, 6000-140',
      phone: '969 877 553',
      hours: 'Segunda a sexta, 9h – 19h',
      mapsUrl: 'https://maps.google.com/?q=OsteoJP+Castelo+Branco',
      services: ['Osteopatia', 'Fisioterapia', 'Massagem', 'NESA'],
    },
  ]

  return (
    <div>
      <h1 className="font-medium text-gray-900 text-lg mb-4">As nossas clínicas</h1>
      <div className="space-y-4">
        {clinics.map((clinic) => (
          <div key={clinic.name} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span style={{ color: '#45B9A7' }}>📍</span>
              <h2 className="font-medium text-gray-900">{clinic.name}</h2>
            </div>

            <div className="space-y-2 text-sm text-gray-600 mb-4">
              <p>{clinic.address}</p>
              <p>{clinic.hours}</p>
              <p>
                <a href={`tel:${clinic.phone}`} className="text-teal-600 font-medium">
                  {clinic.phone}
                </a>
              </p>
            </div>

            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Serviços</p>
              <div className="flex flex-wrap gap-1.5">
                {clinic.services.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-100 text-gray-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <a
                href={`tel:${clinic.phone}`}
                className="flex-1 text-center py-2 text-sm rounded-lg border border-gray-200 text-gray-700"
              >
                Ligar
              </a>
              <a
                href={clinic.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2 text-sm rounded-lg text-white font-medium"
                style={{ backgroundColor: '#45B9A7' }}
              >
                Como chegar
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
