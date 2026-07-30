import { can, type Role, type Capability } from "@osteojp/auth";
import { s } from "../i18n";

export type NavItem = { href: string; label: string };

// Single source of truth for the primary nav, with the capability that gates
// each link. Dashboard / Agenda / Patients are open to every authenticated
// role; Clinical and Admin are capability-gated. Pure + role-only so it is
// unit-testable (see nav-items.test.ts).
const ALL: (NavItem & { capability?: Capability; hideIfCapability?: Capability })[] = [
  { href: "/dashboard", label: s["nav.dashboard"] },
  { href: "/agenda", label: s["nav.agenda"] },
  { href: "/patients", label: s["nav.patients"] },
  // Registos Clínicos (fichas) left the top-level nav (ruling F, DECISIONS
  // 2026-07-03): all ficha entry points now live in the patient profile's
  // "Registos clínicos" tab (create + per-ficha addendum). The cross-patient
  // list route at /clinical is kept alive (deep-link/bookmark reachable), just
  // unlinked from primary nav — not orphaned. /clinical/[id] detail deep links
  // are unchanged. The AI review queue (/clinical/review) is a separate section.
  // Marcações (V2-W0-05, SPEC-v2-foundation §7.2): a bookings list of the same
  // scheduling data the agenda renders as a grid; open to every role like the
  // agenda. V2-W7 ships the list view and the dedicated `nav.bookings` key.
  { href: "/marcacoes", label: s["nav.bookings"] },
  // Horários (PL-09 Phase 5): reception manages their location's therapist
  // schedules here. Owner/admin also hold schedule:read but manage schedules
  // inside Equipa (/admin/staff), so hide this entry for them (settings:read) to
  // avoid a duplicate surface — reception is the only role with schedule:read and
  // no settings:read. The route re-enforces schedule:read server-side.
  { href: "/horarios", label: s["nav.schedule"], capability: "schedule:read", hideIfCapability: "settings:read" },
  // Faturação (W10-04 isolation, owner ruling 2026-07-21): owner/admin/reception
  // only - gated on invoices:issue (therapist holds only invoices:read, so it is
  // hidden for the therapist role, matching the /invoicing route guard).
  { href: "/invoicing", label: s["nav.invoicing"], capability: "invoices:issue" },
  { href: "/clinical/review", label: s["nav.review"], capability: "clinical_records:review" },
  // Estatisticas (W6-05; PL-09 Phase 3): KPI dashboard for owner + admin. Gated on
  // statistics:read (owner all-locations; admin scoped to their location in the
  // queries), so the nav item shows for owner + admin (and the
  // route + KPI queries re-enforce it server-side, not nav hiding alone).
  { href: "/estatisticas", label: s["nav.statistics"], capability: "statistics:read" },
  { href: "/admin", label: s["nav.admin"], capability: "settings:read" },
];

export function navItemsForRole(role: Role): NavItem[] {
  return ALL.filter(
    (i) =>
      (!i.capability || can(role, i.capability)) &&
      (!i.hideIfCapability || !can(role, i.hideIfCapability)),
  ).map(({ href, label }) => ({ href, label }));
}
