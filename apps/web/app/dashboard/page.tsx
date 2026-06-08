import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { patients } from "@osteojp/db";
import { s } from "@/lib/i18n";
import { getRequestContext, runScoped } from "@/lib/auth/context";
import { activePatientsOnly } from "@/lib/patients/filters";

export default async function DashboardPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  // BUG-12: exclude soft-deleted patients so the count reflects active patients
  // (deleted_at IS NULL), matching the patients list/search.
  const rows = await runScoped(ctx, (tx) =>
    tx
      .select({ count: sql<number>`count(*)::int` })
      .from(patients)
      .where(activePatientsOnly),
  );
  const patientCount = rows[0]?.count ?? 0;

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-h2 font-semibold text-text-primary">{s["nav.dashboard"]}</h1>
      <dl className="max-w-md space-y-2 rounded-lg border border-border bg-surface p-6 text-body-sm">
        <div className="flex justify-between gap-4">
          <dt className="font-medium text-text-secondary">Tenant</dt>
          <dd className="text-text-primary">{ctx.tenantId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-medium text-text-secondary">Função</dt>
          <dd className="text-text-primary">{ctx.role}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-medium text-text-secondary">Pacientes visíveis</dt>
          <dd className="font-semibold text-brand-teal">{patientCount}</dd>
        </div>
      </dl>
    </main>
  );
}
