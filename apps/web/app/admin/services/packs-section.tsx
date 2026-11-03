import { Button, GlassPanel, StatusBadge } from "@osteojp/ui";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { X } from "lucide-react";

import type { ServiceView } from "@/lib/admin/services";
import type { PackView } from "@/lib/admin/packs";
import type { PackStatusFilter } from "@/lib/admin/pack-filters";
import { canHardDeletePack } from "@/lib/admin/pack-filters";
import type { LocationView } from "@/lib/admin/locations";
import { effectivePriceCents } from "@/lib/admin/pricing";
import {
  createPackAction,
  deletePackAction,
  setPackActiveAction,
  setPackLocationPricesAction,
  updatePackAction,
  updatePackPriceAction,
} from "./actions";
import { adminHelp, adminInputInline, adminLabel } from "../admin-ui";

const s = getStrings(DEFAULT_LOCALE);

function euros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

const PACK_FILTERS: { value: PackStatusFilter; labelKey: keyof typeof s }[] = [
  { value: "all", labelKey: "admin.packs.filterAll" },
  { value: "active", labelKey: "admin.packs.filterActive" },
  { value: "inactive", labelKey: "admin.packs.filterInactive" },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/**
 * "Gestão de Packs", laid out as Fisiozero lays it out (owner request
 * 2026-11-02): a "LISTA DE PACKS" with one compact row per pack (name, "N
 * sessões", the price in an inline box followed by "€", a red delete cross with
 * the tooltip "Apagar Pack"), then a "Novo PACK" inline form ("Nome Pack...",
 * "Número sessões...", "Preço...", "Inserir"). OsteoJP's colours and controls.
 *
 * ==========================================================================
 * WHAT OSTEOJP KEEPS THAT FISIOZERO DOES NOT HAVE
 * ==========================================================================
 * - The BASE SERVICE and the LOCATION. A Fisiozero pack is linked to nothing;
 *   an OsteoJP pacote is booked as its base service, so it cannot exist without
 *   one. They sit after "Preço..." in the new-pack form, and under the name on
 *   each row.
 * - Everything the old table offered, behind "Gerir" on each row: the full
 *   edit (name, base service, session count, location), archive and restore,
 *   and the per-location prices. The status filter stays above the list,
 *   because archived pacotes must stay reachable to be restored.
 * - The delete is still reference-guarded: a pacote a patient holds cannot be
 *   hard-deleted (the server refuses regardless), so its cross is disabled and
 *   its tooltip says why.
 *
 * NO "Activa ou desactiva esta funcionalidade" SWITCH: OsteoJP has no packs
 * feature flag, and a switch that switched nothing would be a lie.
 *
 * THE PRICE IS THE PACK TOTAL. `service_packs.price_cents` is the total for all
 * the sessions (the catalogue seed: "Pacote 10 - NESA" is 390.00). That is kept,
 * and said under the list, because Fisiozero's own list reads like a price per
 * session for most of its rows.
 */
export function PacksSection({
  packs,
  activeServices,
  activeLocations,
  referencedPackIds,
  packFilter,
  serviceNameById,
  locationNameById,
  overrideByPackLocation,
  offeredPackLocation,
}: {
  packs: PackView[];
  activeServices: ServiceView[];
  activeLocations: LocationView[];
  referencedPackIds: Set<string>;
  packFilter: PackStatusFilter;
  serviceNameById: Map<string, string>;
  locationNameById: Map<string, string>;
  overrideByPackLocation: Map<string, number>;
  offeredPackLocation: Set<string>;
}) {
  return (
    <GlassPanel title={s["admin.packs.manageTitle"]}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-v2-border pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-v2-text-primary underline underline-offset-4">
          {s["admin.packs.listTitle"]}
        </h3>
        {/* Filter INCLUDES inactive (W6-01b split): "Todos"/"Inativos" surface
            archived packs so they can be restored. */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={s["admin.packs.filterLabel"]}>
          <span className={adminHelp}>{s["admin.packs.filterLabel"]}:</span>
          {PACK_FILTERS.map((f) => (
            <a
              key={f.value}
              href={`/admin/services?pf=${f.value}`}
              aria-current={packFilter === f.value ? "true" : undefined}
              className={`rounded-v2 border px-3 py-1 text-sm ${focusRing} ${
                packFilter === f.value
                  ? "border-v2-border bg-v2-surface-hover text-v2-text-primary"
                  : "border-transparent text-v2-text-secondary hover:bg-v2-surface-hover"
              }`}
            >
              {s[f.labelKey]}
            </a>
          ))}
        </div>
      </div>

      {packs.length === 0 ? (
        <p className={`mt-3 ${adminHelp}`}>{s["admin.packs.none"]}</p>
      ) : (
        <ul className="flex flex-col" data-testid="pack-list">
          {packs.map((pack) => {
            const deletable = canHardDeletePack(referencedPackIds, pack.id);
            const baseName = serviceNameById.get(pack.baseServiceId) ?? pack.baseServiceId;
            const locName =
              pack.locationId === null
                ? s["admin.packs.allLocations"]
                : (locationNameById.get(pack.locationId) ?? pack.locationId);
            // Edit dropdown shows active services; keep the current base
            // selectable even if it was archived after creation, so the form's
            // defaultValue always matches an option.
            const hasOverrides = activeLocations.some((loc) =>
              overrideByPackLocation.has(`${pack.id}:${loc.id}`),
            );
            const editServiceOptions = activeServices.map((svc) => ({ id: svc.id, name: svc.name }));
            if (!editServiceOptions.some((o) => o.id === pack.baseServiceId)) {
              editServiceOptions.push({ id: pack.baseServiceId, name: baseName });
            }
            return (
              <li
                key={pack.id}
                data-testid="pack-list-row"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-v2-border py-1.5 text-sm text-v2-text-primary"
              >
                <div className="flex min-w-0 flex-1 basis-48 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pack.name}</span>
                    {!pack.isActive && (
                      <StatusBadge tone="cancelled">{s["admin.staff.inactive"]}</StatusBadge>
                    )}
                  </span>
                  <span className={adminHelp}>
                    {baseName} · {locName}
                  </span>
                </div>
                <span className="w-24 shrink-0 tabular-nums">
                  {s["admin.packs.sessionsCount"].replace("{n}", String(pack.sessionCount))}
                </span>
                <form action={updatePackPriceAction} className="flex shrink-0 items-center gap-1">
                  <input type="hidden" name="id" value={pack.id} />
                  <input
                    name="price"
                    type="text"
                    inputMode="decimal"
                    defaultValue={euros(pack.priceCents)}
                    required
                    aria-label={s["admin.packs.priceTotalLabel"]}
                    className={`w-[4.5rem] text-right tabular-nums ${adminInputInline}`}
                  />
                  <span aria-hidden="true">€</span>
                  {hasOverrides && (
                    /* The box holds the BASE price. With per-location prices
                       set (under "Gerir"), a location may charge something
                       else, so the row says which price this is. */
                    <span className={adminHelp} data-testid="pack-base-price-hint">
                      {s["admin.packs.basePriceHint"]}
                    </span>
                  )}
                  <Button type="submit" variant="ghost" size="sm">
                    {s["admin.packs.savePrice"]}
                  </Button>
                </form>
                {/* "Gerir" holds every other edit. Open, it drops to its own
                    full-width line under the row, so the row stays one line. */}
                <details className="group shrink-0 open:order-last open:basis-full">
                  <summary
                    className={`inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-v2 border border-v2-border bg-v2-surface px-2 py-1 text-xs text-v2-text-primary hover:bg-v2-surface-hover ${focusRing} [&::-webkit-details-marker]:hidden`}
                  >
                    {s["admin.staff.manage"]}
                  </summary>
                  <div className="mt-2 flex flex-col gap-3 rounded-v2 border border-v2-border bg-v2-surface p-3">
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
                      {/* PACK-07: READ-ONLY once a patient holds this pacote.
                          The server refuses the change anyway
                          (lib/admin/packs.ts). `readOnly`, NOT `disabled`: a
                          disabled input posts nothing, and every other field on
                          the row would then fail to save. */}
                      <input
                        name="sessionCount"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={pack.sessionCount}
                        required
                        readOnly={!deletable}
                        aria-describedby={!deletable ? `pack-sessions-held-${pack.id}` : undefined}
                        title={!deletable ? s["admin.packs.sessionCountHasInstances"] : undefined}
                        aria-label={s["admin.packs.sessionCount"]}
                        className={`w-20 ${adminInputInline} ${!deletable ? "cursor-not-allowed opacity-70" : ""}`}
                      />
                      {!deletable && (
                        <span
                          id={`pack-sessions-held-${pack.id}`}
                          data-testid="pack-session-count-held"
                          className="sr-only"
                        >
                          {s["admin.packs.sessionCountHasInstances"]}
                        </span>
                      )}
                      <input
                        name="price"
                        type="text"
                        inputMode="decimal"
                        defaultValue={euros(pack.priceCents)}
                        required
                        aria-label={s["admin.packs.priceTotalLabel"]}
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
                    <form action={setPackActiveAction}>
                      <input type="hidden" name="id" value={pack.id} />
                      <input type="hidden" name="active" value={pack.isActive ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {pack.isActive ? s["admin.packs.archive"] : s["admin.packs.restore"]}
                      </Button>
                    </form>
                    {/* Per-location pack pricing (W12-20), unchanged. */}
                    <details className="text-sm text-v2-text-primary">
                      <summary className={`cursor-pointer rounded ${focusRing} ${adminHelp}`}>
                        {s["admin.packs.locationPrices"]}
                      </summary>
                      {activeLocations.length === 0 ? (
                        <p className={`mt-2 ${adminHelp}`}>{s["admin.packs.noLocations"]}</p>
                      ) : (
                        <form action={setPackLocationPricesAction} className="mt-2 flex flex-wrap items-end gap-3">
                          <input type="hidden" name="packId" value={pack.id} />
                          <p className={`w-full ${adminHelp}`}>
                            {s["admin.packs.basePrice"]}: {euros(pack.priceCents)} {pack.currency}
                          </p>
                          {activeLocations.map((loc) => {
                            const override = overrideByPackLocation.get(`${pack.id}:${loc.id}`) ?? null;
                            const effective = effectivePriceCents(pack.priceCents, override);
                            const offered = offeredPackLocation.has(`${pack.id}:${loc.id}`);
                            return (
                              <Labeled key={loc.id} label={loc.name}>
                                <input
                                  name={`price__${loc.id}`}
                                  type="text"
                                  inputMode="decimal"
                                  defaultValue={euros(override)}
                                  placeholder={euros(pack.priceCents) || "0.00"}
                                  className={`w-24 ${adminInputInline}`}
                                />
                                <span className="mt-1 flex items-center gap-2">
                                  <StatusBadge tone={offered ? "confirmed" : "cancelled"}>
                                    {offered ? s["admin.packs.offeredHere"] : s["admin.packs.notOfferedHere"]}
                                  </StatusBadge>
                                  <span className={adminHelp}>
                                    {override === null
                                      ? s["admin.packs.usesBasePrice"]
                                      : `${s["admin.packs.effective"]}: ${euros(effective)}`}
                                  </span>
                                </span>
                              </Labeled>
                            );
                          })}
                          <Button type="submit" variant="primary">
                            {s["admin.packs.savePrices"]}
                          </Button>
                        </form>
                      )}
                    </details>
                  </div>
                </details>
                {deletable ? (
                  <form action={deletePackAction} className="ml-auto shrink-0">
                    <input type="hidden" name="id" value={pack.id} />
                    <button
                      type="submit"
                      title={s["admin.packs.deleteIcon"]}
                      aria-label={s["admin.packs.deleteIcon"]}
                      className={`inline-flex size-8 items-center justify-center rounded-v2 text-error-700 hover:bg-error-50 ${focusRing}`}
                    >
                      <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </button>
                  </form>
                ) : (
                  /* aria-disabled, NOT disabled: a disabled button leaves the
                     tab order, so a keyboard or screen-reader user could never
                     reach the reason. This one stays focusable, does nothing
                     (type="button", no form), and is described by the sr-only
                     reason below. The server refuses the delete regardless. */
                  <span
                    className="ml-auto inline-flex shrink-0"
                    title={`${s["admin.packs.deleteIcon"]}: ${s["admin.packs.deleteBlockedTooltip"]}`}
                  >
                    <button
                      type="button"
                      aria-disabled="true"
                      aria-label={s["admin.packs.deleteIcon"]}
                      aria-describedby={`pack-delete-blocked-${pack.id}`}
                      data-testid="pack-delete-blocked"
                      className={`inline-flex size-8 cursor-not-allowed items-center justify-center rounded-v2 text-error-700 opacity-40 ${focusRing}`}
                    >
                      <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </button>
                    <span id={`pack-delete-blocked-${pack.id}`} className="sr-only">
                      {s["admin.packs.deleteBlockedTooltip"]}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className={`mt-2 ${adminHelp}`}>{s["admin.packs.priceIsTotal"]}</p>

      <hr className="my-4 border-v2-border" />

      <h3 className="mb-2 text-sm font-semibold text-v2-text-primary">{s["admin.packs.newTitle"]}</h3>
      {activeServices.length === 0 ? (
        <p className={adminHelp}>{s["admin.packs.noBaseServices"]}</p>
      ) : (
        <form action={createPackAction} className="flex flex-wrap items-center gap-2" data-testid="new-pack-form">
          <input
            name="name"
            required
            placeholder={s["admin.packs.namePlaceholder"]}
            aria-label={s["admin.packs.name"]}
            className={adminInputInline}
          />
          <input
            name="sessionCount"
            type="number"
            min={1}
            step={1}
            required
            placeholder={s["admin.packs.sessionsPlaceholder"]}
            aria-label={s["admin.packs.sessionCount"]}
            className={`w-40 ${adminInputInline}`}
          />
          <input
            name="price"
            type="text"
            inputMode="decimal"
            required
            placeholder={s["admin.packs.pricePlaceholder"]}
            aria-label={s["admin.packs.priceTotalLabel"]}
            className={`w-28 ${adminInputInline}`}
          />
          {/* OsteoJP only: a pacote is booked as its base service, so it needs
              one (and optionally a location). After "Preço...", as ruled. */}
          <select
            name="baseServiceId"
            required
            aria-label={s["admin.packs.baseService"]}
            className={adminInputInline}
          >
            {activeServices.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name}
              </option>
            ))}
          </select>
          <select name="locationId" aria-label={s["admin.packs.location"]} className={adminInputInline}>
            <option value="">{s["admin.packs.allLocations"]}</option>
            {activeLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary">
            {s["admin.packs.insert"]}
          </Button>
        </form>
      )}
      <p className={`mt-2 ${adminHelp}`}>{s["admin.packs.baseServiceNote"]}</p>
    </GlassPanel>
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
