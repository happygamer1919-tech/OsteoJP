import { Fragment } from "react";
import { GlassPanel } from "@osteojp/ui";
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
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.services.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success-700" : "text-error"}`} role="status">
          {banner.text}
        </p>
      )}

      <GlassPanel>
        <form action={createServiceAction} className="flex flex-wrap items-end gap-3">
          <Labeled label={s["admin.services.name"]}>
            <input name="name" required className={adminInputInline} />
          </Labeled>
          <Labeled label={s["admin.services.duration"]}>
            <input name="durationMin" type="number" min={1} defaultValue={60} required className={`w-24 ${adminInputInline}`} />
          </Labeled>
          <Labeled label={s["admin.services.price"]}>
            <input name="price" type="text" inputMode="decimal" placeholder="0.00" className={`w-28 ${adminInputInline}`} />
          </Labeled>
          <button type="submit" className={adminBtnPrimary}>
            {s["admin.services.add"]}
          </button>
        </form>
      </GlassPanel>

      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={adminTrBorder}>
                <th className={adminTh}>{s["admin.services.name"]}</th>
                <th className={adminTh}>{s["admin.services.duration"]}</th>
                <th className={adminTh}>{s["admin.services.price"]}</th>
                <th className={adminTh}>{s["admin.services.status"]}</th>
                <th className={adminTh}>{s["admin.staff.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <Fragment key={svc.id}>
                  <tr className={adminTrBorder}>
                    <td colSpan={4} className={adminTd}>
                      <form action={updateServiceAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={svc.id} />
                        <input name="name" defaultValue={svc.name} required aria-label={s["admin.services.name"]} className={adminInputInline} />
                        <input name="durationMin" type="number" min={1} defaultValue={svc.durationMin} required aria-label={s["admin.services.duration"]} className={`w-20 ${adminInputInline}`} />
                        <input name="price" type="text" inputMode="decimal" defaultValue={euros(svc.priceCents)} placeholder="0.00" aria-label={s["admin.services.price"]} className={`w-24 ${adminInputInline}`} />
                        <span className={adminHelp}>
                          {svc.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                        </span>
                        <button type="submit" className={adminBtnGhost}>
                          {s["common.save"]}
                        </button>
                      </form>
                    </td>
                    <td className={adminTd}>
                      <form action={setServiceActiveAction}>
                        <input type="hidden" name="id" value={svc.id} />
                        <input type="hidden" name="active" value={svc.isActive ? "false" : "true"} />
                        <button type="submit" className={adminBtnGhost}>
                          {svc.isActive ? s["admin.services.archive"] : s["admin.services.restore"]}
                        </button>
                      </form>
                    </td>
                  </tr>
                  <tr className={adminTrBorder}>
                    <td colSpan={5} className="pb-3 pr-4">
                      <details className="text-sm text-v2-text-primary">
                        <summary className={`cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${adminHelp}`}>
                          {s["admin.services.locationPrices"]}
                        </summary>
                        {activeLocations.length === 0 ? (
                          <p className={`mt-2 ${adminHelp}`}>
                            {s["admin.services.noLocations"]}
                          </p>
                        ) : (
                          <form action={setServiceLocationPricesAction} className="mt-2 flex flex-wrap items-end gap-3">
                            <input type="hidden" name="serviceId" value={svc.id} />
                            <p className={`w-full ${adminHelp}`}>
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
                                    className={`w-24 ${adminInputInline}`}
                                  />
                                  <span className={`block ${adminHelp}`}>
                                    {override === null
                                      ? s["admin.services.usesBasePrice"]
                                      : `${s["admin.services.effective"]}: ${euros(effective)}`}
                                  </span>
                                </Labeled>
                              );
                            })}
                            <button type="submit" className={adminBtnPrimary}>
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
