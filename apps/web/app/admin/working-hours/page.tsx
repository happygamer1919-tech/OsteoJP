import Link from "next/link";
import { Button, GlassPanel } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { requireRequestContext } from "@/lib/auth/context";
import { listAvailabilityTemplates } from "@/lib/admin/availability";
import { listStaff } from "@/lib/admin/staff";
import { listLocations } from "@/lib/admin/locations";
import {
  archiveAvailabilityTemplateAction,
  createAvailabilityTemplateAction,
  updateAvailabilityTemplateAction,
} from "./actions";
import { adminHelp, adminInputInline, adminLabel, adminTd, adminTh, adminTrBorder } from "../admin-ui";

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
  const activeLocations = locations.filter((l) => l.isActive);
  const { m, t: focusId } = await searchParams;

  // W4-01 (part b): when reached from the Equipa row (?t=<therapistId>), focus
  // the view on that therapist — filter the list and pre-select the create form.
  // The full CRUD is unchanged; this is just scoping.
  const focused = focusId ? therapists.find((u) => u.id === focusId) ?? null : null;
  const shownTemplates = focused ? templates.filter((tpl) => tpl.userId === focused.id) : templates;

  const banner =
    m === "ok"
      ? { ok: true, text: s["admin.workingHours.saved"] }
      : m && m.startsWith("err")
        ? { ok: false, text: s["admin.workingHours.error"] }
        : null;

  const weekdaySelect = (name: string, defaultValue?: number) => (
    <select name={name} defaultValue={defaultValue ?? 1} required aria-label={s["admin.workingHours.weekday"]} className={adminInputInline}>
      {WEEKDAY_KEYS.map((key, i) => (
        <option key={i} value={i}>
          {s[key]}
        </option>
      ))}
    </select>
  );

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
        <p className={`text-sm ${banner.ok ? "text-success-700" : "text-error"}`} role="status">
          {banner.text}
        </p>
      )}

      <GlassPanel>
        <form action={createAvailabilityTemplateAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.therapist"]}</span>
            <select name="userId" required defaultValue={focused?.id} className={adminInputInline}>
              {therapists.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.weekday"]}</span>
            {weekdaySelect("weekday")}
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.start"]}</span>
            <TimeFieldInput name="startTime" defaultValue="09:00" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.end"]}</span>
            <TimeFieldInput name="endTime" defaultValue="17:00" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={adminLabel}>{s["admin.workingHours.location"]}</span>
            <select name="locationId" required className={adminInputInline}>
              {activeLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary">
            {s["admin.workingHours.add"]}
          </Button>
        </form>
      </GlassPanel>

      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={adminTrBorder}>
                <th className={adminTh}>{s["admin.workingHours.therapist"]}</th>
                <th className={adminTh}>{s["admin.workingHours.weekday"]}</th>
                <th className={adminTh}>{s["admin.workingHours.hours"]}</th>
                <th className={adminTh}>{s["admin.workingHours.location"]}</th>
                <th className={adminTh} />
              </tr>
            </thead>
            <tbody>
              {shownTemplates.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${adminTd} ${adminHelp}`}>
                    {s["admin.workingHours.empty"]}
                  </td>
                </tr>
              )}
              {shownTemplates.map((t) => (
                <tr key={t.id} className={adminTrBorder}>
                  <td className={adminTd}>{t.userName}</td>
                  <td className={adminTd} colSpan={3}>
                    <form action={updateAvailabilityTemplateAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="userId" value={t.userId} />
                      {weekdaySelect("weekday", t.weekday)}
                      <TimeFieldInput name="startTime" defaultValue={t.startTime} />
                      <TimeFieldInput name="endTime" defaultValue={t.endTime} />
                      <select name="locationId" required defaultValue={t.locationId} aria-label={s["admin.workingHours.location"]} className={adminInputInline}>
                        {activeLocations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="ghost" size="sm">
                        {s["common.save"]}
                      </Button>
                    </form>
                  </td>
                  <td className={adminTd}>
                    <form action={archiveAvailabilityTemplateAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {s["admin.workingHours.archive"]}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </section>
  );
}
