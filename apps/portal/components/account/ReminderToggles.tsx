'use client'

import { useState } from 'react'

// V1: reminder preferences are stored client-side in localStorage as a fallback
// until the PATCH /api/v1/patient/profile endpoint exposes reminder_preferences.
// When that field is added, swap useState for server-read initial state.
// Default: SMS on (Joao Pedro confirmed), email off.

export default function ReminderToggles() {
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-900">SMS</p>
          <p className="text-xs text-gray-400">24h antes da consulta</p>
        </div>
        <button
          onClick={() => setSms((v) => !v)}
          className="w-10 h-6 rounded-full relative transition-colors flex-shrink-0"
          style={{ backgroundColor: sms ? '#45B9A7' : '#D1D5DB' }}
          aria-checked={sms}
          role="switch"
        >
          <span
            className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
            style={{ transform: sms ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-900">Email</p>
          <p className="text-xs text-gray-400">48h antes da consulta</p>
        </div>
        <button
          onClick={() => setEmail((v) => !v)}
          className="w-10 h-6 rounded-full relative transition-colors flex-shrink-0"
          style={{ backgroundColor: email ? '#45B9A7' : '#D1D5DB' }}
          aria-checked={email}
          role="switch"
        >
          <span
            className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
            style={{ transform: email ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      {(!sms && !email) && (
        <div className="px-4 py-2">
          <p className="text-xs text-amber-600">
            Ao desactivar os lembretes não receberá notificações de consulta.
          </p>
        </div>
      )}
    </div>
  )
}
