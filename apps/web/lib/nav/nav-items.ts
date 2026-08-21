import { can, type Role, type Capability } from "@osteojp/auth";
import { s } from "../i18n";

export type NavItem = { href: string; label: string };

// Single source of truth for the primary nav, with the capability that gates
// each link. Dashboard / Agenda / Patients are open to every authenticated
// role; Clinical and Admin are capability-gated. Pure + role-only so it is
// unit-testable (see nav-items.test.ts).
/**
 * NAV-01, 2026-08-18: `hideIfCapability` IS GONE, and it is not an unrelated
 * tidy-up.
 *
 * It existed for exactly ONE entry - Horários, hidden from anyone holding
 * `settings:read` - and that line is the defect this change fixes. With the line
 * removed the option has no user, and an unused "hide this from a MORE
 * privileged role" hook is not inert: it is the shape of the bug, sitting in the
 * type, ready to be reached for again. A nav entry should be gated by whether
 * the role may USE the page, which is what `capability` already answers.
 *
 * If a future surface genuinely needs to be hidden from a superset role, the
 * right move is to say so in a commit that adds the mechanism back WITH its
 * caller, not to find it lying here.
 */
const ALL: (NavItem & { capability?: Capability })[] = [
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
  // Faturação (W10-04 isolation, owner ruling 2026-07-21): owner/admin/reception
  // only - gated on invoices:issue (therapist holds only invoices:read, so it is
  // hidden for the therapist role, matching the /invoicing route guard).
  // Recuperação (RB-01, owner ruling 2026-08-20): the patients recently in
  // treatment with no future booking. Owner, admin and reception, gated on
  // `followup:read` - a THERAPIST sees no entry and cannot reach the route.
  //
  // IT SITS HERE, AFTER MARCAÇÕES, AND NOT LOWER DOWN. NAV-01 ruled that
  // Horários sits BETWEEN Estatísticas and Administração, and nav-items.test.ts
  // asserts that by INDEX because the position was the ruling and not an
  // incidental. Any entry inserted into that run breaks a committed owner
  // ruling, so this one goes beside Marcações instead - which is also where it
  // belongs: it is a reception work queue about bookings that do not exist yet.
  //
  // THE NAV IS NOT THE GATE and is not treated as one here: /recuperacao
  // redirects a role without the capability, and listFollowupCandidates throws
  // for one. Hiding the link is what stops a therapist WONDERING about a page
  // they may not open; it is not what stops them opening it.
  { href: "/recuperacao", label: s["nav.followup"], capability: "followup:read" },
  { href: "/invoicing", label: s["nav.invoicing"], capability: "invoices:issue" },
  { href: "/clinical/review", label: s["nav.review"], capability: "clinical_records:review" },
  // Estatisticas (W6-05; PL-09 Phase 3): KPI dashboard for owner + admin. Gated on
  // statistics:read (owner all-locations; admin scoped to their location in the
  // queries), so the nav item shows for owner + admin (and the
  // route + KPI queries re-enforce it server-side, not nav hiding alone).
  { href: "/estatisticas", label: s["nav.statistics"], capability: "statistics:read" },
  // ==========================================================================
  // Horários. NAV-01, owner ruling 2026-08-18: BETWEEN Estatísticas and
  // Administração, for EVERY role that may reach the page.
  // ==========================================================================
  //
  // WHAT THIS ENTRY USED TO CARRY, and why removing it is the whole change:
  // `hideIfCapability: "settings:read"`. Owner and admin hold `settings:read`,
  // so the ONE entry pointing at /horarios was hidden from exactly the two roles
  // that hold every other capability. The reasoning was sound when written -
  // they manage schedules inside Equipa (/admin/staff), so a second entry read
  // as a duplicate surface - but /horarios has since become the COMPLEX
  // scheduling page (SCHED-03 search, SCHED-04 day-by-day, SCHED-05 the
  // overwrite refusal) and Equipa's horários layer is the simple one. They are
  // not the same surface any more, and the owner could not reach the richer one
  // from his own sidebar at all.
  //
  // ACCESS IS UNCHANGED. `schedule:read` is held by all four roles and
  // horarios/page.tsx redirects anyone without it. This matches the NAV to the
  // ACCESS that already existed; it grants nothing. The simple horários layer
  // inside Administração is untouched.
  //
  // THE ORDER MOVED FOR EVERY ROLE, WHICH IS THE COST OF ONE LIST AND IS SAID
  // OUT LOUD RATHER THAN DISCOVERED. This entry used to sit after Marcações, so
  // therapist and reception saw it mid-sidebar; it now sits here, and since both
  // roles have Estatísticas and Administração hidden, Horários is simply their
  // LAST item. The entry itself is untouched for them - same href, same label,
  // same capability - which is what "the therapist sidebar already shows
  // Horários, leave it" protects. The alternative, a SECOND entry pinned to the
  // old slot for those roles, would put one destination in two nav rows kept
  // apart by inverse conditions, which is the arrangement that drifts.
  { href: "/horarios", label: s["nav.schedule"], capability: "schedule:read" },
  { href: "/admin", label: s["nav.admin"], capability: "settings:read" },
];

export function navItemsForRole(role: Role): NavItem[] {
  return ALL.filter((i) => !i.capability || can(role, i.capability)).map(
    ({ href, label }) => ({ href, label }),
  );
}
