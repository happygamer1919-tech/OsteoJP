import { GlassCard, type V2Accent } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { can } from "@osteojp/auth";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  KeyRound,
  MapPin,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { getRequestContext } from "@/lib/auth/context";

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

export default async function AdminOverviewPage() {
  // W12-27: gate the owner-only "Pacientes eliminados" entry exactly as the admin
  // nav does (patients:recover). The layout already guarantees a context + the
  // settings:read area gate before this renders.
  const actor = await getRequestContext();
  const canRecover = !!actor && can(actor.role, "patients:recover");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
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

      {/* W12-27: "Zona de risco" - a collapsed section at the BOTTOM of the admin
          overview consolidating the admin-level destructive entry points (Q-W7-03-1
          ruling, DECISIONS 2026-07-23). Collapsed by default ("not too obvious");
          every control keeps its own server guard + password gate on its route -
          these are navigation links, nothing here weakens a control. Mirrors the
          patient-profile danger-zone disclosure for consistency. */}
      <details className="group rounded-lg border border-error-200 bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" className="text-error" />
            <span className="text-sm font-semibold text-error">{s["admin.dangerZone.title"]}</span>
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden="true"
            className="shrink-0 text-text-secondary transition-transform duration-fast ease-standard group-open:rotate-180"
          />
        </summary>

        <div className="flex flex-col gap-3 border-t border-error-200 p-4">
          {canRecover && (
            <GlassCard href="/admin/pacientes-eliminados" aria-label={s["admin.nav.deletedPatients"]}>
              <div className="flex items-center gap-4">
                <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-error-100 text-error">
                  <Trash2 size={22} strokeWidth={1.75} />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-lg font-medium text-v2-text-primary">{s["admin.nav.deletedPatients"]}</span>
                  <span className="text-sm text-v2-text-secondary">{s["admin.dangerZone.deletedPatientsDesc"]}</span>
                </div>
                <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="ml-auto shrink-0 text-v2-text-secondary" />
              </div>
            </GlassCard>
          )}
          <GlassCard href="/admin/settings" aria-label={s["admin.dangerZone.deletePassword"]}>
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-error-100 text-error">
                <KeyRound size={22} strokeWidth={1.75} />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-medium text-v2-text-primary">{s["admin.dangerZone.deletePassword"]}</span>
                <span className="text-sm text-v2-text-secondary">{s["admin.dangerZone.deletePasswordDesc"]}</span>
              </div>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="ml-auto shrink-0 text-v2-text-secondary" />
            </div>
          </GlassCard>
        </div>
      </details>
    </div>
  );
}
