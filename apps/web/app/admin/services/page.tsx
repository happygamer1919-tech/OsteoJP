import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import {
  getServiceDeleteBlockers,
  listServiceLocationPrices,
  listServiceOfferings,
  listServices,
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
import { ServiceTypesTable } from "./ServiceTypesTable";
import { PacksSection } from "./packs-section";

const s = getStrings(DEFAULT_LOCALE);

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; mp?: string; mt?: string; mn?: string; pf?: string }>;
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
  const { m, mp, mt, mn, pf } = await searchParams;

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
    // Tipos de Marcacao: the table save (`mt`) and the new-type row (`mn`) each
    // have their own messages, one per refusal.
    mt === "ok" ? { ok: true, text: s["admin.serviceTypes.saved"] }
    : mt === "err:invalid" ? { ok: false, text: s["admin.serviceTypes.invalid"] }
    // Q5: IVA 0% with no Motivo. Its own message, naming what to choose.
    : mt === "err:vat_reason" ? { ok: false, text: s["admin.serviceTypes.vatReasonRequired"] }
    : mt === "err:stale" ? { ok: false, text: s["admin.serviceTypes.stale"] }
    : mt === "err:has_packs" ? { ok: false, text: s["admin.services.archiveHasPacks"] }
    : mt === "err:not_found" ? { ok: false, text: s["admin.serviceTypes.notFound"] }
    : mt && mt.startsWith("err") ? { ok: false, text: s["admin.serviceTypes.tableError"] }
    : mn === "ok" ? { ok: true, text: s["admin.serviceTypes.inserted"] }
    : mn === "err:invalid" ? { ok: false, text: s["admin.serviceTypes.newInvalid"] }
    : mn === "err:vat_reason" ? { ok: false, text: s["admin.serviceTypes.newVatReasonRequired"] }
    : mn && mn.startsWith("err") ? { ok: false, text: s["admin.serviceTypes.newError"] }
    : m === "ok" ? { ok: true, text: s["admin.services.saved"] }
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

      <ServiceTypesTable
        services={services}
        packs={packs}
        serviceBlockers={serviceBlockers}
        activeLocations={activeLocations}
        overrideByServiceLocation={overrideByServiceLocation}
        offeredServiceLocation={offeredServiceLocation}
      />

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
