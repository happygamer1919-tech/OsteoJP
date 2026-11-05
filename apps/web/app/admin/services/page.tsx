import { Fragment } from "react";
import { Button, GlassPanel, StatusBadge } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  archiveBlockedReason,
  effectivePriceCents,
  getServiceDeleteBlockers,
  listServiceLocationPrices,
  listServiceOfferings,
  listServices,
  packsBoundToService,
  type BlockingPack,
  type ServiceDeleteBlocker,
} from "@/lib/admin/services";
import {
  getReferencedPackIds,
  listPackLocationPrices,
  listPackOfferings,
  listPacks,
} from "@/lib/admin/packs";
import {
  activeBaseServiceOptions,
  filterPacksByStatus,
  parsePackStatusFilter,
} from "@/lib/admin/pack-filters";
import { listLocations } from "@/lib/admin/locations";
import {
  createServiceAction,
  deleteServiceAction,
  setServiceActiveAction,
  setServicePatientBookableAction,
  setServiceLocationPricesAction,
  updateServiceAction,
} from "./actions";
import { PacksSection } from "./packs-section";
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

// W12-03: name WHY a service's hard-delete is refused, per blocker class, so
// archive-vs-delete is legible (a service blocked only by its own price overrides
// is now deletable and never reaches this path).
const SERVICE_BLOCKER_KEY: Record<ServiceDeleteBlocker, keyof typeof s> = {
  appointments: "admin.services.deleteBlocked.appointments",
  therapist_services: "admin.services.deleteBlocked.therapistServices",
  analytics: "admin.services.deleteBlocked.analytics",
  pack: "admin.services.deleteBlocked.pack",
};

function serviceBlockedTooltip(blockers: ServiceDeleteBlocker[]): string {
  const reasons = blockers.map((b) => s[SERVICE_BLOCKER_KEY[b]]).join(", ");
  return `${s["admin.services.deleteBlockedPrefix"]} ${reasons}. ${s["admin.services.deleteBlockedSuffix"]}`;
}

