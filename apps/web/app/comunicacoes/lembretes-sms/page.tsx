import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { commsSectionsForRole } from "@/lib/nav/comms-sections";
import { listReminderLog } from "@/lib/reminders/reminder-log";
import {
  kindLabel,
  kindOf,
  phoneForDisplay,
  scheduledFor,
  statusOf,
} from "@/lib/reminders/reminder-log-core";

import { Pager } from "@/components/pager.client";
import { CommsNav } from "../comms-nav.client";
import { ReminderLogSearch } from "./reminder-log-search.client";
import { ReminderLogTable, type ReminderLogRowView } from "./reminder-log-table";

export const metadata = { title: s["remindersLog.title"] };

const BASE = "/comunicacoes/lembretes-sms";

/**
 * Europe/Lisbon, ON THE SERVER. A Date formatted in the browser renders in the
 * browser's zone, wrong by an hour twice a year on a laptop set elsewhere and
 * silently so - the rule /recuperacao settled.
 */
const DATETIME_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Lisbon",
};

function stamp(d: Date): string {
  return d.toLocaleString("pt-PT", DATETIME_FMT);
}

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Longer than any name; a bound on how many tokens one request can AND together. */
const MAX_SEARCH_LENGTH = 100;

function href(next: { page?: number; onlyFailures: boolean; q: string }): string {
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.onlyFailures) p.set("falhas", "1");
  if (next.page && next.page > 1) p.set("page", String(next.page));
  const q = p.toString();
  return q ? `${BASE}?${q}` : BASE;
}

const filterLinkCls = (active: boolean): string =>
  [
    "inline-flex h-9 items-center rounded-v2 border px-3 text-sm font-medium",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    active
      ? "border-v2-green-700 text-v2-text-primary"
      : "border-v2-border text-v2-text-secondary hover:text-v2-text-primary",
  ].join(" ");

/**
 * COMMS-01 (owner dispatch 2026-09-14, BL-2) - LEMBRETES SMS.
 *
 * THE ROUTE IS GATED, and so is the query. A viewer without
 * `reminders:log_read` is redirected (the courtesy); `listReminderLog` asserts
 * the capability and reads under the viewer's RLS (the boundary). A therapist is
 * sent away rather than shown an empty log, because 0075's policy gives them no
 * rows and an empty list would read as "nothing failed".
 */
export default async function LembretesSmsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "reminders:log_read")) redirect("/");

  const sp = await searchParams;
  const onlyFailures = firstParam(sp.falhas) === "1";
  // COMMS-03: the name search. Kept on every filter and page link below, so
  // Todos / Só falhas and the pages narrow WITHIN a search instead of dropping it.
  const q = (firstParam(sp.q) ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  const pageRaw = Number(firstParam(sp.page) ?? "1");
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const log = await listReminderLog(ctx, { page: requestedPage, onlyFailures, search: q });

  const rows: ReminderLogRowView[] = log.rows.map((r) => {
    const kind = kindOf(r.templateId);
    const due = scheduledFor(kind, { startsAt: r.appointmentStartsAt, endsAt: r.appointmentEndsAt });
    const status = statusOf(r);
    return {
      id: r.id,
      patientId: r.patientId,
      patientName: r.patientName,
      appointmentWhen: stamp(r.appointmentStartsAt),
      appointmentWho: [r.therapistName, r.locationName].filter(Boolean).join(" · ") || "—",
      channel: s["remindersLog.channelSms"],
      kind: kindLabel(kind, r.templateId),
      scheduledFor:
        due.kind === "at" ? stamp(due.at) : due.kind === "immediate" ? s["remindersLog.immediate"] : "—",
      // When WE handed it over. A suppressed row handed nothing over.
      sentAt: r.outcome === "suppressed" ? "—" : stamp(r.createdAt),
      statusLabel: status.label,
      statusTone: status.tone,
      errorCode: r.providerErrorCode ?? "—",
      phone: phoneForDisplay(r.patientPhone),
    };
  });

  const commsSections = commsSectionsForRole(ctx.role);

  return (
    <div className="flex flex-col gap-6 p-6">
      {commsSections.length > 1 && (
        <CommsNav
          items={commsSections.map(({ href: h, label }) => ({ href: h, label }))}
          label={s["comms.sectionsLabel"]}
        />
      )}
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold text-v2-text-primary">{s["remindersLog.title"]}</h1>
          <p className="mt-1 max-w-3xl text-sm text-v2-text-secondary">{s["remindersLog.subtitle"]}</p>
          <p className="mt-1 max-w-3xl text-xs text-v2-text-secondary">{s["remindersLog.gapNote"]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ReminderLogSearch initialQuery={q} />
          <nav aria-label={s["remindersLog.filterLabel"]} className="flex flex-wrap items-center gap-2">
            <Link
              href={href({ onlyFailures: false, q })}
              aria-current={!onlyFailures ? "page" : undefined}
              className={filterLinkCls(!onlyFailures)}
            >
              {s["remindersLog.filterAll"]}
            </Link>
            <Link
              href={href({ onlyFailures: true, q })}
              aria-current={onlyFailures ? "page" : undefined}
              className={filterLinkCls(onlyFailures)}
            >
              {s["remindersLog.filterFailures"]}
            </Link>
          </nav>
          <span className="ml-auto text-sm tabular-nums text-v2-text-secondary">
            {s["remindersLog.count"].replace("{shown}", String(rows.length)).replace("{total}", String(log.total))}
          </span>
        </div>

        <ReminderLogTable rows={rows} onlyFailures={onlyFailures} searching={q !== ""} />

        {/* U1: the shared pager. Its params are the two filters this route
            carries, spelled exactly as `href()` spells them, so a page turn
            preserves the active filter and a filter change still drops `page`. */}
        <Pager
          basePath={BASE}
          params={{ ...(q ? { q } : {}), ...(onlyFailures ? { falhas: "1" } : {}) }}
          page={log.page}
          pageCount={log.pageCount}
          total={log.total}
        />
      </section>
    </div>
  );
}
