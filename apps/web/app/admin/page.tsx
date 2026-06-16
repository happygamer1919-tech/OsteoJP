import { GlassCard, type V2Accent } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { Briefcase, Building2, ChevronRight, MapPin, Users, type LucideIcon } from "lucide-react";

const s = getStrings(DEFAULT_LOCALE);

// Icon-circle tints per accent (SPEC-v2-foundation §3.4: 100 tint + 700 icon).
const TINT: Record<V2Accent, string> = {
  green: "bg-v2-green-100 text-v2-green-700",
  blue: "bg-v2-blue-100 text-v2-blue-700",
  lavender: "bg-v2-lavender-100 text-v2-lavender-700",
  gold: "bg-v2-gold-100 text-v2-gold-700",
  burgundy: "bg-v2-burgundy-100 text-v2-burgundy-700",
};

// Resumo cards (SPEC-v2-admin §2): one descriptive card per admin area; clicking
// a card switches to the matching tab. Copy reuses the existing admin.* keys.
const AREAS: Array<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: V2Accent;
}> = [
  { href: "/admin/settings", label: s["admin.nav.settings"], description: s["admin.overview.settingsDesc"], icon: Building2, accent: "green" },
  { href: "/admin/staff", label: s["admin.nav.staff"], description: s["admin.overview.staffDesc"], icon: Users, accent: "blue" },
  { href: "/admin/services", label: s["admin.nav.services"], description: s["admin.overview.servicesDesc"], icon: Briefcase, accent: "lavender" },
  { href: "/admin/locations", label: s["admin.nav.locations"], description: s["admin.overview.locationsDesc"], icon: MapPin, accent: "gold" },
];

export default function AdminOverviewPage() {
  return (
    <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
      {AREAS.map((area) => (
        <GlassCard key={area.href} href={area.href} aria-label={area.label}>
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className={`flex size-12 shrink-0 items-center justify-center rounded-full ${TINT[area.accent]}`}
            >
              <area.icon size={24} strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-lg font-medium text-v2-text-primary">{area.label}</span>
              <span className="text-sm text-v2-text-secondary">{area.description}</span>
            </div>
            <ChevronRight
              size={20}
              strokeWidth={1.75}
              aria-hidden="true"
              className="ml-auto shrink-0 text-v2-text-secondary"
            />
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
