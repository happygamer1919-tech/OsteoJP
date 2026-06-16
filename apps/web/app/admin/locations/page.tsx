import { GlassPanel } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listLocations } from "@/lib/admin/locations";
import {
  createLocationAction,
  setLocationActiveAction,
  updateLocationAction,
} from "./actions";
import {
  adminBtnGhost,
  adminBtnPrimary,
  adminHelp,
  adminInputInline,
  adminLabel,
  adminTd,
  adminTh,
  adminTrBorder,
} from "../admin-ui";

const s = getStrings(DEFAULT_LOCALE);

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireRequestContext();
  const locations = await listLocations(actor);
  const { m } = await searchParams;

  const banner =
    m === "ok" ? { ok: true, text: s["admin.locations.saved"] }
    : m && m.startsWith("err") ? { ok: false, text: s["admin.locations.error"] }
    : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.locations.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success-700" : "text-error"}`} role="status">
          {banner.text}
        </p>
      )}

      <GlassPanel>
        <form action={createLocationAction} className="flex flex-wrap items-end gap-3">
          <Labeled label={s["admin.locations.name"]}>
            <input name="name" required className={adminInputInline} />
          </Labeled>
          <Labeled label={s["admin.locations.address"]}>
            <input name="address" className={`w-64 ${adminInputInline}`} />
          </Labeled>
          <Labeled label={s["admin.locations.phone"]}>
            <input name="phone" className={`w-40 ${adminInputInline}`} />
          </Labeled>
          <button type="submit" className={adminBtnPrimary}>
            {s["admin.locations.add"]}
          </button>
        </form>
      </GlassPanel>

      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={adminTrBorder}>
                <th className={adminTh}>{s["admin.locations.name"]}</th>
                <th className={adminTh}>{s["admin.locations.address"]}</th>
                <th className={adminTh}>{s["admin.locations.phone"]}</th>
                <th className={adminTh}>{s["admin.locations.status"]}</th>
                <th className={adminTh}>{s["admin.staff.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id} className={adminTrBorder}>
                  <td colSpan={4} className={adminTd}>
                    <form action={updateLocationAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={loc.id} />
                      <input name="name" defaultValue={loc.name} required aria-label={s["admin.locations.name"]} className={adminInputInline} />
                      <input name="address" defaultValue={loc.address ?? ""} aria-label={s["admin.locations.address"]} className={`w-56 ${adminInputInline}`} />
                      <input name="phone" defaultValue={loc.phone ?? ""} aria-label={s["admin.locations.phone"]} className={`w-36 ${adminInputInline}`} />
                      <span className={adminHelp}>
                        {loc.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                      </span>
                      <button type="submit" className={adminBtnGhost}>
                        {s["common.save"]}
                      </button>
                    </form>
                  </td>
                  <td className={adminTd}>
                    <form action={setLocationActiveAction}>
                      <input type="hidden" name="id" value={loc.id} />
                      <input type="hidden" name="active" value={loc.isActive ? "false" : "true"} />
                      <button type="submit" className={adminBtnGhost}>
                        {loc.isActive ? s["admin.locations.archive"] : s["admin.locations.restore"]}
                      </button>
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className={`block ${adminLabel}`}>{label}</span>
      {children}
    </label>
  );
}
