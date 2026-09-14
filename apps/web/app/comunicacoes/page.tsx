import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { commsSectionsForRole } from "@/lib/nav/comms-sections";

/**
 * COMMS-01 (owner dispatch 2026-09-14): the Comunicações sidebar entry lands
 * here and is sent to the first section this viewer may open - Recuperação for
 * every role that holds it, Lembretes SMS otherwise. A viewer who may open
 * neither is sent home, matching every other gated route (a redirect, not a
 * 403).
 */
export default async function ComunicacoesPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  const [first] = commsSectionsForRole(ctx.role);
  redirect(first ? first.href : "/");
}
