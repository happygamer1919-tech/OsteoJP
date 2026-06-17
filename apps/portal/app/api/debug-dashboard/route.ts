import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: string[] = []

  try {
    const supabase = await createServerClient()
    steps.push('createServerClient: OK')

    const { data, error } = await supabase.auth.getSession()
    if (error) {
      steps.push(`getSession error: ${error.message}`)
    } else if (!data.session) {
      steps.push('getSession: session null')
    } else {
      steps.push(`getSession: OK user=${data.session.user.email}`)
    }
  } catch (e) {
    steps.push(`createServerClient/getSession threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    const all = store.getAll()
    steps.push(`cookies count: ${all.length}`)
    const hasSession = all.some(c => c.name.includes('auth-token'))
    steps.push(`session cookie present: ${hasSession}`)
  } catch (e) {
    steps.push(`cookies threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '(not set)'
    steps.push(`NEXT_PUBLIC_API_URL: ${apiUrl}`)
    const res = await fetch(`${apiUrl}/api/v1/appointments`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    steps.push(`/api/v1/appointments no-cookie: ${res.status}`)
  } catch (e) {
    steps.push(`appointments fetch threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  return NextResponse.json({ steps })
}
