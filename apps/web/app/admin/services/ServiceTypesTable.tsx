import { Fragment } from "react";
import { Button, GlassPanel, StatusBadge } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { SERVICE_VAT_RATES, VAT_EXEMPTION_REASONS } from "@osteojp/db";
import {
  archiveBlockedReason,
  effectivePriceCents,
  packsBoundToService,
  type ServiceDeleteBlocker,
  type ServiceView,
} from "@/lib/admin/services";
import type { PackView } from "@/lib/admin/packs";
import type { LocationView } from "@/lib/admin/locations";
import { UNSET_COLOR_SHOWN, centsToInput } from "@/lib/admin/service-types-form";
import {
  createServiceTypeAction,
  deleteServiceAction,
  saveServiceTypesTableAction,
  setServiceContraindicationAction,
  setServiceLocationPricesAction,
} from "./actions";
import { ServiceTypeColorCell } from "./ServiceTypeColorCell";
import { ServiceTypeVatPair } from "./ServiceTypeVatPair";
import { adminHelp, adminInputInline, adminLabel, adminTd, adminTh, adminTrBorder } from "../admin-ui";

const s = getStrings(DEFAULT_LOCALE);

/** The id of the one form the whole table posts to (Fisiozero's single save button). */
export const TABLE_FORM_ID = "service-types-table";

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

function euros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/** "Preço (Fisioterapia)": every control names its column AND its type, so a
 *  screen reader moving through the table never hears ten bare "Preço". */
function named(label: string, typeName: string | undefined): string {
  return typeName ? `${label} (${typeName})` : label;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/** A Fisiozero tag ("SMS", "AGENDA"): a labelled checkbox, so the state is the box, never the colour. */
function Tag({
  name,
  label,
  title,
  checked,
  typeName,
  hint,
  hintId,
}: {
  name: string;
  label: string;
  title: string;
  checked: boolean;
  typeName: string;
  /** A muted line under the tag, read with it by a screen reader. */
  hint?: string;
  hintId?: string;
}) {
  const tag = (
    <label
      title={title}
      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-v2-border bg-v2-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-v2-text-primary has-[:checked]:bg-v2-surface-hover"
    >
      <input
        type="checkbox"
        name={name}
        form={TABLE_FORM_ID}
        defaultChecked={checked}
        aria-label={named(label, typeName)}
        aria-describedby={hint ? hintId : undefined}
        className={focusRing}
      />
      {label}
    </label>
  );
  if (!hint) return tag;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {tag}
      <span id={hintId} className="text-[11px] text-v2-text-secondary">
        {hint}
      </span>
    </span>
  );
}

/* FollowUP (follow_up_days) is NOT rendered (strategy Q9, 2026-11-04): hidden
   until the clinic says what it does. The column and its stored values stay;
   the table's save does not write it (saveServiceTypesTable). */

/** The IVA and Motivo IVA selects (B10: a rate above 0% clears the Motivo). */
function VatPair({
  suffix,
  rate,
  reason,
  form,
  typeName,
  inCells,
}: {
  suffix: string;
  rate: number | null;
  reason: string | null;
  form?: string;
  typeName?: string;
  inCells?: boolean;
}) {
  return (
    <ServiceTypeVatPair
      rateName={`vat${suffix}`}
      reasonName={`vatReason${suffix}`}
      form={form}
      rate={rate}
      reason={reason}
      rates={SERVICE_VAT_RATES}
      reasons={VAT_EXEMPTION_REASONS.map((r) => ({ code: r.code, label: r.label }))}
      rateLabel={named(s["admin.serviceTypes.colVat"], typeName)}
      reasonLabel={named(s["admin.serviceTypes.colVatReason"], typeName)}
      unsetLabel={s["admin.serviceTypes.vatUnset"]}
      reasonPlaceholder={s["admin.serviceTypes.vatReasonPlaceholder"]}
      inputClassName={adminInputInline}
      cellClassName={inCells ? adminTd : undefined}
    />
  );
}

