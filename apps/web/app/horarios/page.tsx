import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { GlassPanel } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { listAvailabilityTemplates } from "@/lib/admin/availability";
import { listTimeOffBlocksForRoster } from "@/lib/admin/time-off";
import { resolveScheduleScope } from "@/lib/admin/schedule-scope";
import { buildScheduleDays, indexScheduleTemplates } from "@/lib/admin/schedule-days";
import {
  TherapistBlocks,
  type BlockLabels,
} from "@/app/admin/working-hours/TherapistBlocks";
import type { ScheduleDay } from "@/app/admin/staff/StaffManageModal";
import { WeekScheduleEditor } from "./WeekScheduleEditor";
import { AlternatingWeeksPanel } from "./AlternatingWeeksPanel";
import { DayByDayPanel } from "./DayByDayPanel";
import { RosterSearch } from "./RosterSearch";
import {
  createTimeOffBlockAction,
  deleteTimeOffBlockAction,
  updateTimeOffBlockAction,
} from "./actions";

// Weekday labels + clinical-week order (Mon → Sat → Sun), mirroring the Equipa
// editor so a therapist's week reads identically on both surfaces.
const WEEKDAY_KEYS = [
  "admin.workingHours.sun",
  "admin.workingHours.mon",
  "admin.workingHours.tue",
  "admin.workingHours.wed",
  "admin.workingHours.thu",
  "admin.workingHours.fri",
  "admin.workingHours.sat",
] as const;
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * PL-09 Phase 5 — the reception-facing schedule surface. Lists the therapists at
 * the viewer's location(s) (getAgendaOptions is already viewerLocationScope'd) and
 * hosts, per therapist, the weekly working-hours editor + the time-off editor.
 * Reachable by schedule:read (reception; owner/admin use Equipa). Every write goes
 * through the schedule:manage + own-location lib gates, so this page grants no
 * authority the server does not re-check.
 */
