import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { getRequestContext } from "@/lib/auth/context";
import { AppShell } from "@/components/app-shell";
import { StartConsultation } from "./StartConsultation";

// W4-06 — start-consultation screen (AI recording chain entry). Recording is a
// clinician action: only clinical_records:author roles (therapist/owner) reach
// it; reception/admin are redirected (the server actions re-enforce this).
export default async function ConsultationPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "clinical_records:author")) redirect("/dashboard");

  return (
    <AppShell>
      <main className="px-8 py-6">
        <StartConsultation />
      </main>
    </AppShell>
  );
}
