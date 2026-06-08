import { Fragment } from "react";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  effectivePriceCents,
  listServiceLocationPrices,
  listServices,
} from "@/lib/admin/services";
import { listLocations } from "@/lib/admin/locations";
import {
  createServiceAction,
  setServiceActiveAction,
  setServiceLocationPricesAction,
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
  const actor = await requireRequestContext();
  const [services, locations, locationPrices] = await Promise.all([
    listServices(actor),
    listLocations(actor),
    listServiceLocationPrices(actor),
  ]);
  const { m } = await searchParams;

  // Active locations only; overrides keyed by `${serviceId}:${locationId}`.
  const activeLocations = locations.filter((l) => l.isActive);
  const overrideByServiceLocation = new Map<string, number>();
  for (const p of locationPrices) {
    overrideByServiceLocation.set(`${p.serviceId}:${p.locationId}`, p.priceCents);
  }

  const banner =
    m === "ok" ? { ok: true, text: s["admin.services.saved"] }
    : m && m.startsWith("err") ? { ok: false, text: s["admin.services.error"] }
    : null;

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold">{s["admin.services.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success" : "text-error"}`}>
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
            <Fragment key={svc.id}>
              <tr className="border-b align-top">
                <td colSpan={4} className="py-2 pr-4">
                  <form action={updateServiceAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={svc.id} />
                    <input name="name" defaultValue={svc.name} required className="rounded border px-2 py-1 text-sm" />
                    <input name="durationMin" type="number" min={1} defaultValue={svc.durationMin} required className="w-20 rounded border px-2 py-1 text-sm" />
                    <input name="price" type="text" inputMode="decimal" defaultValue={euros(svc.priceCents)} placeholder="0.00" className="w-24 rounded border px-2 py-1 text-sm" />
                    <span className="text-xs text-text-secondary">
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
              <tr className="border-b">
                <td colSpan={5} className="pb-3 pr-4">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {s["admin.services.locationPrices"]}
                    </summary>
                    {activeLocations.length === 0 ? (
                      <p className="mt-2 text-xs text-text-secondary">
                        {s["admin.services.noLocations"]}
                      </p>
                    ) : (
                      <form
                        action={setServiceLocationPricesAction}
                        className="mt-2 flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="serviceId" value={svc.id} />
                        <p className="w-full text-xs text-text-secondary">
                          {s["admin.services.basePrice"]}:{" "}
                          {svc.priceCents === null
                            ? s["admin.services.noBasePrice"]
                            : `${euros(svc.priceCents)} ${svc.currency}`}
                        </p>
                        {activeLocations.map((loc) => {
                          const override =
                            overrideByServiceLocation.get(`${svc.id}:${loc.id}`) ?? null;
                          const effective = effectivePriceCents(svc.priceCents, override);
                          return (
                            <Labeled key={loc.id} label={loc.name}>
                              <input
                                name={`price__${loc.id}`}
                                type="text"
                                inputMode="decimal"
                                defaultValue={euros(override)}
                                placeholder={euros(svc.priceCents) || "0.00"}
                                className="w-24 rounded border px-2 py-1 text-sm"
                              />
                              <span className="block text-xs text-text-secondary">
                                {override === null
                                  ? s["admin.services.usesBasePrice"]
                                  : `${s["admin.services.effective"]}: ${euros(effective)}`}
                              </span>
                            </Labeled>
                          );
                        })}
                        <button type="submit" className="rounded border px-3 py-1.5 text-sm font-medium">
                          {s["admin.services.savePrices"]}
                        </button>
                      </form>
                    )}
                  </details>
                </td>
              </tr>
            </Fragment>
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
