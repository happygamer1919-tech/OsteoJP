import Link from "next/link";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";

const s = getStrings(DEFAULT_LOCALE);

const CARDS = [
  { href: "/admin/settings", label: s["admin.nav.settings"] },
  { href: "/admin/staff", label: s["admin.nav.staff"] },
  { href: "/admin/services", label: s["admin.nav.services"] },
  { href: "/admin/locations", label: s["admin.nav.locations"] },
];

export default function AdminOverviewPage() {
  return (
    <section className="space-y-4">
      <p className="text-sm text-text-secondary">{s["admin.overview.intro"]}</p>
      <ul className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        {CARDS.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded border px-4 py-3 text-sm font-medium hover:bg-surface-muted"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
