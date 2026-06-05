import { can, type Role, type Capability } from "@osteojp/auth";
import { s } from "../i18n";

export type NavItem = { href: string; label: string };

// Single source of truth for the primary nav, with the capability that gates
// each link. Dashboard / Agenda / Patients are open to every authenticated
// role; Clinical and Admin are capability-gated. Pure + role-only so it is
// unit-testable (see nav-items.test.ts).
const ALL: (NavItem & { capability?: Capability })[] = [
  { href: "/dashboard", label: s["nav.dashboard"] },
  { href: "/agenda", label: s["nav.agenda"] },
  { href: "/patients", label: s["nav.patients"] },
  { href: "/clinical", label: s["nav.clinical"], capability: "clinical_records:read" },
  { href: "/admin", label: s["nav.admin"], capability: "settings:read" },
];

export function navItemsForRole(role: Role): NavItem[] {
  return ALL.filter((i) => !i.capability || can(role, i.capability)).map(
    ({ href, label }) => ({ href, label }),
  );
}
