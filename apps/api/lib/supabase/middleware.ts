import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request. The per-route patient
// gate (requirePatient) does the AUTHORIZATION; this only keeps the token fresh.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and this call.
  //
  // Use getSession() not getUser(): patient JWTs carry role='patient' (migration
  // 0010 access-token hook). Supabase auth server returns 403 on getUser() for
  // non-standard roles, which causes @supabase/ssr to fire SIGNED_OUT and clear
  // the session cookie — making requirePatient() always 401. getSession() reads
  // the httpOnly cookie directly (Supabase-signed JWT) without a network call.
  await supabase.auth.getSession();

  return supabaseResponse;
}
