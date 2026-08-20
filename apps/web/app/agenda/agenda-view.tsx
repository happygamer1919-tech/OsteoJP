"use client";

import { DatePicker, Select, SegmentedControl, ToastProvider } from "@osteojp/ui";
import { Ban, ChevronLeft, ChevronRight, MapPin, Plus, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { Role } from "@osteojp/auth";

import { s } from "@/lib/i18n";
import {
  addDays,
  formatAnchorLabel,
  lisbonParts,
  todayInLisbon,
  viewDates,
  type AgendaView as View,
} from "@/lib/scheduling/time";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";
import type {
  AgendaAppointment,
  AgendaFilters,
  AgendaOptions,
} from "@/lib/scheduling/types";

import { AgendaGrid } from "./agenda-grid";
import { AppointmentDrawer, type ModalState } from "./appointment-drawer";
import { BlockTimeDialog } from "./block-time-dialog";

// v2 glass toolbar controls (SPEC-v2-foundation §7 nav-button idiom): no opaque
// border/fill, neutral hover tint, the global focus ring. Mirrors the shell's
// own icon buttons so the agenda toolbar reads as part of the v2 chrome.
const iconBtn =
  "inline-flex size-10 items-center justify-center rounded-v2 text-v2-text-secondary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

export function AgendaView({
  view,
  anchor,
  filters,
  lockTherapist,
  viewer,
  options,
  appointments,
  blocks,
  lockedPatient,
  prefill,
  canHardDelete,
  canBlockTime,
  renderedAt,
  renderedAtIso,
}: {
  view: View;
  anchor: string;
  filters: AgendaFilters;
  lockTherapist: boolean;
  // PL-10: the logged-in viewer's identity, forwarded to the create drawer so a
  // THERAPIST self-locks (practitioner forced to self, Terapeuta selector hidden).
  // Distinct from `lockTherapist`, which governs the OUT-OF-SCOPE agenda toolbar
  // read-scope (W10-04) — this only reaches the create form.
  viewer: { role: Role; userId: string };
  options: AgendaOptions;
  appointments: AgendaAppointment[];
  /** W9-04: time_off spans for the visible range. Non-empty ONLY when the agenda
   *  is scoped to one therapist - see page.tsx for why. */
  blocks: BlockSpan[];
  /** W6-03: when deep-linked from a patient profile, the create drawer opens
   *  with this patient preselected + locked. Null on a normal agenda visit. */
  lockedPatient: { value: string; label: string } | null;
  /** GUEST-06: the service and clinic a converted guest request asked for.
   *  Each is already validated against `options` by page.tsx, so a non-null id
   *  here is guaranteed to have a matching <option> — see the STAFF-01 note
   *  there for why that guarantee, and not the raw URL value, is what crosses
   *  this boundary. Both null on a normal agenda visit. */
  prefill: { serviceId: string | null; locationId: string | null };
  canHardDelete: boolean;
  /** W12-28, regated by PL-27: gates the "Bloquear horário" affordance =
   *  can(role,"schedule:manage") - the capability createTimeOffBlock ACTUALLY
   *  server-enforces. It used to read settings:manage and claim the two were the
   *  same; that stopped being true at PL-09 Phase 5, which created
   *  schedule:manage and gave it to reception, and the mismatch hid the button
   *  from the role that owns scheduling. This still never relaxes the guard - the
   *  server re-asserts the same capability and the same location scope. */
  canBlockTime: boolean;
  /**
   * LE-agenda-does-not-learn-of-portal-bookings. THE INSTANT THIS DATA WAS READ,
   * "HH:MM" Lisbon, FORMATTED ON THE SERVER AND PASSED IN.
   *
   * IT IS A PROP AND NOT A `new Date()` IN THIS FILE, and that is the whole
   * correctness of the feature. A client-side clock would re-read on every
   * render and always say "now" - so the stamp would be freshest exactly when
   * the data was stalest, and the screen would lie about its own freshness with
   * more confidence than it does today. The value has to travel with the data
   * it describes.
   *
   * `/agenda` is dynamic SSR and re-queries on every request, so a new value
   * arriving IS a new read. Nothing else can produce one.
   */
  renderedAt: string;
  /** The same instant as ISO-8601, for the `<time dateTime>` attribute. */
  renderedAtIso: string;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState | null>(null);
  // W12-28: "Bloquear horário" dialog state (null = closed). Prefills from a slot
  // when opened from an empty cell; the current therapist filter preselects.
  const [blockOpen, setBlockOpen] = useState<{ slot?: { date: string; time: string } } | null>(null);

  // W6-03: on a deep-link from a patient profile ("Nova marcação"), open the
  // create drawer ONCE with the patient preselected + locked, then strip the
  // param so a refresh/back does not re-trigger the autopen. history.replaceState
  // (not router.replace) avoids a server refetch and keeps this modal state.
  //
  // GUEST-06 extends the same deep link with the service and clinic the guest
  // asked for, so a convert lands reception on a drawer that needs only the
  // therapist and the time — the two things the guest was never shown and could
  // not have chosen. The date rides the agenda's existing `date` param, which
  // already anchors both the grid and the drawer's default day.
  const deepLinkOpened = useRef(false);
  useEffect(() => {
    if (!lockedPatient || deepLinkOpened.current) return;
    deepLinkOpened.current = true;
    setModal({
      mode: "create",
      lockedPatient,
      prefill: prefill.serviceId || prefill.locationId ? prefill : undefined,
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("novaMarcacaoPaciente");
    url.searchParams.delete("novaMarcacaoServico");
    url.searchParams.delete("novaMarcacaoLocal");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [lockedPatient, prefill]);

  // SPEC-v2-agenda §4: mobile collapses to the Dia view. This is a presentation
  // override — the URL `view` (and the server fetch range) are untouched; below
  // the lg breakpoint the grid, the range label, and the date step all render as
  // a single day. Starts false so the SSR/first-client render match (no
  // hydration mismatch); the effect corrects it on mount.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)"); // below Tailwind `lg`
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const effectiveView: View = isMobile ? "day" : view;

  function navigate(next: {
    view?: View;
    date?: string;
    therapist?: string | null;
    location?: string | null;
  }) {
    const params = new URLSearchParams();
    params.set("view", next.view ?? view);
    params.set("date", next.date ?? anchor);
    const therapist = next.therapist !== undefined ? next.therapist : filters.practitionerId;
    const location = next.location !== undefined ? next.location : filters.locationId;
    if (therapist && !lockTherapist) params.set("therapist", therapist);
    if (location) params.set("location", location);
    startTransition(() => router.push(`/agenda?${params.toString()}`));
  }

  const step = effectiveView === "week" ? 7 : 1;

  // W4-17 — live appointment count for the VISIBLE range. Computed exactly as the
  // grid decides visibility (an appointment whose Lisbon calendar day falls in
  // viewDates(effectiveView, anchor)), so it matches the grid on every viewport
  // (incl. the mobile day-collapse) and updates live with navigation + filters
  // (the `appointments` prop is refetched server-side for the range + filters).
  const visibleDates = new Set(viewDates(effectiveView, anchor));
  const visibleCount = appointments.filter((a) =>
    visibleDates.has(lisbonParts(new Date(a.startsAt)).date),
  ).length;
  const countLabel = visibleCount === 1 ? s["agenda.apptCountOne"] : s["agenda.apptCountMany"];

  return (
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
    <main>
      {/* Toolbar: full-bleed sticky glass bar. Under the v2 SidebarAppShell the
          desktop content area has no top bar (sticks to top-0); on mobile it
          sits below the shell's sticky h-16 header (top-16). z-10 keeps it under
          that header (z-20). */}
      <div className="glass-nav sticky top-16 z-10 -mx-6 -mt-8 mb-6 flex flex-wrap items-center gap-3 px-6 py-3 lg:top-0">
        <h1 className="text-2xl text-v2-text-primary">{s["agenda.title"]}</h1>

        {/* Day/week toggle is desktop-only: mobile is always the Dia view (§4). */}
        <div className="hidden lg:block">
          <SegmentedControl
            aria-label={s["agenda.title"]}
            value={view}
            onValueChange={(v) => navigate({ view: v as View })}
            items={[
              { value: "day", label: s["agenda.viewDay"] },
              { value: "week", label: s["agenda.viewWeek"] },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={s["agenda.prevPeriod"]}
            onClick={() => navigate({ date: addDays(anchor, -step) })}
            className={iconBtn}
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="w-44">
            <DatePicker
              value={anchor}
              onChange={(d) => navigate({ date: d })}
              triggerLabel={s["agenda.pickDate"]}
              prevMonthLabel={s["calendar.previousMonth"]}
              nextMonthLabel={s["calendar.nextMonth"]}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate({ date: todayInLisbon() })}
            className="inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {s["agenda.today"]}
          </button>
          <button
            type="button"
            aria-label={s["agenda.nextPeriod"]}
            onClick={() => navigate({ date: addDays(anchor, step) })}
            className={iconBtn}
          >
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {/* W4-17 — structured range chip (replaces the loose week-range text)
              carrying the range label + the live appointment count for the
              visible range. */}
          <span
            data-testid="agenda-range-chip"
            className="ml-1 hidden items-center gap-2 rounded-full border border-v2-border bg-v2-surface px-3 py-1 sm:inline-flex"
          >
            <span className="text-sm font-medium text-v2-text-primary">
              {formatAnchorLabel(effectiveView, anchor)}
            </span>
            <span aria-hidden="true" className="text-v2-text-secondary">·</span>
            <span className="text-sm text-v2-text-secondary">
              {visibleCount} {countLabel}
            </span>
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!lockTherapist && (
            <div className="w-56">
              <Select
                aria-label={s["agenda.filterTherapists"]}
                value={filters.practitionerId ?? ""}
                onChange={(e) => navigate({ therapist: e.target.value || null })}
              >
                <option value="">{s["agenda.allTherapists"]}</option>
                {options.therapists.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {/* W10-04 isolation: the therapist role loses the location switcher
              too (it already loses the therapist switcher above). A therapist is
              scoped to their own calendar + location server-side; the switcher is
              hidden so the two selectors disappear together for that role.
              PL-14: everyone else loses it too as soon as there is only ONE
              location to choose from - the server has already pinned it, so the
              name is shown as a static chip instead of a select with one entry. */}
          {!lockTherapist && options.locations.length === 1 && (
            <span
              data-testid="agenda-fixed-location"
              className="inline-flex h-10 items-center gap-2 rounded-v2 border border-v2-border bg-v2-surface px-3 text-sm text-v2-text-secondary"
            >
              <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
              {options.locations[0]!.label}
            </span>
          )}
          {!lockTherapist && options.locations.length > 1 && (
          <div className="w-56">
            <Select
              aria-label={s["header.location"]}
              value={filters.locationId ?? ""}
              // W9-02: changing location also clears the therapist filter. The
              // dropdown now only lists the selected location's assigned
              // therapists, so a therapist held over from another location would
              // be a filter that is ACTIVE in the URL but absent from its own
              // Select - the grid would silently narrow to a therapist the user
              // can no longer see selected. Clearing keeps the toolbar and the
              // grid describing the same thing.
              onChange={(e) => navigate({ location: e.target.value || null, therapist: null })}
            >
              <option value="">{s["agenda.allLocations"]}</option>
              {options.locations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          )}
          {/* W12-28: "Bloquear horário" writes a time_off block via the existing
              model (settings:manage-gated), replacing the informal "Não Marcar"
              fake-appointment hack. Shown only to roles that can manage blocks
              (canBlockTime); reception scoping is Q-W12-10. */}
          {canBlockTime && (
            <button
              type="button"
              onClick={() => setBlockOpen({})}
              className="inline-flex h-10 items-center gap-2 rounded-v2 border border-v2-border px-4 text-sm font-medium text-v2-text-primary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <Ban size={18} strokeWidth={1.75} aria-hidden="true" />
              {s["agenda.blockTime"]}
            </button>
          )}
          {/* LE-agenda-does-not-learn-of-portal-bookings — THE AGENDA SAYS HOW
              OLD IT IS.

              THE PROBLEM IS STRUCTURAL AND IS NOT FIXED HERE. A portal booking
              is written by `apps/api`; this page is rendered by `apps/web`.
              They are SEPARATE Next deployments on separate Vercel projects, so
              `revalidatePath` in one cannot invalidate the other's cache - it
              invalidates the CALLING deployment's, and apps/api never calls it
              (asserted in apps/api/lib/exposure/sync-single-source.test.ts).
              An agenda left open at reception therefore never learns about a
              portal booking until somebody navigates or reloads.

              IT IS NOT A DOUBLE-BOOKING RISK. The protection is the slot LOCK
              and 0061's CONSTRAINT, not the render: two writers for one window
              are serialised at the database and one is refused. A stale screen
              cannot CREATE a double booking. What it can do is show a
              receptionist an out-of-date picture while they are on the phone to
              a patient, and that is the whole cost.

              SO THIS REMOVES THE WRONG BELIEF RATHER THAN THE LAG. The data was
              never stale ON READ - the page re-queries every request - it is
              just that nothing PROMPTS a read. A screen with no stamp reads as
              live. A screen that says 14:32 does not, and the button next to it
              is the prompt that was missing.

              POLLING (option a on the card) IS NOT BUILT and is the honest next
              step if reception still finds the lag costly. A shared invalidation
              channel (option b) is new infrastructure and is not worth it for a
              surface that cannot cause the harm it looks like it could. */}
          <span
            data-testid="agenda-freshness"
            className="hidden items-center gap-2 rounded-full border border-v2-border bg-v2-surface px-3 py-1 sm:inline-flex"
          >
            <span className="text-sm text-v2-text-secondary">
              {s["agenda.lastUpdated"]}{" "}
              <time dateTime={renderedAtIso} className="tabular-nums">
                {renderedAt}
              </time>
            </span>
          </span>
          <button
            type="button"
            data-testid="agenda-refresh"
            aria-label={s["agenda.refresh"]}
            disabled={refreshing}
            onClick={() => startTransition(() => router.refresh())}
            className="inline-flex h-10 items-center gap-2 rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <RotateCw size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden lg:inline">
              {refreshing ? s["agenda.refreshing"] : s["agenda.refresh"]}
            </span>
          </button>

          {/* Primary action: filled Wellness Green (SPEC-v2-agenda §1.4). The
              packages/ui Button is brand-teal with no green variant; styled
              in-route on v2 tokens to meet the spec (green-700 fill + inverse
              text = 4.7:1 AA). A green Button variant is logged as a foundation
              follow-up in docs/design/QUESTIONS.md (Q-V2W2-2), never added inside
              a section wave. */}
          <button
            type="button"
            onClick={() => setModal({ mode: "create" })}
            className="inline-flex h-10 items-center gap-2 rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-v2-green-800 active:bg-v2-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {s["agenda.newAppointment"]}
          </button>
        </div>
      </div>

      {/* No empty-period banner: the agenda grid (empty time columns) is its
          own empty affordance, so a separate banner is redundant (W4-07). */}
      <AgendaGrid
        view={effectiveView}
        anchor={anchor}
        appointments={appointments}
        blocks={blocks}
        onSelectAppointment={(appt) => setModal({ mode: "edit", appt })}
        onSelectSlot={(date, time) => setModal({ mode: "create", slot: { date, time } })}
      />

      {modal && (
        <AppointmentDrawer
          state={modal}
          options={options}
          anchor={anchor}
          canHardDelete={canHardDelete}
          viewer={viewer}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* W12-28: block a slot from the agenda (reuses createTimeOffBlock + the
          BlockSpan render + booking exclusion). Preselects the filtered therapist. */}
      {blockOpen && (
        <BlockTimeDialog
          therapists={options.therapists}
          defaultTherapistId={filters.practitionerId}
          // ITEM 3: a therapist is already practitioner-locked on this page
          // (page.tsx forces practitionerId to their own id), so the preselect
          // is correct for them; this pins it so the roster dropdown cannot
          // offer a colleague the server would refuse anyway.
          lockTherapist={lockTherapist}
          slot={blockOpen.slot ?? null}
          onClose={() => setBlockOpen(null)}
          onDone={() => {
            setBlockOpen(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </main>
    </ToastProvider>
  );
}
