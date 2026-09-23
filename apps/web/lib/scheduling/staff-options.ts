// NESA-SCOPE - two staff rows may share one display name, and a staff selector
// must still say which one it offers. Pure and client-safe (no "server-only"):
// the server builds the directory lists with it and the booking drawer re-runs
// it for the one option it may have to synthesise from an appointment row.
//
// THE CASE THAT MADE THIS NECESSARY is a shared resource installed at each
// clinic under the same name: one users row per machine, one clinic each. A
// viewer who belongs to ONE clinic is offered only that clinic's row; a viewer
// who can see BOTH is offered both, each with its clinic code suffixed.
//
// DISPLAY ONLY. Nothing here renames a staff row, and nothing it returns may be
// written back: selects and filters carry ids, and the Equipa rename field keeps
// the raw name. SMS, PDF and portal renderings never call this.
//
// THE RULE, applied only inside a group of options whose normalised label
// (trimmed, inner whitespace collapsed, lower case) repeats:
//   1. A member is SHOWN when it has a clinic among the viewer's, when it has no
//      clinic at all (PL-14 keeps an unassigned colleague visible, and so does
//      this), or when it is the current value (`keepId`). Any other member is
//      dropped.
//   2. When more than one member is shown, each gets " (CODE)" from its clinics
//      the viewer has (all its clinics, for a kept member outside them). The
//      suffix depends on the VIEWER, not on the list a caller narrows later, so
//      a two-clinic viewer reads "NESA (CB)" in a drawer already scoped to CB.
//   3. When every shown member would get the SAME suffix (two people with one
//      name at one clinic), no suffix is added: it would distinguish nothing,
//      and a label that only looks disambiguated is worse than an honest
//      duplicate. Both stay listed; the helper never drops a member for sharing
//      a clinic.
// Options whose name is unique come back as the SAME objects, so no other label
// on any screen moves.

import type { SharedResource } from "./shared-resource-guard";
import type { AgendaOptions } from "./types";

export type StaffOption = { id: string; label: string };

export type StaffLabelContext = {
  /** The clinics the viewer belongs to: every active clinic for the owner. */
  viewerClinicIds: readonly string[];
  /** Staff id -> the clinic ids that staff member is assigned to. */
  assignments: ReadonlyMap<string, readonly string[]>;
  /** Clinic id -> its short code (see `clinicCode`). */
  clinicCodeById: ReadonlyMap<string, string>;
  /** The current value of the control, always kept. */
  keepId?: string | null;
};

const TRAILING_PARENTHETICAL = /\(([^()]*)\)\s*$/;

/**
 * "OsteoJP (CB)" -> "CB". A name with no trailing parenthetical is its own
 * code, so a clinic called "Linda-a-Velha" suffixes as "(Linda-a-Velha)" rather
 * than as nothing. Same idea as the portal's location label, without its
 * letters-only restriction.
 */
export function clinicCode(locationName: string): string {
  const name = locationName.trim();
  const inner = TRAILING_PARENTHETICAL.exec(name)?.[1]?.trim();
  return inner ? inner : name;
}

export function clinicCodeMap(
  locations: readonly { id: string; label: string }[],
): Map<string, string> {
  return new Map(locations.map((l) => [l.id, clinicCode(l.label)]));
}

function collisionKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function suffixFor(
  id: string,
  ctx: Omit<StaffLabelContext, "keepId">,
  viewer: ReadonlySet<string>,
): string {
  const assigned = ctx.assignments.get(id) ?? [];
  const mine = assigned.filter((l) => viewer.has(l));
  const codes = new Set<string>();
  for (const l of mine.length > 0 ? mine : assigned) {
    const code = ctx.clinicCodeById.get(l);
    if (code) codes.add(code);
  }
  return [...codes].sort().join(", ");
}

function resolve<T extends StaffOption>(
  options: readonly T[],
  ctx: Omit<StaffLabelContext, "keepId">,
  kept: (id: string) => boolean,
): T[] {
  const groups = new Map<string, T[]>();
  for (const o of options) {
    const key = collisionKey(o.label);
    const group = groups.get(key);
    if (group) group.push(o);
    else groups.set(key, [o]);
  }

  const viewer = new Set(ctx.viewerClinicIds);
  const dropped = new Set<T>();
  const relabelled = new Map<T, string>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const shown = members.filter((m) => {
      const assigned = ctx.assignments.get(m.id) ?? [];
      return assigned.length === 0 || assigned.some((l) => viewer.has(l)) || kept(m.id);
    });
    for (const m of members) if (!shown.includes(m)) dropped.add(m);
    if (shown.length < 2) continue;
    const suffixes = shown.map((m) => suffixFor(m.id, ctx, viewer));
    if (new Set(suffixes).size < 2) continue;
    shown.forEach((m, i) => {
      if (suffixes[i]) relabelled.set(m, `${m.label.trim()} (${suffixes[i]})`);
    });
  }

  return options
    .filter((o) => !dropped.has(o))
    .map((o) => {
      const label = relabelled.get(o);
      return label === undefined ? o : { ...o, label };
    });
}

