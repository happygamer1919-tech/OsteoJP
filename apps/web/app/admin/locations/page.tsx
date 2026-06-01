import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listLocations } from "@/lib/admin/locations";
import {
  createLocationAction,
  setLocationActiveAction,
  updateLocationAction,
} from "./actions";

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
    <section className="space-y-6">
      <h2 className="text-base font-semibold">{s["admin.locations.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success" : "text-error"}`}>
          {banner.text}
        </p>
      )}

      <form action={createLocationAction} className="flex flex-wrap items-end gap-2 rounded border p-4">
        <Labeled label={s["admin.locations.name"]}>
          <input name="name" required className="rounded border px-2 py-1.5 text-sm" />
        </Labeled>
        <Labeled label={s["admin.locations.address"]}>
          <input name="address" className="w-64 rounded border px-2 py-1.5 text-sm" />
        </Labeled>
        <Labeled label={s["admin.locations.phone"]}>
          <input name="phone" className="w-40 rounded border px-2 py-1.5 text-sm" />
        </Labeled>
        <button type="submit" className="rounded border px-3 py-2 text-sm font-medium">
          {s["admin.locations.add"]}
        </button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">{s["admin.locations.name"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.locations.address"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.locations.phone"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.locations.status"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colActions"]}</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={loc.id} className="border-b align-top">
              <td colSpan={4} className="py-2 pr-4">
                <form action={updateLocationAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={loc.id} />
                  <input name="name" defaultValue={loc.name} required className="rounded border px-2 py-1 text-sm" />
                  <input name="address" defaultValue={loc.address ?? ""} className="w-56 rounded border px-2 py-1 text-sm" />
                  <input name="phone" defaultValue={loc.phone ?? ""} className="w-36 rounded border px-2 py-1 text-sm" />
                  <span className="text-xs text-text-secondary">
                    {loc.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                  </span>
                  <button type="submit" className="rounded border px-2 py-1 text-sm">
                    {s["common.save"]}
                  </button>
                </form>
              </td>
              <td className="py-2 pr-4">
                <form action={setLocationActiveAction}>
                  <input type="hidden" name="id" value={loc.id} />
                  <input type="hidden" name="active" value={loc.isActive ? "false" : "true"} />
                  <button type="submit" className="rounded border px-2 py-1 text-sm">
                    {loc.isActive ? s["admin.locations.archive"] : s["admin.locations.restore"]}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
