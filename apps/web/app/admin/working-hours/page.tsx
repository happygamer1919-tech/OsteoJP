import Link from "next/link";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listAvailabilityTemplates } from "@/lib/admin/availability";
import { listTimeOffBlocks } from "@/lib/admin/time-off";
import { listStaff } from "@/lib/admin/staff";
import { listLocations } from "@/lib/admin/locations";
import { adminHelp } from "../admin-ui";
import {
  TherapistScheduleCard,
  type ScheduleDay,
  type ScheduleLabels,
} from "./TherapistScheduleCard";
import type { BlockLabels, BlockView } from "./TherapistBlocks";

const s = getStrings(DEFAULT_LOCALE);

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

const LABELS: ScheduleLabels = {
  editSchedule: s["admin.workingHours.editSchedule"],
  scheduleFor: s["admin.workingHours.scheduleFor"],
  noHours: s["admin.workingHours.noHours"],
  worksLabel: s["admin.workingHours.worksLabel"],
  start: s["admin.workingHours.start"],
  end: s["admin.workingHours.end"],
  location: s["admin.workingHours.location"],
  save: s["common.save"],
  cancel: s["common.cancel"],
};

const BLOCK_LABELS: BlockLabels = {
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
};

export default async function WorkingHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; t?: string }>;
}) {
  const actor = await requireRequestContext();
  const [templates, staff, locations] = await Promise.all([
    listAvailabilityTemplates(actor),
    listStaff(actor),
    listLocations(actor),
  ]);
  // Practitioners take appointments (everyone except reception); active locations only.
  const therapists = staff.filter((u) => u.roleSlug !== "reception");

  // W5-12 — time_off blocks per therapist (Bloquear horário). One query per shown
  // therapist; scoped to the shown set below to avoid over-fetching.
  const blocksByTherapist = new Map<string, BlockView[]>(
    await Promise.all(
      therapists.map(
        async (u): Promise<[string, BlockView[]]> => [u.id, await listTimeOffBlocks(actor, u.id)],
      ),
    ),
  );
  const activeLocations = locations
    .filter((l) => l.isActive)
    .map((l) => ({ id: l.id, name: l.name }));
  const { m, t: focusId } = await searchParams;

  // W4-14 (deep link, W4-01 part b): reached from the Equipa row
  // (?t=<therapistId>), focus the view on that therapist's card and auto-open
  // its Editar horário modal. The CRUD is unchanged; this is just scoping.
  //
  // A block save/edit/delete (runBlock) also redirects with &t=<id> to keep the
  // therapist focused, but ALWAYS carries an ?m=<code>. Auto-opening the schedule
  // modal after a block op would stack a second modal over the just-reloaded
  // page and its fieldsets would intercept the next open-blocks click. So only
  // the PURE Equipa deep-link (no m) auto-opens the schedule modal.
  const focused = focusId ? therapists.find((u) => u.id === focusId) ?? null : null;
  const autoOpenSchedule = focused != null && !m;
  const shownTherapists = focused ? therapists.filter((u) => u.id === focused.id) : therapists;

  // First ACTIVE template per (therapist, weekday). The modal tracks exactly one
  // id per weekday, so a second same-weekday template (different location) is
  // never surfaced and never archived by the reconcile.
  const firstByKey = new Map<string, (typeof templates)[number]>();
  for (const tpl of templates) {
    const key = `${tpl.userId}:${tpl.weekday}`;
    if (!firstByKey.has(key)) firstByKey.set(key, tpl);
  }

  const buildDays = (therapistId: string): ScheduleDay[] =>
    WEEKDAY_ORDER.map((wd) => {
      const tpl = firstByKey.get(`${therapistId}:${wd}`);
      return {
        weekday: wd,
        label: s[WEEKDAY_KEYS[wd]],
        on: tpl != null,
        id: tpl?.id ?? "",
        start: tpl?.startTime ?? "09:00",
        end: tpl?.endTime ?? "17:00",
        locationId: tpl?.locationId ?? "",
      };
    });

  // "warn:<n>" — a block was saved but overlaps n existing appointments. The
  // appointments are kept (never auto-cancelled, Q-W5-4); this is an advisory.
  const warnCount = m && m.startsWith("warn:") ? Number.parseInt(m.slice(5), 10) : 0;
  const banner =
    warnCount > 0
      ? {
          tone: "warn" as const,
          text: s["admin.workingHours.blockOverlapWarn"].replace("{n}", String(warnCount)),
        }
      : m === "ok"
        ? { tone: "ok" as const, text: s["admin.workingHours.saved"] }
        : m && m.startsWith("err")
          ? { tone: "err" as const, text: s["admin.workingHours.error"] }
          : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.workingHours.title"]}</h2>
      <p className={adminHelp}>{s["admin.workingHours.help"]}</p>

      {focused && (
        <p className={adminHelp} role="status">
          {s["admin.workingHours.focusedOn"]}: <strong>{focused.fullName}</strong> ·{" "}
          <Link href="/admin/working-hours" className="text-brand-teal underline hover:no-underline">
            {s["admin.workingHours.showAll"]}
          </Link>
        </p>
      )}

      {banner && (
        <p
          className={`text-sm ${
            banner.tone === "ok"
              ? "text-success-700"
              : banner.tone === "warn"
                ? "text-warning-700"
                : "text-error"
          }`}
          role="status"
          data-testid="wh-banner"
        >
          {banner.text}
        </p>
      )}

      {shownTherapists.length === 0 ? (
        <p className={adminHelp}>{s["admin.workingHours.empty"]}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {shownTherapists.map((u) => (
            <TherapistScheduleCard
              key={u.id}
              therapistId={u.id}
              therapistName={u.fullName}
              days={buildDays(u.id)}
              locations={activeLocations}
              labels={LABELS}
              blocks={blocksByTherapist.get(u.id) ?? []}
              blockLabels={BLOCK_LABELS}
              autoOpen={autoOpenSchedule && focused?.id === u.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
