import Link from "next/link";
import { redirect } from "next/navigation";
import { can, type RequestContext } from "@osteojp/auth";
import { ChevronRight } from "lucide-react";

import { requireRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";

export const metadata = { title: s["statistics.title"] };

/**
 * W8-03 — Estatísticas landing is a two-card CHOOSER. Owner-only, identical gate
 * to the sub-pages (route redirect here + query guard in each report). Nav entry
 * stays "/estatisticas". "Estatísticas" opens the existing dashboard
 * (/estatisticas/painel, unchanged); "Indicadores (KPI)" opens the new KPI
 * section (/estatisticas/indicadores).
 */
export default async function EstatisticasPage() {
  let actor: RequestContext;
  try {
    actor = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  if (!can(actor.role, "statistics:read")) redirect("/dashboard");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl text-v2-text-primary">{s["statistics.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["statistics.chooserSubtitle"]}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChooserCard
          href="/estatisticas/painel"
          title={s["statistics.cardDashboard"]}
          desc={s["statistics.cardDashboardDesc"]}
        />
        <ChooserCard
          href="/estatisticas/indicadores"
          title={s["statistics.cardKpi"]}
          desc={s["statistics.cardKpiDesc"]}
        />
      </div>
    </main>
  );
}

function ChooserCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-6 transition-colors duration-fast ease-standard hover:border-accent-1-400 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      <span className="flex flex-col gap-1">
        <span className="text-lg font-medium text-v2-text-primary">{title}</span>
        <span className="text-sm text-v2-text-secondary">{desc}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-5 shrink-0 text-v2-text-secondary transition-colors group-hover:text-accent-1-700"
      />
    </Link>
  );
}
