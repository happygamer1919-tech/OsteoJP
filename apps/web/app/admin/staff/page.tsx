import { assignableRoles, type Role } from "@osteojp/auth";
import { GlassPanel, KpiCard, StatusBadge } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { effectiveLocationId, resolveLocationControl } from "@/lib/auth/location-choice";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { matchesSearch } from "@/lib/search/text-filter";
import { SearchBox } from "@/app/patients/_components/search-box";
import { listStaff } from "@/lib/admin/staff";
import { listServices } from "@/lib/admin/services";
import { listTherapistPrimaries } from "@/lib/admin/therapist-primary-service";
import { listAvailabilityTemplates } from "@/lib/admin/availability";
import { listLocations } from "@/lib/admin/locations";
import { listStaffLocations } from "@/lib/admin/staff-locations";
import { seesEveryLocation } from "@/lib/admin/location-scope-warning";
import { listTimeOffBlocksForRoster } from "@/lib/admin/time-off";
import { buildScheduleDays, indexScheduleTemplates } from "@/lib/admin/schedule-days";
import { paletteColorByKey, therapistColor } from "@/lib/scheduling/therapist-color";
import { EquipaLocationFilter } from "./EquipaLocationFilter";
import { StaffInviteForm } from "./StaffInviteForm";
import { StaffManageModal, type ScheduleDay } from "./StaffManageModal";
import type { BlockView } from "../working-hours/TherapistBlocks";

const s = getStrings(DEFAULT_LOCALE);

const ROLE_LABEL: Record<Role, string> = {
  owner: s["admin.role.owner"],
  admin: s["admin.role.admin"],
  therapist: s["admin.role.therapist"],
  reception: s["admin.role.reception"],
};

// 0 = Sunday .. 6 = Saturday (JS Date.getDay(), matches the schema CHECK).
const WEEKDAY_KEYS = [
  "admin.workingHours.sun",
  "admin.workingHours.mon",
  "admin.workingHours.tue",
  "admin.workingHours.wed",
  "admin.workingHours.thu",
  "admin.workingHours.fri",
  "admin.workingHours.sat",
] as const;

