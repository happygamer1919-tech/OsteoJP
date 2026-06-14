"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Email e palavra-passe são obrigatórios." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Plain-language, non-revealing copy (SPEC-staff-screens §11.5): never leak
  // whether the email exists, and never surface a raw auth code or PII.
  if (error) {
    return {
      error: "Não foi possível iniciar sessão. Verifique o email e a palavra-passe.",
    };
  }

  redirect("/dashboard");
}
