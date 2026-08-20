import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { supabaseUrl, supabaseAnonKey } from './env'

export async function createServerClient() {
  const cookieStore = await cookies()

  return _createServerClient(
    // LE-env-sweep-scope: see the note in client.ts. One owner, named log,
    // the library throw unchanged.
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — cookies set in middleware
          }
        },
      },
    }
  )
}
