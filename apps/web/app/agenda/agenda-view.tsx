"use client";

import { DatePicker, Select, SegmentedControl, ToastProvider } from "@osteojp/ui";
import { Ban, ChevronLeft, ChevronRight, MapPin, Plus, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";

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
  dayWindow,
  closure,
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
  /** 0085: the grid's visible window, from the clinic's own opening hours. */
  dayWindow: { startMin: number; endMin: number };
  /** 0085: the selected clinic's daily closure, or null under "Todas". */
  closure: { startMin: number; endMin: number; locationName: string } | null;
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

  /* ==================================================================== */
  /* AGENDA-01 - WHERE THE GRID'S WEEKDAY HEADER IS ALLOWED TO PIN.       */
  /* ==================================================================== */
  /*
   * The grid header sticks (agenda-grid.tsx). It has to stop at the BOTTOM OF
   * THIS TOOLBAR, which is itself sticky - and this toolbar's height is a
   * runtime fact, not a constant, because it is `flex-wrap` and carries eight
   * controls. At 1440px it is one row; at the 1280x800 laptop reception uses it
   * wraps to two, and on the narrowest desktop to three. A hardcoded offset
   * would therefore pin the weekday row UNDERNEATH the toolbar on exactly the
   * screens the defect was reported from, which is worse than not pinning it:
   * the row would be present in the DOM, invisible on the page, and every test
   * asserting "it is still there" would pass.
   *
   * THE `top` IS READ FROM THE ELEMENT, NOT REDERIVED. The toolbar is
   * `top-16 lg:top-0` - 64px on mobile, where the shell renders its own sticky
   * h-16 header, and 0 on desktop where it does not. Recomputing that from
   * `isMobile` would be a second copy of the breakpoint, free to drift from the
   * class that actually positions the bar; `getComputedStyle().top` is the
   * value the browser is really using.
   *
   * A ResizeObserver, because a wrap is a HEIGHT change with no resize event of
   * its own - a control widening (a longer clinic name, a therapist filter
   * appearing for one role and not another) can rewrap the bar at a fixed
   * viewport width. The window listener catches the other half: `top` changes
   * at the lg breakpoint without the height necessarily changing with it.
   *
   * IT RESERVES NO SPACE. This writes one custom property and renders nothing.
   */
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [headerTop, setHeaderTop] = useState(0);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const measure = () => {
      const top = Number.parseFloat(window.getComputedStyle(el).top);
      setHeaderTop((Number.isFinite(top) ? top : 0) + el.getBoundingClientRect().height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

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
    {/* AGENDA-01: `--agenda-header-top` is consumed by the grid's sticky
        weekday row. Set on <main> rather than passed as a prop so the grid stays
        a pure function of its data - it reads a CSS variable with a 0px
        fallback and needs to know nothing about the toolbar. */}
    <main style={{ "--agenda-header-top": `${headerTop}px` } as CSSProperties}>
      {/* ==================================================================
          AGENDA-02 - THE TOOLBAR IS TWO LINES, NOT THREE OR FOUR.

          MEASURED BEFORE IT WAS TOUCHED (the numbers are the card's, not an
          estimate): 232px tall at 1024 and 222px at 1280, because eight
          controls with a combined intrinsic width of ~2030px were laid out by
          `flex-wrap` in a bar 672px / 928px wide. Every wrapped row is 44px
          taken from the appointment grid, on the two viewports reception
          actually uses.

          THE SHAPE IS A HEADER LINE PLUS ONE CONTROL ROW, and the split is by
          KIND rather than by what happened to fit: line one carries the page's
          identity and the two filters that say WHOSE agenda this is; line two
          carries the things you press. A filter is read once and left alone; an
          action is pressed all day, so the actions get the row that never
          wraps.

          THREE MEASURED SAVINGS MAKE IT FIT, and each is a duplication removed
          rather than a control hidden:
            1. `Atualizado às HH:MM` (159px) and `Atualizar` (111px) were two
               controls describing one fact. They are now ONE button: the stamp
               IS the affordance, which is what the freshness card wanted in the
               first place. 270px -> ~95px.
            2. The range chip repeated the date the picker already shows, at
               311px. The date survives at xl where there is room for it; below
               that the chip carries the live count, which the picker does not
               have.
            3. `Bloquear horário` shortens to `Bloquear` below xl. A shorter
               word, not an icon: the card's condition is that every control
               stays VISIBLE AND LABELLED, so nothing here is reduced to a
               glyph with a tooltip.

          WHAT IS NOT CLAIMED. Eight labelled controls do not fit on ONE row at
          1024: the irreducible labelled set measures ~960px against 672px of
          bar. That is arithmetic, not effort, and the report carries the
          numbers. The row therefore SHRINKS rather than wraps - the filters and
          the date picker give up width first (`min-w-0`), so Nova marcação is
          never pushed onto a line of its own.
          ================================================================== */}
      <div
        ref={toolbarRef}
        data-testid="agenda-toolbar"
        className="glass-nav sticky top-16 z-10 -mx-6 -mt-8 mb-6 flex flex-col gap-2 px-6 py-2.5 lg:top-0"
      >
        {/* ---- LINE 1: identity + the filters that scope the page ---- */}
        <div data-testid="agenda-toolbar-header" className="flex min-w-0 items-center gap-3">
          <h1 className="flex-none text-lg font-medium leading-none text-v2-text-primary">
            {s["agenda.title"]}
          </h1>

          {/* W4-17 chip, now count-first. The DATE is the picker's job below xl;
              the COUNT is this chip's, and nothing else on the page has it. */}
          <span
            data-testid="agenda-range-chip"
            className="hidden min-w-0 flex-none items-center gap-2 rounded-full border border-v2-border bg-v2-surface px-3 py-0.5 sm:inline-flex"
          >
            <span className="hidden truncate text-sm font-medium text-v2-text-primary xl:inline">
              {formatAnchorLabel(effectiveView, anchor)}
            </span>
            <span aria-hidden="true" className="hidden text-v2-text-secondary xl:inline">·</span>
            <span className="whitespace-nowrap text-sm text-v2-text-secondary">
              {visibleCount} {countLabel}
            </span>
          </span>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            {!lockTherapist && (
              <div className="min-w-0 flex-1 sm:max-w-[16rem]">
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
                className="inline-flex h-10 min-w-0 flex-none items-center gap-2 rounded-v2 border border-v2-border bg-v2-surface px-3 text-sm text-v2-text-secondary"
              >
                <MapPin size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                <span className="truncate">{options.locations[0]!.label}</span>
              </span>
            )}
            {!lockTherapist && options.locations.length > 1 && (
              <div className="min-w-0 flex-1 sm:max-w-[16rem]">
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
          </div>
        </div>

        {/* ---- LINE 2: the things you press ----
            TWO UNBREAKABLE GROUPS, AND THE WRAP IS BETWEEN THEM ONLY.

            The first draft of this row was `lg:flex-nowrap` with a shrinking
            date field, on the theory that a row which cannot wrap cannot drop
            the primary action onto a line of its own. IT WAS WRONG ON SCREEN
            AND THE TESTS DID NOT SEE IT: nowrap does not make content fit, it
            makes it OVERLAP, and `toBeVisible()` is true of a button painted
            underneath another one. The 1024 screenshot had `Bloquear` sitting on
            top of the date field with `Hoje` gone; at 1280 the next-period
            chevron and the Ban icon were on the same pixels.

            So the row wraps again, and the guarantee is structural instead:
            WHEN and WHERE. The actions live in one `flex-none` group ordered
            last, so a wrap moves Bloquear, Atualizar and Nova marcação TOGETHER
            to the next line. Nova marcação can therefore never end up alone
            under the toolbar, which is the shape the card is about - it is
            always beside the two controls it belongs with, on the row it
            belongs to.

            WHAT DOES NOT FIT AT 1024, STATED RATHER THAN HIDDEN. The nine
            labelled controls measure ~910px side by side; the bar is 672px wide
            at 1024 and 928px at 1280. So this row is ONE line at 1280 and TWO
            at 1024, and no amount of tightening changes that without taking a
            visible label off a control - which is the one thing the card
            forbids. The report carries the arithmetic. */}
        <div
          data-testid="agenda-toolbar-controls"
          className="flex flex-wrap items-center gap-2"
        >
          {/* Group 1: WHEN you are looking at. The toggle and the date belong
              together and are never split across a wrap. */}
          <div className="flex flex-none items-center gap-2">
          {/* Day/week toggle is desktop-only: mobile is always the Dia view (§4). */}
          <div className="hidden flex-none lg:block">
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

          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              aria-label={s["agenda.prevPeriod"]}
              onClick={() => navigate({ date: addDays(anchor, -step) })}
              className={`${iconBtn} flex-none`}
            >
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            {/* w-40 rather than the old w-44: 16px, and it is the difference
                between the two groups fitting one line at 1280 and not. The
                trigger holds "21/12/2026" with room to spare. */}
            <div className="w-40 flex-none">
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
              className="inline-flex h-10 flex-none items-center rounded-v2 px-2.5 text-sm font-medium text-v2-text-secondary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {s["agenda.today"]}
            </button>
            <button
              type="button"
              aria-label={s["agenda.nextPeriod"]}
              onClick={() => navigate({ date: addDays(anchor, step) })}
              className={`${iconBtn} flex-none`}
            >
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          </div>

          {/* Group 2: WHAT YOU DO. One flex-none unit, ordered last, so a wrap
              carries all three together and never orphans the primary action.
              `ml-auto` right-aligns it when both groups share a line and is
              inert once they do not. */}
          <div className="flex flex-none items-center gap-2 sm:ml-auto">
            {/* W12-28: "Bloquear horário" writes a time_off block via the existing
                model (settings:manage-gated), replacing the informal "Não Marcar"
                fake-appointment hack. Shown only to roles that can manage blocks
                (canBlockTime); reception scoping is Q-W12-10. */}
            {canBlockTime && (
              <button
                type="button"
                onClick={() => setBlockOpen({})}
                // THE ACCESSIBLE NAME IS THE FULL LABEL AT EVERY WIDTH. Only one
                // of the two spans below is displayed, and name computation skips
                // a `display:none` child - so without this the control would be
                // announced as "Bloquear" on a narrow screen and "Bloquear
                // horário" on a wide one, i.e. the same button under two names
                // depending on the viewport.
                aria-label={s["agenda.blockTime"]}
                title={s["agenda.blockTime"]}
                className="inline-flex h-10 flex-none items-center gap-2 rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                <Ban size={18} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                {/* SHORTER WORD, NOT AN ICON: the control keeps a visible text
                    label at every width, which is the card's condition. The
                    accessible name is pinned by the aria-label above, so the
                    abbreviation is never what anybody is told the button is. */}
                <span className="whitespace-nowrap 2xl:hidden">{s["agenda.blockTimeShort"]}</span>
                <span className="hidden whitespace-nowrap 2xl:inline">{s["agenda.blockTime"]}</span>
              </button>
            )}

            {/* LE-agenda-does-not-learn-of-portal-bookings — THE AGENDA SAYS HOW
                OLD IT IS, AND SAYING SO IS NOW THE BUTTON.

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

                AGENDA-02 MERGED THE STAMP INTO THE BUTTON. They were a chip and a
                button, 270px between them, saying one thing: this is how old the
                page is, press here for a newer one. The stamp is the label now.
                The accessible name stays `Atualizar` - the action, not the
                reading - so nothing that clicked this control by name has moved.

                POLLING (option a on the card) IS NOT BUILT and is the honest next
                step if reception still finds the lag costly. A shared invalidation
                channel (option b) is new infrastructure and is not worth it for a
                surface that cannot cause the harm it looks like it could. */}
            <button
              type="button"
              data-testid="agenda-refresh"
              // The NAME is the action; the visible text is the reading. A
              // control whose accessible name was the timestamp would be
              // announced as "18:06", which names the state and not the verb.
              aria-label={refreshing ? s["agenda.refreshing"] : s["agenda.refresh"]}
              title={`${s["agenda.refresh"]} · ${s["agenda.lastUpdated"]} ${renderedAt}`}
              disabled={refreshing}
              onClick={() => startTransition(() => router.refresh())}
              className="inline-flex h-10 flex-none items-center gap-2 rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <RotateCw size={18} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
              <span
                data-testid="agenda-freshness"
                className="whitespace-nowrap text-sm font-normal text-v2-text-secondary"
              >
                <span className="hidden 2xl:inline">{s["agenda.lastUpdated"]} </span>
                <time dateTime={renderedAtIso} className="tabular-nums">
                  {renderedAt}
                </time>
              </span>
            </button>

            {/* Primary action: filled Wellness Green (SPEC-v2-agenda §1.4). The
                packages/ui Button is brand-teal with no green variant; styled
                in-route on v2 tokens to meet the spec (green-700 fill + inverse
                text = 4.7:1 AA). A green Button variant is logged as a foundation
                follow-up in docs/design/QUESTIONS.md (Q-V2W2-2), never added inside
                a section wave.

                AGENDA-02: `flex-none` and LAST in a `lg:flex-nowrap` row. Those
                two facts together are what "never wraps below" means mechanically
                - it cannot be pushed to a new line, and it cannot be squeezed. */}
            <button
              type="button"
              onClick={() => setModal({ mode: "create" })}
              className="inline-flex h-10 flex-none items-center gap-2 whitespace-nowrap rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-v2-green-800 active:bg-v2-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
              {s["agenda.newAppointment"]}
            </button>
          </div>
        </div>
      </div>

      {/* No empty-period banner: the agenda grid (empty time columns) is its
          own empty affordance, so a separate banner is redundant (W4-07). */}
      <AgendaGrid
        view={effectiveView}
        anchor={anchor}
        appointments={appointments}
        blocks={blocks}
        dayWindow={dayWindow}
        closure={closure}
        onSelectAppointment={(appt) => setModal({ mode: "edit", appt })}
        onSelectSlot={(date, time) => setModal({ mode: "create", slot: { date, time } })}
        /* SCHED-22 - THE BAND OPENS THE BLOCK THAT MADE IT.
           It routes to /horarios with the block named, which is the deep link
           SCHED-21 already built for the inspector's Editar. One destination,
           one dialog: the alternative is a second block editor living on the
           agenda, and two forms writing time_off are two opinions about what a
           block is.

           `filters.practitionerId` is safe to use here because a band only
           renders at all when the agenda is scoped to one therapist - the grid
           has no therapist axis, so a band under "Todos" would be a claim about
           the whole clinic (W9-04). No filter, no band, nothing to click. */
        onOpenBlock={
          filters.practitionerId && canBlockTime
            ? (blockId) =>
                router.push(
                  `/horarios?t=${filters.practitionerId}&editBlock=${blockId}`,
                )
            : undefined
        }
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
