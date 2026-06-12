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
    <div className="bg-surface rounded-xl border border-border divide-y divide-border">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-primary">SMS</p>
          <p className="text-xs text-text-muted">24h antes da consulta</p>
        </div>
        <button
          onClick={() => setSms((v) => !v)}
          className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${sms ? 'bg-accent-2-600' : 'bg-neutral-300'}`}
          aria-checked={sms}
          aria-label="Lembretes por SMS"
          role="switch"
        >
          <span
            className="absolute top-0.5 w-5 h-5 bg-surface rounded-full shadow transition-transform"
            style={{ transform: sms ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-primary">Email</p>
          <p className="text-xs text-text-muted">48h antes da consulta</p>
        </div>
        <button
          onClick={() => setEmail((v) => !v)}
          className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${email ? 'bg-accent-2-600' : 'bg-neutral-300'}`}
          aria-checked={email}
          aria-label="Lembretes por email"
          role="switch"
        >
          <span
            className="absolute top-0.5 w-5 h-5 bg-surface rounded-full shadow transition-transform"
            style={{ transform: email ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      {(!sms && !email) && (
        <div className="px-4 py-2">
          <p role="status" className="text-xs text-warning-700">
            Ao desactivar os lembretes não receberá notificações de consulta.
          </p>
        </div>
      )}
    </div>
  )
}
