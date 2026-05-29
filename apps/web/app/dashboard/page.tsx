import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { patients } from "@osteojp/db";
import { getRequestContext, runScoped } from "@/lib/auth/context";
import { logout } from "@/app/logout/actions";

export default async function DashboardPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const rows = await runScoped(ctx, (tx) =>
    tx.select({ count: sql<number>`count(*)::int` }).from(patients),
  );
  const patientCount = rows[0]?.count ?? 0;

  return (
    <main className="min-h-dvh p-8 space-y-4">
      <h1 className="text-xl font-semibold">OsteoJP</h1>
      <dl className="space-y-1 text-sm">
        <div><dt className="inline font-medium">Tenant: </dt><dd className="inline">{ctx.tenantId}</dd></div>
        <div><dt className="inline font-medium">Função: </dt><dd className="inline">{ctx.role}</dd></div>
        <div><dt className="inline font-medium">Pacientes visíveis: </dt><dd className="inline">{patientCount}</dd></div>
      </dl>
      <form action={logout}>
        <button type="submit" className="rounded border px-3 py-2 text-sm">Sair</button>
      </form>
    </main>
  );
}
