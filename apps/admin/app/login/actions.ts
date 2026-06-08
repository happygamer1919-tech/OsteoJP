"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOperator } from "@/lib/auth/operator";
import { s } from "@/lib/i18n";

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: s["superadmin.login.required"] };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: s["superadmin.login.invalid"] };

  // Authenticated — but only platform operators may proceed. A signed-in
  // non-operator is signed back out so no half-authenticated state lingers.
  const operator = await getOperator();
  if (!operator) {
    await supabase.auth.signOut();
    return { error: s["superadmin.login.notOperator"] };
  }

  redirect("/");
}