// Clinical-week display order: Monday → Saturday → Sunday.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; q?: string; location?: string; t?: string }>;
}) {
  const actor = await requireRequestContext();
  const staff = await listStaff(actor);
  const primaries = await listTherapistPrimaries(actor);
  // ALL tenant services — the primary dropdown lists the active ones (so a
  // therapist with ZERO mappings can still be assigned a first/primary service,
  // W4-01); the full set is the name lookup for the card's primary label.
  const allServices = await listServices(actor);
  const activeServices = allServices.filter((svc) => svc.isActive);
  const serviceName = new Map(allServices.map((svc) => [svc.id, svc.name]));
  // Active working-hours templates — the "with hours set" summary count, the
  // W5-32 team↔location assignment source, AND (W12-40) the per-member schedule
  // editor rows now hosted inside the Gerir modal.
  const availability = await listAvailabilityTemplates(actor);
  // W5-32: active tenant locations for the filter, the location chips, and the
  // per-day location select in the schedule editor.
  const locations = (await listLocations(actor)).filter((l) => l.isActive);
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  // PL-14: the viewer's OWN locations decide the control. This select used to be
  // handed `locations` (tenant-wide), which is how Lurdes - assigned to LV only -
  // was offered Castelo Branco. One location => no control at all.
  const locationScope = await viewerLocationScope(actor);
  const locationControl = resolveLocationControl(
    locationScope,
    locations.map((l) => ({ id: l.id, label: l.name })),
  );
  // W12-40-Q2: each member's staff_locations memberships (+colour) — seeds the
  // Gerir modal's membership picker/colour pickers and the card colour.
  const staffLocationsByUser = await listStaffLocations(actor);
  const { m, q, location, t: focusId } = await searchParams;
  const query = (q ?? "").trim();
  // PL-14: a fixed viewer's clinic is applied whatever the URL says; a picker
  // viewer keeps only a request that names one of their own clinics.
  const locationId = effectiveLocationId(locationControl, (location ?? "").trim()) ?? "";

  // W5-32: each member's assigned location set. PL-14 widens it from working
  // hours alone to hours UNION staff_locations membership - with 5 of 11 members
  // holding hours, the hours-only set filtered out most of a real team.
  const assignedLocations = new Map<string, Set<string>>();
  const addAssignment = (userId: string, locId: string) => {
    const set = assignedLocations.get(userId) ?? new Set<string>();
    set.add(locId);
    assignedLocations.set(userId, set);
  };
  for (const a of availability) addAssignment(a.userId, a.locationId);
  for (const [userId, memberships] of staffLocationsByUser) {
    for (const membership of memberships) addAssignment(userId, membership.locationId);
  }

  // W12-40, widened by W13-A: up to TWO active templates per (member, weekday),
  // so a split shift (08:00-13:00 + 14:00-19:00) survives a reload. It was one,
  // and a loader that kept one while the editor saved two would archive the
  // second period on the next save. Both surfaces share this loader for that
  // reason — see lib/admin/schedule-days.ts, which also explains why a second
  // template at a DIFFERENT location is still never surfaced.
  const templateIndex = indexScheduleTemplates(availability);
  const buildDays = (memberId: string): ScheduleDay[] =>
    buildScheduleDays(templateIndex, memberId, WEEKDAY_ORDER, (wd) => s[WEEKDAY_KEYS[wd]]);

  // W12-40: time-off blocks per NON-reception member (they alone hold a schedule
  // + blocks). One query each, scoped to the shown set; reception is skipped.
  const schedulableIds = staff
    .filter((u) => u.roleSlug !== "reception")
    .map((u) => u.id);
  // ONE roster read, not one query per member.
  //
  // THIS WAS A `Promise.all` OF ONE `listTimeOffBlocks` PER MEMBER, and it
  // carried the same defect that crashed /horarios for reception: a member with
  // NO location assignment stays visible here (see the PL-14 note below) while
  // the schedule gate REFUSES them, so for a LOCATED ADMIN one unassigned
  // colleague rejected the whole batch and took Equipa down. The owner never
  // saw it because viewerLocationScope returns null for them. Full reasoning on
  // `manageableTargets` in lib/admin/schedule-scope.ts.
  const timeOffByMember = await listTimeOffBlocksForRoster(actor, schedulableIds);
  // Two readers of one answer, kept separate ON PURPOSE. `blocksFor` returns []
  // for a member this viewer cannot manage, and `manageableFor` is what tells
  // the modal to SAY SO rather than render an empty editor over that [].
  const blocksFor = (id: string): BlockView[] => {
    const held = timeOffByMember.get(id);
    return held?.manageable ? held.blocks : [];
  };
  const manageableFor = (id: string): boolean => timeOffByMember.get(id)?.manageable ?? false;

  // Presentation-only filter over the SAME role-scoped listStaff read (W5-02):
  // name/role search AND (W5-32) assigned location compose as an AND.
  //
  // PL-14: when the location is PINNED (the viewer has one clinic and no control
  // to clear), a member with no assignment at all stays visible - listStaff has
  // already scoped the read, and hiding an unassigned colleague behind a filter
  // the viewer cannot see or reset would make them unreachable. An explicitly
  // CHOSEN filter keeps the strict W5-32 behaviour.
  const locationPinned = locationControl.kind === "fixed";
  const atLocation = (userId: string): boolean => {
    if (locationId === "") return true;
    const assigned = assignedLocations.get(userId);
    if (!assigned || assigned.size === 0) return locationPinned;
    return assigned.has(locationId);
  };
  const visibleStaff = staff.filter(
    (u) =>
      matchesSearch(query, u.fullName, u.roleSlug ? ROLE_LABEL[u.roleSlug] : null) &&
      atLocation(u.id),
  );

  // Only an owner may assign/modify the owner tier; hide it from admins.
  const isOwner = actor.role === "owner";
  const roleOptions = assignableRoles(actor.role).map((slug) => ({
    slug,
    label: ROLE_LABEL[slug],
  }));

  // Team summary counts (W4-13) — derived from the reads already loaded above.
  const therapistIdsWithHours = new Set(availability.map((a) => a.userId));
  const activeCount = staff.filter((u) => u.isActive).length;
  const inactiveCount = staff.length - activeCount;
  const withPrimaryCount = staff.filter(
    (u) => u.roleSlug === "therapist" && primaries.get(u.id)?.primaryServiceId,
  ).length;
  const withHoursCount = staff.filter(
    (u) => u.roleSlug === "therapist" && therapistIdsWithHours.has(u.id),
  ).length;

  // Banner: staff-specific errors keep their precise message; the folded-in
  // Horários actions add the ok/warn/generic-err outcomes (W12-40).
  const errorText =
    m === "err:last_owner" ? s["admin.staff.lastOwnerBlocked"]
    : m === "err:owner_tier" ? s["admin.staff.ownerTierBlocked"]
    : m === "err:email_taken" ? s["admin.staff.emailTakenBlocked"]
    : m === "err:password" ? s["admin.staff.deleteWrongPassword"]
    : m === "err:has_activity" ? s["admin.staff.deleteHasActivity"]
    : m && m.startsWith("err") ? s["admin.staff.error"]
    : null;
  const warnCount = m && m.startsWith("warn:") ? Number.parseInt(m.slice(5), 10) : 0;
  const banner =
    warnCount > 0
      ? {
          tone: "warn" as const,
          text: s["admin.workingHours.blockOverlapWarn"].replace("{n}", String(warnCount)),
        }
      : m === "ok"
        ? { tone: "ok" as const, text: s["admin.workingHours.saved"] }
        : errorText
          ? { tone: "err" as const, text: errorText }
          : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.staff.title"]}</h2>

      {banner && (
        <p
          className={
            banner.tone === "ok"
              ? "text-sm text-success-700"
              : banner.tone === "warn"
                ? "text-sm text-warning-700"
                : "text-sm text-error"
          }
          role="status"
          data-testid="equipa-banner"
        >
          {banner.text}
        </p>
      )}

      {/* Full-width invite area: invite form + a team-summary panel (W4-13). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-start">
        <StaffInviteForm roles={roleOptions} />

        <GlassPanel title={s["admin.staff.summaryTitle"]}>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard label={s["admin.staff.summaryActive"]} value={activeCount} />
            <KpiCard label={s["admin.staff.summaryInactive"]} value={inactiveCount} />
            <KpiCard label={s["admin.staff.summaryPrimary"]} value={withPrimaryCount} />
            <KpiCard label={s["admin.staff.summaryHours"]} value={withHoursCount} />
          </div>
        </GlassPanel>
      </div>

      {/* Toolbar: name/role search (URL ?q=) + the Agenda location select (?location=). */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <SearchBox
            initialQuery={query}
            path="/admin/staff"
            placeholder={s["admin.staff.searchPlaceholder"]}
          />
        </div>
        {/* PL-14: one clinic = no control, just the clinic's name. */}
        {locationControl.kind === "fixed" ? (
          <span
            data-testid="equipa-fixed-location"
            className="inline-flex h-10 items-center rounded-v2 border border-v2-border bg-v2-surface px-3 text-sm text-v2-text-secondary"
          >
            {locationControl.location.label}
          </span>
        ) : (
          <div className="w-56">
            <EquipaLocationFilter
              locations={locationControl.options.map((o) => ({ id: o.id, name: o.label }))}
            />
          </div>
        )}
      </div>

      {visibleStaff.length === 0 ? (
        <GlassPanel>
          <p className="text-sm text-v2-text-secondary">{s["admin.staff.searchEmpty"]}</p>
        </GlassPanel>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="equipa-grid">
          {visibleStaff.map((u) => {
            const manageable = isOwner || u.roleSlug !== "owner";
            const isTherapist = u.roleSlug === "therapist";
            const showHours = u.roleSlug !== "reception";
            const memberships = staffLocationsByUser.get(u.id) ?? [];
            // Prefer an explicitly-set membership colour; else the deterministic
            // FNV colour (W9-05). Card shows one colour, so take the first set.
            const storedColorKey = memberships.find((mem) => mem.color)?.color ?? null;
            const color = paletteColorByKey(storedColorKey) ?? therapistColor(u.id);
            const days = buildDays(u.id);
            const workedDays = days.filter((d) => d.on);
            const locIds = [...(assignedLocations.get(u.id) ?? new Set<string>())];
            // PL-18: only reception and admin are scoped BY LOCATION at all
            // (viewer-locations.ts). Owner sees every clinic by design, and a
            // therapist is bounded by their own-data rules, not by location -
            // so neither can be "missing" an assignment.
            const noLocationScope = seesEveryLocation(u.roleSlug, u.isActive, memberships.length);
            const primaryId = primaries.get(u.id)?.primaryServiceId ?? "";
            const primaryLabel = primaryId ? serviceName.get(primaryId) ?? "" : "";

            return (
              <li
                key={u.id}
                className="relative flex flex-col gap-3 overflow-hidden rounded-v2 border border-v2-border glass-card p-5 pl-6 transition-colors duration-fast ease-standard hover:border-v2-text-secondary/40 focus-within:border-v2-text-secondary/40"
                data-testid="equipa-card"
                data-user-id={u.id}
              >
                {/* Colour spine — reinforcement; the NAME is the authoritative id (W9-05). */}
                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${color.fill}`} />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.fill}`} />
                    <h3 className="truncate text-base font-semibold text-v2-text-primary">
                      {u.fullName}
                    </h3>
                  </div>
                  <StatusBadge tone={u.isActive ? "confirmed" : "cancelled"}>
                    {u.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                  </StatusBadge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-v2-border bg-v2-surface px-2 py-0.5 text-xs font-medium text-v2-text-secondary">
                    {u.roleSlug ? ROLE_LABEL[u.roleSlug] : "—"}
                  </span>
                  {u.jobTitle && (
                    <span className="text-xs text-v2-text-secondary">{u.jobTitle}</span>
                  )}
                </div>

                {/* PL-18 (owner CR 2026-07-31, reported by reception: "can choose
                    from locations and are seeing all staff from both locations").
                    viewerLocationScope returns null - "not location-restricted",
                    i.e. EVERY clinic and every colleague - when a reception/admin
                    holds no staff_locations row. That fallback is deliberate, so
                    onboarding never locks a new staffer out of their own clinic,
                    but it is silent: the platform looked broken when it was doing
                    exactly what it was told. This says so on the card that fixes
                    it, one press from Gerir.

                    Read from `memberships` (staff_locations) and NOT from the
                    location chips above: those are hours UNION staff_locations
                    (PL-14), so an admin with working hours shows a clinic chip
                    while the SCOPE still sees no membership and falls back to
                    all. The chips answer "where does this person work"; this
                    answers "what does the platform restrict them to", and the
                    two genuinely differ. */}
                {noLocationScope && (
                  <p
                    className="text-xs text-warning-700"
                    data-testid="equipa-no-location-scope"
                  >
                    {s["admin.staff.noLocationScopeWarning"]}
                  </p>
                )}

                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="min-w-24 pt-0.5 text-xs font-medium text-v2-text-secondary">
                      {s["admin.staff.cardLocations"]}
                    </dt>
                    <dd className="flex flex-1 flex-wrap gap-1">
                      {locIds.length > 0 ? (
                        locIds.map((id) => (
                          <span
                            key={id}
                            className="rounded-full border border-v2-border bg-v2-surface px-2 py-0.5 text-xs text-v2-text-primary"
                          >
                            {locationName.get(id) ?? "—"}
                          </span>
                        ))
                      ) : (
                        <span className="text-v2-text-secondary">
                          {s["admin.staff.cardNoLocations"]}
                        </span>
                      )}
                    </dd>
                  </div>

                  {isTherapist && (
                    <div className="flex gap-2">
                      <dt className="min-w-24 pt-0.5 text-xs font-medium text-v2-text-secondary">
                        {s["admin.staff.cardPrimaryLabel"]}
                      </dt>
                      <dd className="flex-1 text-v2-text-primary">
                        {primaryLabel || (
                          <span className="text-v2-text-secondary">
                            {s["admin.staff.noPrimary"]}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}

                  {showHours && (
                    <div className="flex gap-2">
                      <dt className="min-w-24 pt-0.5 text-xs font-medium text-v2-text-secondary">
                        {s["admin.staff.sectionHours"]}
                      </dt>
                      <dd className="flex flex-1 flex-col gap-0.5">
                        {workedDays.length > 0 ? (
                          workedDays.map((d) => (
                            <span key={d.weekday} className="flex flex-wrap gap-x-1 tabular-nums">
                              <span className="font-medium text-v2-text-primary">{d.label}</span>
                              <span className="text-v2-text-primary">
                                {d.start}–{d.end}
                              </span>
                              {d.locationId && (
                                <span className="text-v2-text-secondary">
                                  · {locationName.get(d.locationId) ?? ""}
                                </span>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="text-v2-text-secondary">
                            {s["admin.staff.cardNoHours"]}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                {manageable ? (
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-v2-text-secondary">{u.email}</span>
                    <StaffManageModal
                      userId={u.id}
                      fullName={u.fullName}
                      email={u.email}
                      phone={u.phone ?? ""}
                      jobTitle={u.jobTitle ?? ""}
                      roleSlug={u.roleSlug ?? ""}
                      isActive={u.isActive}
                      isBookable={u.isBookable}
                      roleOptions={roleOptions}
                      canDelete={u.roleSlug !== "owner" && u.id !== actor.userId}
                      isTherapist={isTherapist}
                      services={activeServices.map((svc) => ({ id: svc.id, name: svc.name }))}
                      currentPrimaryId={primaryId}
                      showHours={showHours}
                      days={days}
                      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
                      memberships={memberships}
                      blocks={blocksFor(u.id)}
                      scheduleManageable={manageableFor(u.id)}
                      autoOpen={focusId === u.id}
                    />
                  </div>
                ) : (
                  <div className="mt-auto pt-1">
                    <span className="text-xs text-v2-text-secondary">{u.email}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