// PACK-04. Why the ARCHIVE control is disabled, NAMING the pacotes rather than
// counting them: an admin who reads "Pacote 10 - NESA" knows which row to
// repoint, and this defect survived weeks because nothing anywhere said the
// name of the thing that was broken.
function serviceArchiveBlockedTooltip(blocking: BlockingPack[]): string {
  return `${s["admin.services.archiveBlockedBy"]} ${archiveBlockedReason(blocking)}`;
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; mp?: string; pf?: string }>;
}) {
  const actor = await requireRequestContext();
  const [
    services,
    locations,
    locationPrices,
    serviceBlockers,
    offerings,
    packs,
    referencedPackIds,
    packLocationPrices,
    packOfferings,
  ] = await Promise.all([
    listServices(actor),
    listLocations(actor),
    listServiceLocationPrices(actor),
    getServiceDeleteBlockers(actor),
    listServiceOfferings(actor),
    listPacks(actor),
    getReferencedPackIds(actor),
    listPackLocationPrices(actor),
    listPackOfferings(actor),
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

  // W12-20 — the pack equivalents (exact mirror of the service maps above):
  // per-location pack overrides keyed by `${packId}:${locationId}`, and the
  // offered-only-where-priced set that drives the pack "Oferecido aqui" badge.
  const overrideByPackLocation = new Map<string, number>();
  for (const p of packLocationPrices) {
    overrideByPackLocation.set(`${p.packId}:${p.locationId}`, p.priceCents);
  }
  const offeredPackLocation = new Set<string>();
  for (const o of packOfferings) offeredPackLocation.add(`${o.packId}:${o.locationId}`);

  // Pack table filter INCLUDES inactive by default (W6-01b split).
  const packFilter = parsePackStatusFilter(pf);
  const visiblePacks = filterPacksByStatus(packs, packFilter);
  const activeServices = activeBaseServiceOptions(services);
  const serviceNameById = new Map(services.map((svc) => [svc.id, svc.name] as const));
  const locationNameById = new Map(locations.map((l) => [l.id, l.name] as const));

  const banner =
    m === "ok" ? { ok: true, text: s["admin.services.saved"] }
    : m === "err:has_references" ? { ok: false, text: s["admin.services.deleteHasReferences"] }
    // PACK-04. Its own message: it points at a different repair than the delete
    // one, namely changing the pacote's base service.
    : m === "err:has_packs" ? { ok: false, text: s["admin.services.archiveHasPacks"] }
    // A refused value (a price the parser does not accept, a bad duration):
    // its own message, because "could not save" sends people looking for a
    // server fault when the fix is in what they typed.
    : m === "err:invalid" ? { ok: false, text: s["admin.services.invalidValue"] }
    : m && m.startsWith("err") ? { ok: false, text: s["admin.services.error"] }
    : mp === "ok" ? { ok: true, text: s["admin.packs.saved"] }
    : mp === "err:has_references" ? { ok: false, text: s["admin.packs.deleteHasReferences"] }
    // PACK-07. Its own message: it points at a different repair than the delete
    // one - create a new pacote, rather than remove this one.
    : mp === "err:has_instances" ? { ok: false, text: s["admin.packs.sessionCountHasInstances"] }
    : mp === "err:invalid" ? { ok: false, text: s["admin.services.invalidValue"] }
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
                // W12-03: the delete is refused only by REAL history/relationships
                // (blockers), not by the service's own price overrides (config,
                // cleaned up in the delete tx). Empty => hard-deletable.
                const blockers = serviceBlockers.get(svc.id) ?? [];
                const referenced = blockers.length > 0;
                // PACK-04: archiving a service a pacote is bound to is refused
                // server-side; this only makes the refusal visible before the
                // click. `packs` is already loaded for the pack section below,
                // so naming them costs no extra query.
                const archiveBlocking = packsBoundToService(packs, svc.id);
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
                        {/* Shown beside the lifecycle badge rather than in its own
                            column: the two are read together ("offered, and offered
                            to patients") and a separate column would imply they are
                            independent facts rather than two gates on one row. */}
                        {svc.patientBookable && (
                          <span className="ml-2 inline-block rounded-full bg-v2-surface-hover px-2 py-0.5 text-[11px] font-medium text-v2-text-secondary">
                            {s["admin.services.patientBookableBadge"]}
                          </span>
                        )}
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
                              {/* W13-04 step 7: patient_bookable is its OWN control,
                                  never folded into archive. `active` answers "does
                                  the clinic offer this at all"; this answers "may a
                                  patient book it themselves". One control for both
                                  would make archiving the only way off the portal,
                                  and that also removes it from the staff agenda. */}
                              <form action={setServicePatientBookableAction}>
                                <input type="hidden" name="id" value={svc.id} />
                                <input type="hidden" name="bookable" value={svc.patientBookable ? "false" : "true"} />
                                <Button type="submit" variant="ghost" size="sm">
                                  {svc.patientBookable
                                    ? s["admin.services.patientBookableOff"]
                                    : s["admin.services.patientBookableOn"]}
                                </Button>
                              </form>
                              {/* PACK-04. Archive is disabled while a pacote is bound to
                                  the service and the tooltip NAMES the pacotes. RESTORE
                                  is never blocked - it can only repair a binding, and the
                                  three services already in this state on production have
                                  to be able to come back. The server refuses regardless;
                                  this is the affordance. */}
                              {svc.isActive && archiveBlocking.length > 0 ? (
                                <span title={serviceArchiveBlockedTooltip(archiveBlocking)} className="inline-flex">
                                  <Button type="button" variant="ghost" size="sm" disabled>
                                    {s["admin.services.archive"]}
                                  </Button>
                                </span>
                              ) : (
                                <form action={setServiceActiveAction}>
                                  <input type="hidden" name="id" value={svc.id} />
                                  <input type="hidden" name="active" value={svc.isActive ? "false" : "true"} />
                                  <Button type="submit" variant="ghost" size="sm">
                                    {svc.isActive ? s["admin.services.archive"] : s["admin.services.restore"]}
                                  </Button>
                                </form>
                              )}
                              {/* Reference-guarded delete (NO password, W4-15). Referenced
                                  service → disabled control + tooltip (archive-only);
                                  zero-reference → hard-delete. Server-enforced regardless. */}
                              {referenced ? (
                                <span title={serviceBlockedTooltip(blockers)} className="inline-flex">
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
        overrideByPackLocation={overrideByPackLocation}
        offeredPackLocation={offeredPackLocation}
      />
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
