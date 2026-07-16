import { Fragment } from "react";
import { Button, GlassPanel, StatusBadge } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  effectivePriceCents,
  getReferencedServiceIds,
  listServiceLocationPrices,
  listServiceOfferings,
  listServices,
  type ServiceView,
} from "@/lib/admin/services";
import { getReferencedPackIds, listPacks, type PackView } from "@/lib/admin/packs";
import {
  activeBaseServiceOptions,
  canHardDeletePack,
  filterPacksByStatus,
  parsePackStatusFilter,
  type PackStatusFilter,
} from "@/lib/admin/pack-filters";
import { listLocations, type LocationView } from "@/lib/admin/locations";
import {
  createPackAction,
  createServiceAction,
  deletePackAction,
  deleteServiceAction,
  setPackActiveAction,
  setServiceActiveAction,
  setServiceLocationPricesAction,
  updatePackAction,
  updateServiceAction,
} from "./actions";
import {
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
  searchParams: Promise<{ m?: string; mp?: string; pf?: string }>;
}) {
  const actor = await requireRequestContext();
  const [services, locations, locationPrices, referencedIds, offerings, packs, referencedPackIds] =
    await Promise.all([
      listServices(actor),
      listLocations(actor),
      listServiceLocationPrices(actor),
      getReferencedServiceIds(actor),
      listServiceOfferings(actor),
      listPacks(actor),
      getReferencedPackIds(actor),
    ]);
  const { m, mp, pf } = await searchParams;

  // Active locations only; overrides keyed by `${serviceId}:${locationId}`.
  const activeLocations = locations.filter((l) => l.isActive);
  const overrideByServiceLocation = new Map<string, number>();
  for (const p of locationPrices) {
    overrideByServiceLocation.set(`${p.serviceId}:${p.locationId}`, p.priceCents);
  }
  // Offered-only-where-priced (W8-01a): a service is OFFERED at a location iff
  // an active price row exists there. Drives the "Oferecido aqui" affordance.
  const offeredServiceLocation = new Set<string>();
  for (const o of offerings) offeredServiceLocation.add(`${o.serviceId}:${o.locationId}`);

  // Pack table filter INCLUDES inactive by default (W6-01b split).
  const packFilter = parsePackStatusFilter(pf);
  const visiblePacks = filterPacksByStatus(packs, packFilter);
  const activeServices = activeBaseServiceOptions(services);
  const serviceNameById = new Map(services.map((svc) => [svc.id, svc.name] as const));
  const locationNameById = new Map(locations.map((l) => [l.id, l.name] as const));

  const banner =
    m === "ok" ? { ok: true, text: s["admin.services.saved"] }
    : m === "err:has_references" ? { ok: false, text: s["admin.services.deleteHasReferences"] }
    : m && m.startsWith("err") ? { ok: false, text: s["admin.services.error"] }
    : mp === "ok" ? { ok: true, text: s["admin.packs.saved"] }
    : mp === "err:has_references" ? { ok: false, text: s["admin.packs.deleteHasReferences"] }
    : mp && mp.startsWith("err") ? { ok: false, text: s["admin.packs.error"] }
    : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.services.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success-700" : "text-error"}`} role="status">
          {banner.text}
        </p>
      )}

      <GlassPanel title={s["admin.services.add"]}>
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
          <label className="flex items-center gap-2 pb-2 text-sm text-v2-text-primary">
            <input type="checkbox" name="contraindicationSensitive" />
            {s["admin.services.contraindicationSensitive"]}
          </label>
          <Button type="submit" variant="primary">
            {s["admin.services.add"]}
          </Button>
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
              {services.map((svc) => {
                const referenced = referencedIds.has(svc.id);
                return (
                  <Fragment key={svc.id}>
                    <tr className={adminTrBorder}>
                      <td className={adminTd}>{svc.name}</td>
                      <td className={adminTd}>{svc.durationMin}</td>
                      <td className={adminTd}>
                        {svc.priceCents === null ? "—" : `${euros(svc.priceCents)} ${svc.currency}`}
                      </td>
                      <td className={adminTd}>
                        <StatusBadge tone={svc.isActive ? "confirmed" : "cancelled"}>
                          {svc.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                        </StatusBadge>
                      </td>
                      <td className={adminTd}>
                        {/* Row-actions disclosure (UI-STYLE.md): edit, archive/restore,
                            and the reference-guarded delete grouped into a drawer. */}
                        <details className="group">
                          <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-v2 border border-v2-border bg-v2-surface px-3 py-1.5 text-sm text-v2-text-primary hover:bg-v2-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden">
                            {s["admin.staff.manage"]}
                          </summary>
                          <div className="mt-3 flex flex-col gap-3 rounded-v2 border border-v2-border bg-v2-surface p-3">
                            <form action={updateServiceAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="id" value={svc.id} />
                              <input name="name" defaultValue={svc.name} required aria-label={s["admin.services.name"]} className={adminInputInline} />
                              <input name="durationMin" type="number" min={1} defaultValue={svc.durationMin} required aria-label={s["admin.services.duration"]} className={`w-20 ${adminInputInline}`} />
                              <input name="price" type="text" inputMode="decimal" defaultValue={euros(svc.priceCents)} placeholder="0.00" aria-label={s["admin.services.price"]} className={`w-24 ${adminInputInline}`} />
                              <label className="flex items-center gap-1 text-sm text-v2-text-primary">
                                <input type="checkbox" name="contraindicationSensitive" defaultChecked={svc.contraindicationSensitive} aria-label={s["admin.services.contraindicationSensitive"]} />
                                {s["admin.services.contraindicationSensitive"]}
                              </label>
                              <Button type="submit" variant="ghost" size="sm">
                                {s["common.save"]}
                              </Button>
                            </form>
                            <div className="flex flex-wrap items-center gap-2">
                              <form action={setServiceActiveAction}>
                                <input type="hidden" name="id" value={svc.id} />
                                <input type="hidden" name="active" value={svc.isActive ? "false" : "true"} />
                                <Button type="submit" variant="ghost" size="sm">
                                  {svc.isActive ? s["admin.services.archive"] : s["admin.services.restore"]}
                                </Button>
                              </form>
                              {/* Reference-guarded delete (NO password, W4-15). Referenced
                                  service → disabled control + tooltip (archive-only);
                                  zero-reference → hard-delete. Server-enforced regardless. */}
                              {referenced ? (
                                <span title={s["admin.services.deleteBlockedTooltip"]} className="inline-flex">
                                  <Button type="button" variant="ghost" size="sm" disabled>
                                    {s["admin.services.delete"]}
                                  </Button>
                                </span>
                              ) : (
                                <form action={deleteServiceAction}>
                                  <input type="hidden" name="id" value={svc.id} />
                                  <Button type="submit" variant="destructive" size="sm">
                                    {s["admin.services.delete"]}
                                  </Button>
                                </form>
                              )}
                            </div>
                          </div>
                        </details>
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
                                // Offered-only-where-priced: an active price row
                                // AT this location = offered here (W8-01a).
                                const offered = offeredServiceLocation.has(`${svc.id}:${loc.id}`);
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
                                    <span className="mt-1 flex items-center gap-2">
                                      <StatusBadge tone={offered ? "confirmed" : "cancelled"}>
                                        {offered
                                          ? s["admin.services.offeredHere"]
                                          : s["admin.services.notOfferedHere"]}
                                      </StatusBadge>
                                      <span className={adminHelp}>
                                        {override === null
                                          ? s["admin.services.usesBasePrice"]
                                          : `${s["admin.services.effective"]}: ${euros(effective)}`}
                                      </span>
                                    </span>
                                  </Labeled>
                                );
                              })}
                              <Button type="submit" variant="primary">
                                {s["admin.services.savePrices"]}
                              </Button>
                            </form>
                          )}
                        </details>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      <PacksSection
        packs={visiblePacks}
        activeServices={activeServices}
        activeLocations={activeLocations}
        referencedPackIds={referencedPackIds}
        packFilter={packFilter}
        serviceNameById={serviceNameById}
        locationNameById={locationNameById}
      />
    </section>
  );
}

