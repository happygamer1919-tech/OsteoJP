import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { getRequestContext } from "@/lib/auth/context";
import { AppShell } from "@/components/app-shell";

import { AdminNav, type AdminNavItem } from "./admin-nav.client";

const s = getStrings(DEFAULT_LOCALE);

const NAV: AdminNavItem[] = [
  { href: "/admin", label: s["admin.nav.overview"] },
  { href: "/admin/settings", label: s["admin.nav.settings"] },
  { href: "/admin/staff", label: s["admin.nav.staff"] },
  { href: "/admin/working-hours", label: s["admin.nav.workingHours"] },
  { href: "/admin/services", label: s["admin.nav.services"] },
  { href: "/admin/locations", label: s["admin.nav.locations"] },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getRequestContext();
  if (!actor) redirect("/login");
  // Area gate: only roles that can read tenant settings (owner, admin) may
  // enter admin. Each action re-checks its own capability (defense in depth).
  if (!can(actor.role, "settings:read")) redirect("/dashboard");

  // Global nav comes from AppShell; admin keeps its own tab nav for the admin
  // sub-sections (SPEC-v2-admin §1.2: Tabs are the only navigation across admin
  // areas). The title + subtitle (§1.1) sit above the tab row, consistent on
  // every tab; the HeritageFrame wraps the content area via the SidebarAppShell.
  return (
    <AppShell>
      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl text-v2-text-primary">{s["admin.title"]}</h1>
          <p className="text-v2-text-secondary">{s["admin.overview.intro"]}</p>
        </div>
        <AdminNav items={NAV} label={s["admin.title"]} />
        {children}
      </main>
    </AppShell>
  );
}
