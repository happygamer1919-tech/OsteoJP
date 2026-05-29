import { redirect } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { getActor } from "@/lib/auth/context";

const s = getStrings(DEFAULT_LOCALE);

const NAV = [
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
  const actor = await getActor();
  if (!actor) redirect("/login");
  // Area gate: only roles that can read tenant settings (owner, admin) may
  // enter admin. Each action re-checks its own capability (defense in depth).
  if (!can(actor.role, "settings:read")) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="flex items-center justify-between px-8 py-4">
          <h1 className="text-lg font-semibold">{s["admin.title"]}</h1>
          <Link href="/dashboard" className="text-sm underline">
            {s["nav.dashboard"]}
          </Link>
        </div>
        <nav className="flex gap-4 px-8 pb-3 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="px-8 py-6">{children}</main>
    </div>
  );
}
