"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  RULES,
  checkDurableRateLimit,
  clientKeyFromHeaders,
  createDurableRateLimitStore,
  credentialKey,
} from "@osteojp/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

/**
 * SEC-web-surface-limiter-adoption, ROUTE 1: the staff sign-in.
 *
 * ==========================================================================
 * THIS WAS THE HIGHEST-EXPOSURE UNLIMITED ROUTE IN apps/web
 * ==========================================================================
 * The card grades itself medium because the staff surface is AUTHENTICATED,
 * which bounds abuse to named people with an audit trail. **This route is the
 * exception, and it is the thing that does the authenticating.** It is
 * unauthenticated by definition, publicly reachable at app.osteojp.pt/login,
 * and it takes a password.
 *
 * Unlimited, it was a credential-guessing oracle against every staff account,
 * including the owner's, at whatever rate a script could manage. Supabase
 * applies its own protections and they are not ours, not visible from here, and
 * not something to rely on without saying so.
 *
 * ==========================================================================
 * LIMITED AFTER THE SHAPE CHECK, BEFORE THE AUTH CALL
 * ==========================================================================
 * The same ordering `/r/[token]` settled on and for the same reason: a
 * submission with no email or no password is refused above without spending
 * budget, so an attacker cannot exhaust a real person's allowance with garbage
 * that never reaches the auth server.
 *
 * ==========================================================================
 * BOTH AXES ARE CHECKED, AND THE CREDENTIAL ONE IS CHECKED FIRST
 * ==========================================================================
 * Per credential is the tighter limit and the one that protects an ACCOUNT; per
 * source is the looser one that stops an attacker rotating the email to buy a
 * fresh budget per guess. Checking the credential first means a distributed
 * attack on ONE account is refused on the axis that names it, which is the more
 * useful thing to have happened when somebody reads the store afterwards.
 *
 * ==========================================================================
 * A REFUSAL IS INDISTINGUISHABLE FROM A WRONG PASSWORD, DELIBERATELY
 * ==========================================================================
 * It returns the SAME non-revealing sentence, not a "too many attempts" notice.
 * A distinct message would confirm to an attacker that the address they are
 * guessing is worth continuing with - the same reasoning SPEC-staff-screens
 * §11.5 already applies to the wrong-password copy, and it would be undone by
 * announcing the limiter. A real member of staff who hits this waits under a
 * minute and succeeds; nothing about their day changes.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Email e palavra-passe são obrigatórios." };
  }

  // Plain-language, non-revealing copy (SPEC-staff-screens §11.5): never leak
  // whether the email exists, and never surface a raw auth code or PII. Shared
  // by the limiter refusal and the wrong-password refusal on purpose.
  const refused: LoginState = {
    error: "Não foi possível iniciar sessão. Verifique o email e a palavra-passe.",
  };

  const store = createDurableRateLimitStore();
  const h = await headers();

  // Per credential. `credentialKey` hashes and lower-cases: the address itself
  // is never a bucket key, because bucket keys live in a durable store.
  const byCredential = await checkDurableRateLimit(
    credentialKey("staff_login", email),
    RULES.staffLoginCredential,
    store,
  );
  if (!byCredential.ok) return refused;

  // Per source, looser: a clinic behind one NAT at a shift change is ordinary.
  const bySource = await checkDurableRateLimit(
    clientKeyFromHeaders(h, "staff_login_ip"),
    RULES.staffLoginIp,
    store,
  );
  if (!bySource.ok) return refused;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return refused;

  redirect("/dashboard");
}
