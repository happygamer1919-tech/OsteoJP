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
  // sub-sections (§11.4: Tabs are the only navigation across admin areas).
  return (
    <AppShell>
      <main className="px-8 py-6">
        <AdminNav items={NAV} label={s["admin.title"]} />
        {children}
      </main>
    </AppShell>
  );
}
