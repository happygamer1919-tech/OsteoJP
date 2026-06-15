import { Card } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { ChevronRight } from "lucide-react";

const s = getStrings(DEFAULT_LOCALE);

// One descriptive settings-row per admin area (SPEC-staff-screens §11.4): title,
// a one-line description of what the area manages, and a trailing ChevronRight.
// These replace the old bare link-box grid; the tab nav stays the navigation.
const AREAS = [
  {
    href: "/admin/settings",
    label: s["admin.nav.settings"],
    description: s["admin.overview.settingsDesc"],
  },
  {
    href: "/admin/staff",
    label: s["admin.nav.staff"],
    description: s["admin.overview.staffDesc"],
  },
  {
    href: "/admin/services",
    label: s["admin.nav.services"],
    description: s["admin.overview.servicesDesc"],
  },
  {
    href: "/admin/locations",
    label: s["admin.nav.locations"],
    description: s["admin.overview.locationsDesc"],
  },
];

export default function AdminOverviewPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl text-text-primary">{s["admin.title"]}</h1>
        <p className="text-sm text-text-secondary">
          {s["admin.overview.intro"]}
        </p>
      </div>

      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        {AREAS.map((area) => (
          <Card key={area.href} href={area.href} aria-label={area.label}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-lg font-semibold text-text-primary">
                  {area.label}
                </span>
                <span className="text-sm text-text-secondary">
                  {area.description}
                </span>
              </div>
              <ChevronRight
                size={20}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 text-text-muted"
              />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
