import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireActor } from "@/lib/auth/context";
import { listServices } from "@/lib/admin/services";
import {
  createServiceAction,
  setServiceActiveAction,
  updateServiceAction,
} from "./actions";

const s = getStrings(DEFAULT_LOCALE);

function euros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireActor();
  const services = await listServices(actor);
  const { m } = await searchParams;

  const banner =
    m === "ok" ? { ok: true, text: s["admin.services.saved"] }
    : m && m.startsWith("err") ? { ok: false, text: s["admin.services.error"] }
    : null;

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold">{s["admin.services.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-green-700" : "text-red-700"}`}>
          {banner.text}
        </p>
      )}

      <form action={createServiceAction} className="flex flex-wrap items-end gap-2 rounded border p-4">
        <Labeled label={s["admin.services.name"]}>
          <input name="name" required className="rounded border px-2 py-1.5 text-sm" />
        </Labeled>
        <Labeled label={s["admin.services.duration"]}>
          <input name="durationMin" type="number" min={1} defaultValue={60} required className="w-24 rounded border px-2 py-1.5 text-sm" />
        </Labeled>
        <Labeled label={s["admin.services.price"]}>
          <input name="price" type="text" inputMode="decimal" placeholder="0.00" className="w-28 rounded border px-2 py-1.5 text-sm" />
        </Labeled>
        <button type="submit" className="rounded border px-3 py-2 text-sm font-medium">
          {s["admin.services.add"]}
        </button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">{s["admin.services.name"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.services.duration"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.services.price"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.services.status"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colActions"]}</th>
          </tr>
        </thead>
        <tbody>
          {services.map((svc) => (
            <tr key={svc.id} className="border-b align-top">
              <td colSpan={4} className="py-2 pr-4">
                <form action={updateServiceAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={svc.id} />
                  <input name="name" defaultValue={svc.name} required className="rounded border px-2 py-1 text-sm" />
                  <input name="durationMin" type="number" min={1} defaultValue={svc.durationMin} required className="w-20 rounded border px-2 py-1 text-sm" />
                  <input name="price" type="text" inputMode="decimal" defaultValue={euros(svc.priceCents)} placeholder="0.00" className="w-24 rounded border px-2 py-1 text-sm" />
                  <span className="text-xs text-neutral-500">
                    {svc.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                  </span>
                  <button type="submit" className="rounded border px-2 py-1 text-sm">
                    {s["common.save"]}
                  </button>
                </form>
              </td>
              <td className="py-2 pr-4">
                <form action={setServiceActiveAction}>
                  <input type="hidden" name="id" value={svc.id} />
                  <input type="hidden" name="active" value={svc.isActive ? "false" : "true"} />
                  <button type="submit" className="rounded border px-2 py-1 text-sm">
                    {svc.isActive ? s["admin.services.archive"] : s["admin.services.restore"]}
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