/**
 * The selector and directory rule: drop the colliding rows this viewer does
 * not belong with (except `keepId`), suffix the survivors when more than one
 * remains. Order is preserved.
 */
export function resolveStaffCollisions<T extends StaffOption>(
  options: readonly T[],
  ctx: StaffLabelContext,
): T[] {
  return resolve(options, ctx, (id) => !!ctx.keepId && id === ctx.keepId);
}

/**
 * The same labels with NOTHING dropped: for a list whose every row is already
 * on screen for a reason of its own (a revenue breakdown row is a fact about
 * money, and an option synthesised from the appointment being edited is the
 * value in effect). Hiding one of those would be a wrong total or a select
 * painting another option than the one it submits.
 */
export function labelStaffCollisions<T extends StaffOption>(
  options: readonly T[],
  ctx: Omit<StaffLabelContext, "keepId">,
): T[] {
  return resolve(options, ctx, () => true);
}

/**
 * The context a client surface rebuilds from AgendaOptions, or null when the
 * options predate NESA-SCOPE (a test mock, a host that does not pass them), in
 * which case callers leave labels exactly as they came.
 */
export function staffLabelContext(
  options: Pick<AgendaOptions, "viewerClinicIds" | "clinicCodes" | "therapistLocationIds">,
): Omit<StaffLabelContext, "keepId"> | null {
  if (!options.viewerClinicIds || !options.clinicCodes) return null;
  return {
    viewerClinicIds: options.viewerClinicIds,
    assignments: new Map(Object.entries(options.therapistLocationIds ?? {})),
    clinicCodeById: new Map(Object.entries(options.clinicCodes)),
  };
}

/**
 * The agenda page's two staff sources, made to agree.
 *
 * The bookable roster comes from the 60-second reference cache; the machines
 * come from a per-request read (SCHED-29.4). A machine flagged bookable is in
 * BOTH. Three things follow:
 *   - a machine the viewer is NOT offered never enters the booking pool, and
 *     leaves the filter lists too unless it is installed at one of the viewer's
 *     clinics, so it cannot come back through the bookable flag;
 *   - where a machine is installed is taken from the per-request read, for the
 *     labels and for the drawer's location scoping alike, so a machine moved in
 *     Equipa is not labelled by the cached map for another minute;
 *   - labels are resolved over the UNION, so a bookable twin and a non-bookable
 *     twin still suffix each other instead of reading "NESA" beside "NESA (LV)".
 */
export function reconcileAgendaStaff(args: {
  options: Pick<
    AgendaOptions,
    "therapists" | "allTherapists" | "therapistLocationIds" | "viewerClinicIds" | "clinicCodes"
  >;
  tenantResources: readonly SharedResource[];
  offered: readonly SharedResource[];
}): Required<
  Pick<AgendaOptions, "therapists" | "allTherapists" | "therapistLocationIds" | "sharedResources">
> {
  const { options } = args;
  const offeredIds = new Set(args.offered.map((r) => r.id));
  const notOffered = new Set(args.tenantResources.map((r) => r.id).filter((id) => !offeredIds.has(id)));
  // TWO RULES, BECAUSE THE TWO LISTS ANSWER DIFFERENT QUESTIONS.
  // `therapists` feeds READ surfaces (the Terapeutas filter, Bloquear horario):
  // a machine leaves it only when it is neither offered nor installed at any
  // clinic the viewer belongs to. An unassigned admin or reception is offered
  // no machine to book (SCHED-29.4), but their viewer clinics are every active
  // clinic, so a bookable machine stays in their filter, as it does on
  // Marcacoes and Horarios for the same viewer.
  // `allTherapists` is the BOOKING drawer's pool: a machine the viewer is not
  // offered never enters it, so the drawer cannot offer (or, for Terapeuta 2,
  // save) a machine the booking permission would not allow. The appointment
  // being edited keeps its own machine through keepCurrent, from the row.
  const viewerClinics = options.viewerClinicIds ? new Set(options.viewerClinicIds) : null;
  const hiddenFromFilters = new Set(
    args.tenantResources
      .filter((r) => notOffered.has(r.id))
      .filter((r) => !viewerClinics || !r.locationIds.some((l) => viewerClinics.has(l)))
      .map((r) => r.id),
  );
  const therapists = options.therapists.filter((o) => !hiddenFromFilters.has(o.id));
  const allTherapists = (options.allTherapists ?? options.therapists).filter((o) => !notOffered.has(o.id));
  const therapistLocationIds: Record<string, string[]> = { ...options.therapistLocationIds };
  for (const r of args.tenantResources) therapistLocationIds[r.id] = [...r.locationIds];

  const labels = staffLabelContext({ ...options, therapistLocationIds });
  if (!labels) {
    return { therapists, allTherapists, therapistLocationIds, sharedResources: [...args.offered] };
  }

  const union: StaffOption[] = [];
  const listed = new Set<string>();
  for (const o of [...allTherapists, ...therapists, ...args.offered]) {
    if (listed.has(o.id)) continue;
    listed.add(o.id);
    union.push({ id: o.id, label: o.label });
  }
  const labelById = new Map(resolveStaffCollisions(union, labels).map((o) => [o.id, o.label]));

  const relabel = <T extends StaffOption>(list: readonly T[]): T[] =>
    list
      .filter((o) => labelById.has(o.id))
      .map((o) => (labelById.get(o.id) === o.label ? o : { ...o, label: labelById.get(o.id)! }));
  return {
    therapists: relabel(therapists),
    allTherapists: relabel(allTherapists),
    therapistLocationIds,
    sharedResources: relabel(args.offered),
  };
}

