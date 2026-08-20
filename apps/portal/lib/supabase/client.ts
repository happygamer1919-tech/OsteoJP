import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'

import { supabaseUrl, supabaseAnonKey } from './env'

export function createBrowserClient() {
  return _createBrowserClient(
    // LE-env-sweep-scope: read through the ONE owner, so a missing variable is
    // NAMED in the log before @supabase/ssr throws its generic message. The
    // throw is unchanged - it already fires on the empty string these return.
    supabaseUrl(),
    supabaseAnonKey()
  )
}