const PACK_FILTERS: { value: PackStatusFilter; labelKey: keyof typeof s }[] = [
  { value: "all", labelKey: "admin.packs.filterAll" },
  { value: "active", labelKey: "admin.packs.filterActive" },
  { value: "inactive", labelKey: "admin.packs.filterInactive" },
];

function PacksSection({
  packs,
  activeServices,
  activeLocations,
  referencedPackIds,
  packFilter,
  serviceNameById,
  locationNameById,
}: {
  packs: PackView[];
  activeServices: ServiceView[];
  activeLocations: LocationView[];
  referencedPackIds: Set<string>;
  packFilter: PackStatusFilter;
  serviceNameById: Map<string, string>;
  locationNameById: Map<string, string>;
}) {
  return (
    <>
      <GlassPanel title={s["admin.packs.add"]}>
        {activeServices.length === 0 ? (
          <p className={adminHelp}>{s["admin.packs.noBaseServices"]}</p>
        ) : (
          <form action={createPackAction} className="flex flex-wrap items-end gap-3">
            <Labeled label={s["admin.packs.name"]}>
              <input name="name" required className={adminInputInline} />
            </Labeled>
            <Labeled label={s["admin.packs.baseService"]}>
              {/* Creation dropdown: ACTIVE services only (W6-01b split). */}
              <select name="baseServiceId" required className={adminInputInline}>
                {activeServices.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label={s["admin.packs.sessionCount"]}>
              <input
                name="sessionCount"
                type="number"
                min={1}
                step={1}
                defaultValue={10}
                required
                className={`w-24 ${adminInputInline}`}
              />
            </Labeled>
            <Labeled label={s["admin.packs.price"]}>
              <input
                name="price"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                required
                className={`w-28 ${adminInputInline}`}
              />
            </Labeled>
            <Labeled label={s["admin.packs.location"]}>
              <select name="locationId" className={adminInputInline}>
                <option value="">{s["admin.packs.allLocations"]}</option>
                {activeLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Button type="submit" variant="primary">
              {s["admin.packs.add"]}
            </Button>
          </form>
        )}
      </GlassPanel>

      <GlassPanel title={s["admin.packs.title"]}>
        {/* Filter INCLUDES inactive (W6-01b split): "Todos"/"Inativos" surface
            archived packs so they can be restored. */}
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={s["admin.packs.filterLabel"]}>
          <span className={adminHelp}>{s["admin.packs.filterLabel"]}:</span>
          {PACK_FILTERS.map((f) => (
            <a
              key={f.value}
              href={`/admin/services?pf=${f.value}`}
              aria-current={packFilter === f.value ? "true" : undefined}
              className={`rounded-v2 border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
                packFilter === f.value
                  ? "border-v2-border bg-v2-surface-hover text-v2-text-primary"
                  : "border-transparent text-v2-text-secondary hover:bg-v2-surface-hover"
              }`}
            >
              {s[f.labelKey]}
            </a>
          ))}
        </div>

        {packs.length === 0 ? (
          <p className={adminHelp}>{s["admin.packs.none"]}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className={adminTrBorder}>
                  <th className={adminTh}>{s["admin.packs.name"]}</th>
                  <th className={adminTh}>{s["admin.packs.baseService"]}</th>
                  <th className={adminTh}>{s["admin.packs.sessionCount"]}</th>
                  <th className={adminTh}>{s["admin.packs.price"]}</th>
                  <th className={adminTh}>{s["admin.packs.location"]}</th>
                  <th className={adminTh}>{s["admin.services.status"]}</th>
                  <th className={adminTh}>{s["admin.staff.colActions"]}</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((pack) => {
                  const deletable = canHardDeletePack(referencedPackIds, pack.id);
                  const baseName = serviceNameById.get(pack.baseServiceId) ?? pack.baseServiceId;
                  const locName =
                    pack.locationId === null
                      ? s["admin.packs.allLocations"]
                      : (locationNameById.get(pack.locationId) ?? pack.locationId);
                  // Edit dropdown shows active services; keep the current base
                  // selectable even if it was archived after creation, so the
                  // form's defaultValue always matches an option.
                  const editServiceOptions = activeServices.map((svc) => ({
                    id: svc.id,
                    name: svc.name,
                  }));
                  if (!editServiceOptions.some((o) => o.id === pack.baseServiceId)) {
                    editServiceOptions.push({ id: pack.baseServiceId, name: baseName });
                  }
                  return (
                    <tr key={pack.id} className={adminTrBorder}>
                      <td className={adminTd}>{pack.name}</td>
                      <td className={adminTd}>{baseName}</td>
                      <td className={adminTd}>{pack.sessionCount}</td>
                      <td className={adminTd}>
                        {euros(pack.priceCents)} {pack.currency}
                      </td>
                      <td className={adminTd}>{locName}</td>
                      <td className={adminTd}>
                        <StatusBadge tone={pack.isActive ? "confirmed" : "cancelled"}>
                          {pack.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                        </StatusBadge>
                      </td>
                      <td className={adminTd}>
                        <details className="group">
                          <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-v2 border border-v2-border bg-v2-surface px-3 py-1.5 text-sm text-v2-text-primary hover:bg-v2-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden">
                            {s["admin.staff.manage"]}
                          </summary>
                          <div className="mt-3 flex flex-col gap-3 rounded-v2 border border-v2-border bg-v2-surface p-3">
                            <form action={updatePackAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="id" value={pack.id} />
                              <input
                                name="name"
                                defaultValue={pack.name}
                                required
                                aria-label={s["admin.packs.name"]}
                                className={adminInputInline}
                              />
                              <select
                                name="baseServiceId"
                                defaultValue={pack.baseServiceId}
                                required
                                aria-label={s["admin.packs.baseService"]}
                                className={adminInputInline}
                              >
                                {editServiceOptions.map((svc) => (
                                  <option key={svc.id} value={svc.id}>
                                    {svc.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                name="sessionCount"
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={pack.sessionCount}
                                required
                                aria-label={s["admin.packs.sessionCount"]}
                                className={`w-20 ${adminInputInline}`}
                              />
                              <input
                                name="price"
                                type="text"
                                inputMode="decimal"
                                defaultValue={euros(pack.priceCents)}
                                required
                                aria-label={s["admin.packs.price"]}
                                className={`w-24 ${adminInputInline}`}
                              />
                              <select
                                name="locationId"
                                defaultValue={pack.locationId ?? ""}
                                aria-label={s["admin.packs.location"]}
                                className={adminInputInline}
                              >
                                <option value="">{s["admin.packs.allLocations"]}</option>
                                {activeLocations.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.name}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit" variant="ghost" size="sm">
                                {s["common.save"]}
                              </Button>
                            </form>
                            <div className="flex flex-wrap items-center gap-2">
                              <form action={setPackActiveAction}>
                                <input type="hidden" name="id" value={pack.id} />
                                <input type="hidden" name="active" value={pack.isActive ? "false" : "true"} />
                                <Button type="submit" variant="ghost" size="sm">
                                  {pack.isActive ? s["admin.packs.archive"] : s["admin.packs.restore"]}
                                </Button>
                              </form>
                              {deletable ? (
                                <form action={deletePackAction}>
                                  <input type="hidden" name="id" value={pack.id} />
                                  <Button type="submit" variant="destructive" size="sm">
                                    {s["admin.packs.delete"]}
                                  </Button>
                                </form>
                              ) : (
                                <span title={s["admin.packs.deleteBlockedTooltip"]} className="inline-flex">
                                  <Button type="button" variant="ghost" size="sm" disabled>
                                    {s["admin.packs.delete"]}
                                  </Button>
                                </span>
                              )}
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </>
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
