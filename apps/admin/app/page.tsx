import { requireOperator } from "@/lib/auth/operator";
import { listTenants, type TenantStatus } from "@/lib/tenants";
import { s } from "@/lib/i18n";
import { logout } from "./logout/actions";
import { setStatusAction } from "./actions";
import { CreateTenantForm } from "./CreateTenantForm";

const STATUS_LABEL: Record<TenantStatus, string> = {
  active: s["superadmin.status.active"],
  suspended: s["superadmin.status.suspended"],
};

// Lisbon-display dates (CLAUDE.md): the DB stores UTC; render in Europe/Lisbon.
const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  dateStyle: "medium",
  timeZone: "Europe/Lisbon",
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const operator = await requireOperator();
  const tenants = await listTenants();
  const { m } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <span aria-hidden="true" className="text-h3 font-semibold tracking-tight">
            <span className="text-brand-teal">Osteo</span>
            <span className="text-brand-magenta">JP</span>
          </span>
          <h1 className="text-body-sm text-text-secondary">{s["superadmin.title"]}</h1>
        </div>
        <form action={logout} className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            {s["superadmin.operatorLabel"]} {operator.email}
          </span>
          <button type="submit" className="rounded border border-border-strong px-3 py-1.5 text-sm">
            {s["superadmin.signOut"]}
          </button>
        </form>
      </header>

      {m === "err" && <p role="alert" className="text-sm text-error">{s["superadmin.statusError"]}</p>}

      <CreateTenantForm />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{s["superadmin.list.title"]}</h2>
        {tenants.length === 0 ? (
          <p className="text-sm text-text-muted">{s["superadmin.list.empty"]}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-2 pr-4 font-medium">{s["superadmin.col.name"]}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{s["superadmin.col.slug"]}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{s["superadmin.col.nif"]}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{s["superadmin.col.status"]}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{s["superadmin.col.created"]}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{s["superadmin.col.actions"]}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const next: TenantStatus = t.status === "active" ? "suspended" : "active";
                return (
                  <tr key={t.id} className="border-b align-top">
                    <td className="py-2 pr-4">{t.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{t.slug}</td>
                    <td className="py-2 pr-4">{t.nif ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          t.status === "active" ? "text-success" : "text-error"
                        }
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{dateFmt.format(t.createdAt)}</td>
                    <td className="py-2 pr-4">
                      <form action={setStatusAction}>
                        <input type="hidden" name="tenantId" value={t.id} />
                        <input type="hidden" name="status" value={next} />
                        <button
                          type="submit"
                          aria-label={`${next === "suspended" ? s["superadmin.action.suspend"] : s["superadmin.action.activate"]} ${t.name}`}
                          className="rounded border border-border-strong px-2 py-1"
                        >
                          {next === "suspended"
                            ? s["superadmin.action.suspend"]
                            : s["superadmin.action.activate"]}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
