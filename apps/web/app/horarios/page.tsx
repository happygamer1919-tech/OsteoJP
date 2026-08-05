import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { GlassPanel } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { listAvailabilityTemplates } from "@/lib/admin/availability";
import { listTimeOffBlocks } from "@/lib/admin/time-off";
import { buildScheduleDays, indexScheduleTemplates } from "@/lib/admin/schedule-days";
import {
  TherapistBlocks,
  type BlockLabels,
  type BlockView,
} from "@/app/admin/working-hours/TherapistBlocks";
import type { ScheduleDay } from "@/app/admin/staff/StaffManageModal";
import { WeekScheduleEditor } from "./WeekScheduleEditor";
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
  const therapists = options.therapists; // { id, label }, location-scoped
  const locations = options.locations.map((l) => ({ id: l.id, name: l.label }));

  // Up to TWO active templates per (therapist, weekday) since W13-A, so a split
  // shift survives a reload. SHARED with the Equipa surface deliberately: these
  // two loaders were byte-identical, they feed editors that share one
  // ScheduleDay type, and one learning to load a second period without the other
  // would mean reception saves a split shift and admin archives it.
  const templateIndex = indexScheduleTemplates(availability);
  const buildDays = (userId: string): ScheduleDay[] =>
    buildScheduleDays(templateIndex, userId, WEEKDAY_ORDER, (wd) => s[WEEKDAY_KEYS[wd]]);

  // Time-off blocks per therapist (listTimeOffBlocks re-asserts own-location).
  const blocksByTherapist = new Map<string, BlockView[]>(
    await Promise.all(
      therapists.map(
        async (t): Promise<[string, BlockView[]]> => [t.id, await listTimeOffBlocks(actor, t.id)],
      ),
    ),
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
        therapists.map((t) => (
          <GlassPanel key={t.id} className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium text-v2-text-primary">{t.label}</h2>
              <TherapistBlocks
                therapistId={t.id}
                therapistName={t.label}
                blocks={blocksByTherapist.get(t.id) ?? []}
                labels={blockLabels}
                actions={blockActions}
              />
            </div>
            <WeekScheduleEditor userId={t.id} days={buildDays(t.id)} locations={locations} />
          </GlassPanel>
        ))
      )}
    </main>
  );
}