export function ServiceTypesTable({
  services,
  packs,
  serviceBlockers,
  activeLocations,
  overrideByServiceLocation,
  offeredServiceLocation,
}: {
  services: ServiceView[];
  packs: PackView[];
  serviceBlockers: Map<string, ServiceDeleteBlocker[]>;
  activeLocations: LocationView[];
  overrideByServiceLocation: Map<string, number>;
  offeredServiceLocation: Set<string>;
}) {
  const COLS = 10;
  return (
    <GlassPanel title={s["admin.serviceTypes.title"]}>
      <div className="flex flex-col gap-4">
        {/* Next to the IVA columns: the Q5 rule the save enforces, and Q6's
            note that the values wait for the accountant. */}
        <div className={adminHelp} data-testid="service-types-vat-notes">
          <p>{s["admin.serviceTypes.vatReasonRule"]}</p>
          <p>{s["admin.serviceTypes.vatAccountantNote"]}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" data-testid="service-types-table">
            <thead>
              <tr className={adminTrBorder}>
                <th scope="col" className={adminTh}>{s["admin.serviceTypes.colName"]}</th>
                <th scope="col" className={adminTh}>{s["admin.serviceTypes.colPrice"]}</th>
                <th scope="col" className={adminTh}>{s["admin.serviceTypes.colVat"]}</th>
                <th scope="col" className={adminTh}>{s["admin.serviceTypes.colVatReason"]}</th>
                {/* Fisiozero's four controls carry no header; screen readers get one. */}
                <th scope="col" className={adminTh}>
                  <span className="sr-only">{s["admin.services.status"]}</span>
                </th>
                <th scope="col" className={adminTh}>
                  <span className="sr-only">{s["admin.serviceTypes.color"]}</span>
                </th>
                <th scope="col" className={adminTh}>
                  <span className="sr-only">{s["admin.serviceTypes.sms"]}</span>
                </th>
                <th scope="col" className={adminTh}>
                  <span className="sr-only">{s["admin.serviceTypes.agenda"]}</span>
                </th>
                {/* OsteoJP's own columns, after Fisiozero's: booking needs the duration. */}
                <th scope="col" className={adminTh}>{s["admin.services.duration"]}</th>
                <th scope="col" className={adminTh}>{s["admin.staff.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => {
                const blockers = serviceBlockers.get(svc.id) ?? [];
                const archiveBlocking = packsBoundToService(packs, svc.id);
                // PACK-04: a type a pacote is bound to cannot be switched off. The
                // server refuses regardless; this is the affordance. A disabled
                // checkbox posts nothing, so a hidden input carries "on".
                const switchLocked = svc.isActive && archiveBlocking.length > 0;
                const switchHelpId = `service-type-switch-help-${svc.id}`;
                const switchHelp = switchLocked
                  ? `${s["admin.services.archiveBlockedBy"]} ${archiveBlockedReason(archiveBlocking)}`
                  : s["admin.serviceTypes.deactivate"];
                return (
                  <Fragment key={svc.id}>
                    <tr className={adminTrBorder} data-service-id={svc.id}>
                      {/* The row header: a screen reader announces the type's
                          name with every cell of the row. */}
                      <th scope="row" className={`${adminTd} text-left font-normal`}>
                        <input type="hidden" name="row" value={svc.id} form={TABLE_FORM_ID} />
                        {/* What the page saw: a save over a row somebody else
                            changed in between is refused (`stale`). */}
                        <input
                          type="hidden"
                          name={`seen__${svc.id}`}
                          value={String(svc.updatedAt.getTime())}
                          form={TABLE_FORM_ID}
                        />
                        <input
                          name={`name__${svc.id}`}
                          form={TABLE_FORM_ID}
                          defaultValue={svc.name}
                          required
                          aria-label={s["admin.serviceTypes.colName"]}
                          className={`w-56 ${adminInputInline}`}
                        />
                      </th>
                      <td className={adminTd}>
                        <span className="inline-flex items-center gap-1">
                          <input
                            name={`price__${svc.id}`}
                            form={TABLE_FORM_ID}
                            type="text"
                            inputMode="decimal"
                            defaultValue={centsToInput(svc.priceCents)}
                            placeholder="0.00"
                            aria-label={named(s["admin.serviceTypes.colPrice"], svc.name)}
                            className={`w-20 text-right ${adminInputInline}`}
                          />
                          <span aria-hidden="true">€</span>
                        </span>
                      </td>
                      <VatPair
                        suffix={`__${svc.id}`}
                        rate={svc.vatRate}
                        reason={svc.vatExemptionCode}
                        form={TABLE_FORM_ID}
                        typeName={svc.name}
                        inCells
                      />
                      <td className={adminTd}>
                        <span className="inline-flex items-center gap-2" title={switchHelp}>
                          <input
                            type="checkbox"
                            role="switch"
                            name={`active__${svc.id}`}
                            form={TABLE_FORM_ID}
                            defaultChecked={svc.isActive}
                            disabled={switchLocked}
                            aria-label={named(s["admin.serviceTypes.activeSwitch"], svc.name)}
                            aria-describedby={switchHelpId}
                            className={`h-4 w-4 ${focusRing}`}
                          />
                          {switchLocked && (
                            <input type="hidden" name={`active__${svc.id}`} value="on" form={TABLE_FORM_ID} />
                          )}
                          {/* Estado is always a badge (UI-STYLE). It shows the
                              STORED state; the switch beside it is the edit. */}
                          <StatusBadge tone={svc.isActive ? "confirmed" : "cancelled"}>
                            {svc.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                          </StatusBadge>
                          {/* The tooltip as text a screen reader reaches: the
                              lock reason naming the pacotes, or what the switch does. */}
                          <span id={switchHelpId} className="sr-only">
                            {switchHelp}
                          </span>
                        </span>
                      </td>
                      <td className={adminTd}>
                        <ServiceTypeColorCell
                          id={svc.id}
                          form={TABLE_FORM_ID}
                          color={svc.color}
                          shownWhenUnset={UNSET_COLOR_SHOWN}
                          colorLabel={s["admin.serviceTypes.color"]}
                          noColorLabel={s["admin.serviceTypes.noColor"]}
                          typeName={svc.name}
                        />
                      </td>
                      <td className={adminTd}>
                        <Tag
                          name={`sms__${svc.id}`}
                          label={s["admin.serviceTypes.sms"]}
                          title={s["admin.serviceTypes.smsHelp"]}
                          checked={svc.smsReminders}
                          typeName={svc.name}
                          // Q4: stored only; no reminder path reads it yet.
                          hint={s["admin.serviceTypes.smsNotYetApplied"]}
                          hintId={`service-type-sms-hint-${svc.id}`}
                        />
                      </td>
                      <td className={adminTd}>
                        <Tag
                          name={`agenda__${svc.id}`}
                          label={s["admin.serviceTypes.agenda"]}
                          title={s["admin.serviceTypes.agendaHelp"]}
                          checked={svc.patientBookable}
                          typeName={svc.name}
                        />
                      </td>
                      <td className={adminTd}>
                        <input
                          name={`duration__${svc.id}`}
                          form={TABLE_FORM_ID}
                          type="number"
                          min={1}
                          defaultValue={svc.durationMin}
                          required
                          aria-label={named(s["admin.services.duration"], svc.name)}
                          className={`w-20 ${adminInputInline}`}
                        />
                      </td>
                      <td className={adminTd}>
                        <details className="group">
                          <summary className={`inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-v2 border border-v2-border bg-v2-surface px-3 py-1.5 text-sm text-v2-text-primary hover:bg-v2-surface-hover [&::-webkit-details-marker]:hidden ${focusRing}`}>
                            {s["admin.staff.manage"]}
                          </summary>
                          <div className="mt-3 flex w-72 flex-col gap-3 rounded-v2 border border-v2-border bg-v2-surface p-3">
                            <form action={setServiceContraindicationAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="id" value={svc.id} />
                              <label className="flex items-center gap-1 text-sm text-v2-text-primary">
                                <input
                                  type="checkbox"
                                  name="contraindicationSensitive"
                                  defaultChecked={svc.contraindicationSensitive}
                                />
                                {s["admin.services.contraindicationSensitive"]}
                              </label>
                              <Button type="submit" variant="ghost" size="sm">
                                {s["common.save"]}
                              </Button>
                            </form>
                            <p className={adminHelp}>
                              {s["admin.serviceTypes.therapistsHint"]}{" "}
                              <a href="/admin/staff" className={`text-accent-2-700 underline ${focusRing}`}>
                                {s["admin.serviceTypes.therapistsLink"]}
                              </a>
                            </p>
                            {blockers.length > 0 ? (
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
                        </details>
                      </td>
                    </tr>
                    <tr className={adminTrBorder}>
                      <td colSpan={COLS} className="pb-3 pr-4">
                        <details className="text-sm text-v2-text-primary">
                          <summary className={`cursor-pointer rounded ${focusRing} ${adminHelp}`}>
                            {s["admin.services.locationPrices"]}
                          </summary>
                          {activeLocations.length === 0 ? (
                            <p className={`mt-2 ${adminHelp}`}>{s["admin.services.noLocations"]}</p>
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
                                const override = overrideByServiceLocation.get(`${svc.id}:${loc.id}`) ?? null;
                                const effective = effectivePriceCents(svc.priceCents, override);
                                const offered = offeredServiceLocation.has(`${svc.id}:${loc.id}`);
                                return (
                                  <label key={loc.id} className="space-y-1">
                                    <span className={`block ${adminLabel}`}>{loc.name}</span>
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
                                        {offered ? s["admin.services.offeredHere"] : s["admin.services.notOfferedHere"]}
                                      </StatusBadge>
                                      <span className={adminHelp}>
                                        {override === null
                                          ? s["admin.services.usesBasePrice"]
                                          : `${s["admin.services.effective"]}: ${euros(effective)}`}
                                      </span>
                                    </span>
                                  </label>
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

        {/* The one save button. Every table control names this form by id, so
            the row forms above (location prices, the Gerir drawer) are never
            nested inside it. */}
        <form id={TABLE_FORM_ID} action={saveServiceTypesTableAction}>
          <Button type="submit" variant="primary">
            {s["admin.serviceTypes.save"]}
          </Button>
        </form>

        <form
          action={createServiceTypeAction}
          className="flex flex-wrap items-end gap-2 border-t border-v2-border pt-4"
          data-testid="service-types-new-row"
        >
          <input
            name="name"
            required
            placeholder={s["admin.serviceTypes.newName"]}
            aria-label={s["admin.serviceTypes.newName"]}
            className={`w-56 ${adminInputInline}`}
          />
          <span className="inline-flex items-center gap-1">
            <input
              name="price"
              type="text"
              inputMode="decimal"
              placeholder={s["admin.serviceTypes.colPrice"]}
              aria-label={s["admin.serviceTypes.colPrice"]}
              className={`w-20 text-right ${adminInputInline}`}
            />
            <span aria-hidden="true">€</span>
          </span>
          {/* Starts unset, not 0%: a 0% type needs a Motivo (Q5), and a
              prefilled 0% would refuse every insert left at its default. */}
          <VatPair suffix="" rate={null} reason={null} />
          {/* Not in Fisiozero's row: OsteoJP books by duration, so a new type
              states it. No prefilled value: a silent 60 is how a 30-minute
              type would book an hour. */}
          <label className="inline-flex items-center gap-1 text-sm text-v2-text-primary">
            {s["admin.services.duration"]}
            <input name="durationMin" type="number" min={1} required className={`w-20 ${adminInputInline}`} />
          </label>
          <Button type="submit" variant="primary">
            {s["admin.serviceTypes.insert"]}
          </Button>
        </form>

        {/* OsteoJP's own two notes (strategy Q8, 2026-11-04), in place of
            Fisiozero's "Nota 1" and "Nota 2", which are not true here. */}
        <div className={adminHelp} data-testid="service-types-notes">
          <p>{s["admin.serviceTypes.note1"]}</p>
          <p>{s["admin.serviceTypes.note2"]}</p>
        </div>
      </div>
    </GlassPanel>
  );
}