/**
 * A breakdown row (Estatisticas) relabelled by id, never dropped. Rows without
 * a practitioner id pass through untouched.
 *
 * Rows that collide with each other are labelled apart by the collision rule.
 * A row with nothing to collide with takes its label from `known`, the
 * viewer-wide option list the same page's filter shows (already resolved by
 * getAgendaOptions over the whole roster), so a breakdown holding only one of
 * two same-named machines still reads "NESA (CB)" beside a filter that says
 * "NESA (CB)".
 */
export function relabelStaffRows<R extends { id: string | null; name: string }>(
  rows: readonly R[],
  ctx: Omit<StaffLabelContext, "keepId">,
  known: readonly StaffOption[] = [],
): R[] {
  const knownById = new Map(known.map((o) => [o.id, o.label]));
  const named = rows.flatMap((r) => (r.id ? [{ id: r.id, label: r.name }] : []));
  const labelById = new Map(labelStaffCollisions(named, ctx).map((o) => [o.id, o.label]));
  return rows.map((r) => {
    if (!r.id) return r;
    // Two rows colliding in THIS list are told apart here, whatever the filter
    // shows (a single-clinic admin's breakdown can hold both machines' rows);
    // a row with nothing to collide with takes the filter's label.
    const fromRows = labelById.get(r.id);
    const label = fromRows !== undefined && fromRows !== r.name ? fromRows : (knownById.get(r.id) ?? fromRows);
    return label === undefined || label === r.name ? r : { ...r, name: label };
  });
}

/**
 * The CARE-01 card: its members and its picker are one list for naming. A
 * member and a candidate sharing a name (two machines at two clinics) are told
 * apart even when this viewer's picker offers only one of them; anything with
 * nothing to collide with takes the viewer's roster label (`known`). Labels
 * only: no member and no candidate is dropped.
 */
export function labelCareTeamCard<C extends StaffOption>(
  candidates: readonly C[],
  members: readonly { userId: string; fullName: string }[],
  ctx: Omit<StaffLabelContext, "keepId">,
  known: readonly StaffOption[] = [],
): { candidates: C[]; members: { userId: string; fullName: string }[] } {
  const listed = new Set(candidates.map((c) => c.id));
  const union = [
    ...candidates.map((c) => ({ id: c.id, name: c.label })),
    ...members.filter((m) => !listed.has(m.userId)).map((m) => ({ id: m.userId, name: m.fullName })),
  ];
  const byId = new Map(relabelStaffRows(union, ctx, known).map((r) => [r.id, r.name]));
  return {
    candidates: candidates.map((c) => {
      const label = byId.get(c.id);
      return label === undefined || label === c.label ? c : { ...c, label };
    }),
    members: members.map((m) => ({ userId: m.userId, fullName: byId.get(m.userId) ?? m.fullName })),
  };
}

/**
 * Equipa: the title each staff card shows, by id; a member absent from the map
 * is not shown. The viewer's clinics are their read scope, or every active
 * clinic when they have none (the owner, an unassigned admin), which is the
 * scope listStaff already read the members under.
 *
 * TITLES ONLY. The Gerir modal is handed the raw full_name, because its name
 * field is the rename input and whatever it holds is saved.
 */
export function staffCardTitles(
  staff: readonly { id: string; fullName: string }[],
  args: {
    viewerScope: readonly string[] | null;
    activeLocations: readonly { id: string; name: string }[];
    assignedLocations: ReadonlyMap<string, ReadonlySet<string>>;
  },
): Map<string, string> {
  const resolved = resolveStaffCollisions(
    staff.map((u) => ({ id: u.id, label: u.fullName })),
    {
      // An unscoped viewer (the owner, an unassigned admin) is never shown fewer
      // cards than before: every clinic any member is assigned to counts as
      // theirs, archived ones included, so a same-named member whose only
      // clinic was archived keeps a card and Gerir stays reachable.
      viewerClinicIds:
        args.viewerScope ?? [
          ...new Set([
            ...args.activeLocations.map((l) => l.id),
            ...[...args.assignedLocations.values()].flatMap((s) => [...s]),
          ]),
        ],
      assignments: new Map([...args.assignedLocations].map(([id, set]) => [id, [...set]])),
      clinicCodeById: clinicCodeMap(args.activeLocations.map((l) => ({ id: l.id, label: l.name }))),
    },
  );
  return new Map(resolved.map((o) => [o.id, o.label]));
}
