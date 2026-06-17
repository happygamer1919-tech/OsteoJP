import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getMyAppointments } from '@/lib/api/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: string[] = []

  try {
    const supabase = await createServerClient()
    steps.push('createServerClient: OK')

    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) steps.push(`getSession error: ${error.message}`)
      else if (!session) steps.push('getSession: session null (no cookie?)')
      else steps.push(`getSession: OK user=${session.user.email} role=${JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()).role}`)
    } catch (e) {
      steps.push(`getSession threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  } catch (e) {
    steps.push(`createServerClient threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const appts = await getMyAppointments()
    steps.push(`getMyAppointments: OK count=${appts.length}`)
  } catch (e) {
    steps.push(`getMyAppointments threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  return NextResponse.json({ steps })
}