export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireRequestContext();
  if (!can(actor.role, "schedule:read")) redirect("/dashboard");

  const { m } = await searchParams;
  const [options, availability] = await Promise.all([
    getAgendaOptions(actor),
    listAvailabilityTemplates(actor),
  ]);
  // WHO THIS SURFACE LISTS IS THE SCHEDULE SCOPE'S QUESTION, NOT THE AGENDA'S.
  //
  // `getAgendaOptions` is scoped by `viewerLocationScope`, which returns null for
  // a THERAPIST - correct for the agenda, where a therapist is bounded by their
  // own-data rules rather than by location. Read here it meant a therapist saw a
  // schedule card for EVERY colleague: seven cards on the seeded database, six of
  // them other people, each rendered with "Sem clínica atribuída" - a sentence
  // that is FALSE about those colleagues, since they are assigned and the viewer
  // simply may not manage them.
  //
  // It is the same mistake ITEM 3 fixed one layer down, resurfacing one layer up:
  // a scope resolved for one question being reused for a different one. The
  // schedule scope is what decides this list.
  const scheduleScope = await resolveScheduleScope(actor);
  const therapists =
    scheduleScope.kind === "self"
      ? options.therapists.filter((t) => t.id === scheduleScope.userId)
      : options.therapists; // location-scoped; ITEM 1 keeps unassigned members visible here
  const locations = options.locations.map((l) => ({ id: l.id, name: l.label }));

  // Up to TWO active templates per (therapist, weekday) since W13-A, so a split
  // shift survives a reload. SHARED with the Equipa surface deliberately: these
  // two loaders were byte-identical, they feed editors that share one
  // ScheduleDay type, and one learning to load a second period without the other
  // would mean reception saves a split shift and admin archives it.
  const templateIndex = indexScheduleTemplates(availability);
  const buildDays = (userId: string): ScheduleDay[] =>
    buildScheduleDays(templateIndex, userId, WEEKDAY_ORDER, (wd) => s[WEEKDAY_KEYS[wd]]);

  // Time-off blocks for the whole roster, in two queries.
  //
  // THIS WAS A `Promise.all` OF ONE `listTimeOffBlocks` PER THERAPIST AND IT
  // CRASHED THE PAGE. The roster this page renders KEEPS a therapist with no
  // location assignment (filterRosterByViewerScope, deliberately - hiding an
  // unassigned colleague is a data-entry gap silently swallowing a real
  // person). The schedule gate REFUSES that same therapist, also deliberately.
  // Chained, the refusal rejected the whole batch, the server component threw,
  // and a located receptionist got "Application error: a client-side exception
  // has occurred" - in front of the clinic team. Full reasoning on
  // `manageableTargets` in lib/admin/schedule-scope.ts.
  const timeOffByTherapist = await listTimeOffBlocksForRoster(
    actor,
    therapists.map((t) => t.id),
  );

  const blockLabels: BlockLabels = {
    block: s["admin.workingHours.block"],
    blocksFor: s["admin.workingHours.blocksFor"],
    none: s["admin.workingHours.blocksNone"],
    addBlock: s["admin.workingHours.addBlock"],
    mode: s["admin.workingHours.blockMode"],
    pontual: s["admin.workingHours.blockPontual"],
    prolongada: s["admin.workingHours.blockProlongada"],
    date: s["admin.workingHours.blockDate"],
    fromDate: s["admin.workingHours.blockFrom"],
    toDate: s["admin.workingHours.blockTo"],
    start: s["admin.workingHours.start"],
    end: s["admin.workingHours.end"],
    note: s["admin.workingHours.blockNote"],
    save: s["common.save"],
    cancel: s["common.cancel"],
    edit: s["common.edit"],
    remove: s["admin.workingHours.blockRemove"],
    close: s["common.close"],
    // PL-22 — bloquear lote. Reuses the Agendar lote vocabulary so the two
    // recurrence forms read the same, and the existing weekday strings so the
    // day names cannot drift between the schedule editor and this form.
    lote: s["admin.workingHours.blockLote"],
    weekdays: s["lote.weekdays"],
    everyWeeks: s["lote.everyWeeks"],
    endMode: s["lote.endMode"],
    endAfterCount: s["lote.endAfterCount"],
    endOnDate: s["lote.endOnDate"],
    until: s["lote.until"],
    count: s["admin.workingHours.blockCount"],
    weekdayNames: [
      s["admin.workingHours.mon"],
      s["admin.workingHours.tue"],
      s["admin.workingHours.wed"],
      s["admin.workingHours.thu"],
      s["admin.workingHours.fri"],
      s["admin.workingHours.sat"],
      s["admin.workingHours.sun"],
    ],
  };
  const blockActions = {
    create: createTimeOffBlockAction,
    update: updateTimeOffBlockAction,
    remove: deleteTimeOffBlockAction,
  };

  const banner =
    m === "ok"
      ? { tone: "ok" as const, text: s["schedule.saved"] }
      : m && m.startsWith("err")
        ? { tone: "err" as const, text: s["schedule.error"] }
        : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-v2-text-primary">{s["schedule.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["schedule.subtitle"]}</p>
      </header>

      {banner && (
        <p
          role="status"
          className={
            banner.tone === "ok"
              ? "rounded-v2 border border-v2-border bg-v2-surface px-4 py-2 text-sm text-v2-text-primary"
              : "rounded-v2 border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
          }
        >
          {banner.text}
        </p>
      )}

      {therapists.length === 0 ? (
        <GlassPanel className="p-6">
          <p className="text-sm text-v2-text-secondary">{s["schedule.empty"]}</p>
        </GlassPanel>
      ) : (
        // SCHED-03: the cards are still built HERE, on the server, exactly as
        // before. RosterSearch receives them as nodes and decides only which are
        // hidden - it re-renders none of them and changes no prop of theirs.
        <RosterSearch
          cards={therapists.map((t) => {
          const timeOff = timeOffByTherapist.get(t.id);
          // A therapist this viewer cannot manage is RENDERED AND EXPLAINED, not
          // dropped and not shown with an empty editor. Dropping them would hide
          // a real colleague; an empty editor would say "no absences, no hours"
          // about someone whose schedule simply is not visible from here, and
          // every Guardar on it would be refused by the server anyway.
          if (!timeOff?.manageable) {
            return {
              id: t.id,
              name: t.label,
              card: (
                <GlassPanel className="flex flex-col gap-1 p-5">
                  <h2 className="text-lg font-medium text-v2-text-primary">{t.label}</h2>
                  <p className="text-sm font-medium text-v2-text-primary">
                    {s["schedule.unmanagedTitle"]}
                  </p>
                  <p className="text-sm text-v2-text-secondary">
                    {s["schedule.unmanagedBody"]}
                  </p>
                </GlassPanel>
              ),
            };
          }
          return {
            id: t.id,
            name: t.label,
            card: (
              <GlassPanel className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-medium text-v2-text-primary">{t.label}</h2>
                  <div className="flex items-center gap-2">
                    {/* ITEM 5: sits beside Bloquear horario because both are
                        "change this therapist's availability", and reception
                        looks for them in the same place. */}
                    <AlternatingWeeksPanel
                      therapistId={t.id}
                      therapistName={t.label}
                      locations={locations}
                    />
                    {/* SCHED-04: the third entry mode, beside the second. Both
                        answer "this therapist's dates are not the ordinary
                        week"; one has a pattern, one does not. */}
                    <DayByDayPanel
                      therapistId={t.id}
                      therapistName={t.label}
                      locations={locations}
                    />
                    <TherapistBlocks
                      therapistId={t.id}
                      therapistName={t.label}
                      blocks={timeOff.blocks}
                      labels={blockLabels}
                      actions={blockActions}
                    />
                  </div>
                </div>
                <WeekScheduleEditor
                  userId={t.id}
                  days={buildDays(t.id)}
                  locations={locations}
                />
              </GlassPanel>
            ),
          };
          })}
        />
      )}
    </main>
  );
}
