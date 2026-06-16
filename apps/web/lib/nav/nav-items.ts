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
  // Marcações (V2-W0-05, SPEC-v2-foundation §7.2): a bookings list of the same
  // scheduling data the agenda renders as a grid; open to every role like the
  // agenda. V2-W7 ships the list view and the dedicated `nav.bookings` key.
  { href: "/marcacoes", label: s["nav.bookings"] },
  { href: "/clinical/review", label: s["nav.review"], capability: "clinical_records:review" },
  { href: "/admin", label: s["nav.admin"], capability: "settings:read" },
];

export function navItemsForRole(role: Role): NavItem[] {
  return ALL.filter((i) => !i.capability || can(role, i.capability)).map(
    ({ href, label }) => ({ href, label }),
  );
}
