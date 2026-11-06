"use server";
import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { parsePackPaymentForm, parseSellPackForm } from "./payments";
import { recordPackPayment } from "./payments-write";
import { sellPack } from "./sell";

/**
 * Server actions for pack payments and "Vender pack". Plain <form action>
 * posts, so they work without JavaScript: each answers with a redirect to the
 * pacote's payment page, carrying `?ok=` or `?erro=<code>`, and the page prints
 * the message for that code. Nothing about the money is put in the URL.
 *
 * The checks here are the courtesy; the boundary is the write functions'
 * `assertCan` and, under them, the pending migration's policies.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paymentsPath(instanceId: string, query: string): string {
  return `/patients/packs/${instanceId}/pagamentos?${query}`;
}

export async function recordPackPaymentAction(form: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const rawId = form.get("instanceId");
  const instanceId = typeof rawId === "string" && UUID.test(rawId.trim()) ? rawId.trim() : null;
  if (!instanceId) redirect("/patients/packs");
  if (!can(actor.role, "pack_payments:record")) redirect(paymentsPath(instanceId, "erro=forbidden"));

  const instanceHasPrice = form.get("instanceHasPrice") === "1";
  const parsed = parsePackPaymentForm(form, { now: new Date(), instanceHasPrice });
  if (!parsed.ok) redirect(paymentsPath(instanceId, `erro=${parsed.error}`));
  if (parsed.value.kind === "correcao" && !can(actor.role, "pack_payments:correct")) {
    redirect(paymentsPath(instanceId, "erro=forbidden"));
  }

  const result = await recordPackPayment(actor, parsed.value);
  redirect(paymentsPath(instanceId, result.ok ? "ok=registado" : `erro=${result.reason}`));
}

export async function sellPackAction(form: FormData): Promise<void> {
  const actor = await requireRequestContext();
  if (!can(actor.role, "pack_payments:record")) redirect("/patients/packs/vender?erro=forbidden");
  const parsed = parseSellPackForm(form);
  const rawPatient = form.get("patientId");
  const patientQs =
    typeof rawPatient === "string" && UUID.test(rawPatient.trim()) ? `&patient=${rawPatient.trim()}` : "";
  if (!parsed.ok) redirect(`/patients/packs/vender?erro=${parsed.error}${patientQs}`);

  const result = await sellPack(actor, parsed.value);
  if (!result.ok) redirect(`/patients/packs/vender?erro=${result.reason}${patientQs}`);
  redirect(paymentsPath(result.instanceId, "ok=vendido"));
}
