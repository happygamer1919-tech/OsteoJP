"use client";

import { type MouseEvent, useState } from "react";
import { Button, SegmentedControl, useAnimatedDialog } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import { THERAPIST_PALETTE } from "@/lib/scheduling/therapist-color";
import { adminInputInline, adminLabel } from "../admin-ui";
import { saveTherapistScheduleAction } from "../working-hours/actions";
import {
  TherapistBlocks,
  type BlockView,
  type BlockLabels,
} from "../working-hours/TherapistBlocks";
import {
  changeRoleAction,
  deleteStaffAction,
  editStaffAction,
  setActiveAction,
  setPrimaryServiceAction,
  setStaffColorAction,
  setStaffLocationsAction,
} from "./actions";
import { ActivateLoginForm } from "./ActivateLoginForm";

/**
 * StaffManageModal (W12-40) — the ONE place a team member is managed from the
 * Equipa tab. The former separate Horários (working-hours) tab is folded in here:
 * a single centered top-layer modal (native <dialog> via useAnimatedDialog) with
 * a SegmentedControl switching between sections, EACH still posting to its SAME
 * existing server action:
 *   - Contacto: name / email / job title / phone      → editStaffAction
 *   - Função e acesso: role, activate/deactivate,
 *     password-gated delete                            → changeRole/setActive/deleteStaff
 *   - Serviço principal (therapists)                   → setPrimaryServiceAction
 *   - Horários (non-reception): weekday schedule +
 *     per-day location + time-off blocks               → saveTherapistScheduleAction / time-off
 *
 * Presentation + wiring only, zero server-action contract change. Only the ACTIVE
 * section is rendered, so the Horários section never carries the delete-password
 * field (the W4-14 "no password in the schedule surface" invariant holds) and
 * each surface stays uncluttered (progressive disclosure).
 */

/** One weekday's row in the schedule editor (mirrors the W4-14 reconcile shape). */
export type ScheduleDay = {
  weekday: number;
  label: string;
  /** True when the member works this day (an active template exists). */
  on: boolean;
  /** The active template id this day manages, or "" for a new day. */
  id: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  locationId: string;
};

type Section = "contact" | "role" | "locations" | "service" | "hours";

export function StaffManageModal({
  userId,
  fullName,
  email,
  phone,
  jobTitle,
  roleSlug,
  isActive,
  isBookable,
  roleOptions,
  canDelete,
  isTherapist,
  services,
  currentPrimaryId,
  showHours,
  days,
  locations,
  memberships,
  blocks,
  autoOpen = false,
}: {
  userId: string;
  fullName: string;
  email: string;
  /** W8-02: optional staff contact phone; empty string when unset. */
  phone: string;
  /** W8-02: optional professional job title; empty string when unset. */
  jobTitle: string;
  roleSlug: string;
  isActive: boolean;
  /** PL-06b (0046): whether this member appears in the Terapeuta booking dropdown. */
  isBookable: boolean;
  roleOptions: { slug: string; label: string }[];
  /** Delete row shown only when server-side allows it (never an owner / self). */
  canDelete: boolean;
  /** Therapist-only: show the primary-service section. */
  isTherapist: boolean;
  /** Active tenant services for the primary-service dropdown. */
  services: { id: string; name: string }[];
  /** Current primary service id, or "" when none is set. */
  currentPrimaryId: string;
  /** Non-reception: show the working-hours section (schedule + blocks). */
  showHours: boolean;
  /** Weekday rows for the schedule editor (Monday-first order). */
  days: ScheduleDay[];
  /** Active tenant locations for the per-day location select + membership picker. */
  locations: { id: string; name: string }[];
  /** W12-40-Q2: this member's current staff_locations memberships (+colour). */
  memberships: { locationId: string; color: string | null }[];
  /** Existing time-off blocks for this member. */
  blocks: BlockView[];
  /** Deep-link (?t=<id>): open the modal on the Horários section. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const { ref, shown } = useAnimatedDialog(open);
  const close = () => setOpen(false);

  const sectionItems = [
    { value: "contact" as const, label: s["admin.staff.sectionContact"] },
    { value: "role" as const, label: s["admin.staff.sectionRole"] },
    { value: "locations" as const, label: s["admin.staff.sectionLocations"] },
    ...(isTherapist
      ? [{ value: "service" as const, label: s["admin.staff.sectionService"] }]
      : []),
    ...(showHours
      ? [{ value: "hours" as const, label: s["admin.staff.sectionHours"] }]
      : []),
  ];
  const [section, setSection] = useState<Section>(
    autoOpen && showHours ? "hours" : "contact",
  );

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) close();
  };

  const fallbackLocation = locations[0]?.id ?? "";
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const membershipIds = new Set(memberships.map((m) => m.locationId));

  const blockLabels: BlockLabels = {
    block: s["admin.workingHours.block"],
    blocksFor: s["admin.workingHours.blocksFor"],
    none: s["admin.workingHours.blocksNone"],
    addBlock: s["admin.workingHours.addBlock"],
    mode: s["admin.workingHours.blockMode"],
    pontual: s["admin.workingHours.blockPontual"],
    prolongada: s["admin.workingHours.blockProlongada"],
    date: s["admin.workingHours.blockDate"],
    fromDate: s["admin.workingHours.blockFrom"],
    toDate: s["admin.workingHours.blockTo"],
    start: s["admin.workingHours.start"],
    end: s["admin.workingHours.end"],
    note: s["admin.workingHours.blockNote"],
    save: s["common.save"],
    cancel: s["common.cancel"],
    edit: s["common.edit"],
    remove: s["admin.workingHours.blockRemove"],
    close: s["common.close"],
    // PL-22 — bloquear lote. Reuses the Agendar lote vocabulary so the two
    // recurrence forms read the same, and the existing weekday strings so the
    // day names cannot drift between the schedule editor and this form.
    lote: s["admin.workingHours.blockLote"],
    weekdays: s["lote.weekdays"],
    everyWeeks: s["lote.everyWeeks"],
    endMode: s["lote.endMode"],
    endAfterCount: s["lote.endAfterCount"],
    endOnDate: s["lote.endOnDate"],
    until: s["lote.until"],
    count: s["admin.workingHours.blockCount"],
    weekdayNames: [
      s["admin.workingHours.mon"],
      s["admin.workingHours.tue"],
      s["admin.workingHours.wed"],
      s["admin.workingHours.thu"],
      s["admin.workingHours.fri"],
      s["admin.workingHours.sat"],
      s["admin.workingHours.sun"],
    ],
  };

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {s["admin.staff.manage"]}
      </Button>

      <dialog
        ref={ref}
        aria-label={`${s["admin.staff.manage"]} — ${fullName}`}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={onBackdropClick}
        className={[
          "m-auto w-full max-w-3xl rounded-v2 p-0 shadow-v2-float glass-card",
          "backdrop:bg-text-primary/40",
          "transition-opacity duration-base ease-standard",
          shown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <div className="flex max-h-[85vh] flex-col">
          {/* Sticky header + section switch. */}
          <div className="flex flex-col gap-4 border-b border-v2-border p-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-lg font-semibold text-v2-text-primary">
                  {s["admin.staff.manage"]}
                </h3>
                <p className="text-sm text-v2-text-secondary">{fullName}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={close}
                aria-label={s["common.close"]}
              >
                {s["common.close"]}
              </Button>
            </div>
            <SegmentedControl
              aria-label={s["admin.staff.manageSections"]}
              value={section}
              onValueChange={(v) => setSection(v as Section)}
              items={sectionItems}
            />
          </div>

          {/* Only the active section is mounted (progressive disclosure). */}
          <div className="flex flex-col gap-4 overflow-y-auto p-6">
            {section === "contact" && (
              <form action={editStaffAction} className="flex flex-col gap-3">
                <p className="text-xs text-v2-text-secondary">{s["admin.staff.contactHelp"]}</p>
                <input type="hidden" name="userId" value={userId} />
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{s["admin.staff.fullName"]}</span>
                  <input
                    name="fullName"
                    defaultValue={fullName}
                    required
                    aria-label={s["admin.staff.fullName"]}
                    className={adminInputInline}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{s["admin.staff.email"]}</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={email}
                    required
                    aria-label={s["admin.staff.email"]}
                    className={adminInputInline}
                  />
                </label>
                {/* W8-02: optional professional title (display, decoupled from role). */}
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{s["admin.staff.jobTitleLabel"]}</span>
                  <input
                    name="jobTitle"
                    defaultValue={jobTitle}
                    aria-label={s["admin.staff.jobTitleLabel"]}
                    placeholder={s["admin.staff.jobTitlePlaceholder"]}
                    className={adminInputInline}
                  />
                </label>
                {/* W8-02: optional staff contact phone (PII — never logged). */}
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{s["admin.staff.phoneLabel"]}</span>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    defaultValue={phone}
                    aria-label={s["admin.staff.phoneLabel"]}
                    placeholder={s["admin.staff.phonePlaceholder"]}
                    className={adminInputInline}
                  />
                </label>
                {/* PL-06b (0046): presence in the Terapeuta booking dropdown, set
                    explicitly per staff row (decoupled from role and from service
                    mappings). Unchecked = absent from FormData = false. */}
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="isBookable"
                    defaultChecked={isBookable}
                    aria-label={s["admin.staff.isBookableLabel"]}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-v2-text-primary">
                      {s["admin.staff.isBookableLabel"]}
                    </span>
                    <span className="text-xs text-v2-text-secondary">
                      {s["admin.staff.isBookableHelp"]}
                    </span>
                  </span>
                </label>
                <div>
                  <Button type="submit" variant="primary" size="sm">
                    {s["admin.staff.save"]}
                  </Button>
                </div>
              </form>
            )}

            {section === "role" && (
              <div className="flex flex-col gap-4">
                {/* Change role — same changeRoleAction handler. */}
                <form action={changeRoleAction} className="flex flex-col gap-1">
                  <input type="hidden" name="userId" value={userId} />
                  <span className={adminLabel}>{s["admin.staff.colRole"]}</span>
                  <div className="flex items-center gap-2">
                    <select
                      name="role"
                      defaultValue={roleSlug}
                      aria-label={s["admin.staff.colRole"]}
                      className={adminInputInline}
                    >
                      {roleOptions.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="ghost" size="sm">
                      {s["admin.staff.apply"]}
                    </Button>
                  </div>
                </form>

                {/* Activate/deactivate — same setActiveAction handler. */}
                <form action={setActiveAction}>
                  <input type="hidden" name="userId" value={userId} />
                  <input
                    type="hidden"
                    name="active"
                    value={isActive ? "false" : "true"}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    {isActive ? s["admin.staff.deactivate"] : s["admin.staff.reactivate"]}
                  </Button>
                </form>

                {/* PL-07: give this existing staff row a Supabase login (same id,
                    history preserved). The only onboarding path for pre-existing
                    staff whose rows cannot be deleted (active therapists). */}
                <div className="flex flex-col gap-2 rounded-v2 border border-v2-border p-3">
                  <span className="text-sm font-semibold text-v2-text-primary">
                    {s["admin.staff.activateLoginTitle"]}
                  </span>
                  <ActivateLoginForm userId={userId} />
                </div>

                {/* Password-gated hard delete — server-enforced scrypt gate is
                    UNCHANGED. Visually separated as a danger zone. */}
                {canDelete && (
                  <form
                    action={deleteStaffAction}
                    className="flex flex-col gap-2 rounded-v2 border border-error/40 bg-error-bg/40 p-3"
                  >
                    <span className="text-sm font-semibold text-error">
                      {s["admin.staff.dangerZone"]}
                    </span>
                    <input type="hidden" name="userId" value={userId} />
                    <span className={adminLabel}>{s["admin.staff.deletePassword"]}</span>
                    <div className="flex items-center gap-2">
                      <input
                        name="password"
                        type="password"
                        autoComplete="off"
                        required
                        aria-label={s["admin.staff.deletePassword"]}
                        placeholder={s["admin.staff.deletePassword"]}
                        className={`w-40 ${adminInputInline}`}
                      />
                      <Button type="submit" variant="destructive" size="sm">
                        {s["admin.staff.delete"]}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {section === "locations" && (
              <div className="flex flex-col gap-5">
                <p className="text-xs text-v2-text-secondary">
                  {s["admin.staff.locationsHelp"]}
                </p>

                {/* Clinic membership multi-picker — one Guardar → setStaffLocationsAction.
                    Drives the 0045 admin clinical-visibility basis. */}
                <form action={setStaffLocationsAction} className="flex flex-col gap-2">
                  <input type="hidden" name="userId" value={userId} />
                  <span className={adminLabel}>{s["admin.staff.cardLocations"]}</span>
                  {locations.length === 0 ? (
                    <p className="text-sm text-v2-text-secondary">
                      {s["admin.staff.cardNoLocations"]}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {locations.map((l) => (
                        <label key={l.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="locationIds"
                            value={l.id}
                            defaultChecked={membershipIds.has(l.id)}
                            aria-label={l.name}
                          />
                          <span className="text-sm text-v2-text-primary">{l.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div>
                    <Button type="submit" variant="primary" size="sm">
                      {s["common.save"]}
                    </Button>
                  </div>
                </form>

                {/* Per-membership agenda colour — one Guardar per clinic →
                    setStaffColorAction. Colour reinforces; the name stays the id (W9-05). */}
                <div className="flex flex-col gap-2">
                  <span className={adminLabel}>{s["admin.staff.colorLabel"]}</span>
                  {memberships.length === 0 ? (
                    <p className="text-sm text-v2-text-secondary">
                      {s["admin.staff.colorNoLocations"]}
                    </p>
                  ) : (
                    memberships.map((mem) => {
                      const current = THERAPIST_PALETTE.find((c) => c.key === mem.color);
                      const name = locationName.get(mem.locationId) ?? "—";
                      return (
                        <form
                          key={mem.locationId}
                          action={setStaffColorAction}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="userId" value={userId} />
                          <input type="hidden" name="locationId" value={mem.locationId} />
                          <span className="min-w-28 text-sm text-v2-text-primary">{name}</span>
                          <span
                            aria-hidden="true"
                            className={`h-3 w-3 shrink-0 rounded-full ${current?.fill ?? "bg-v2-border"}`}
                          />
                          <select
                            name="color"
                            defaultValue={mem.color ?? ""}
                            aria-label={`${s["admin.staff.colorLabel"]} — ${name}`}
                            className={adminInputInline}
                          >
                            <option value="">{s["admin.staff.colorAuto"]}</option>
                            {THERAPIST_PALETTE.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="ghost" size="sm">
                            {s["common.save"]}
                          </Button>
                        </form>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {section === "service" && isTherapist && (
              <form
                action={setPrimaryServiceAction}
                className="flex flex-col gap-2"
              >
                <input type="hidden" name="therapistId" value={userId} />
                <span className={adminLabel}>{s["admin.staff.colPrimaryService"]}</span>
                {services.length === 0 ? (
                  <p className="text-sm text-v2-text-secondary">
                    {s["admin.staff.noServices"]}
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      name="serviceId"
                      defaultValue={currentPrimaryId}
                      aria-label={s["admin.staff.colPrimaryService"]}
                      className={adminInputInline}
                    >
                      <option value="">{s["admin.staff.selectService"]}</option>
                      {services.map((svc) => (
                        <option key={svc.id} value={svc.id}>
                          {svc.name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="ghost" size="sm">
                      {s["admin.staff.setPrimary"]}
                    </Button>
                  </div>
                )}
              </form>
            )}

            {section === "hours" && showHours && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-v2-text-secondary">
                    {s["admin.staff.hoursHelp"]}
                  </p>
                  {/* Time-off blocks (Bloquear horário) — reuses the W5-12 editor,
                      opened as a stacked top-layer dialog above this modal. */}
                  <TherapistBlocks
                    therapistId={userId}
                    therapistName={fullName}
                    blocks={blocks}
                    labels={blockLabels}
                  />
                </div>

                {/* Weekly schedule reconcile — a single Guardar through the W4-14
                    write paths (saveTherapistScheduleAction). Toggling a day off +
                    Guardar archives it (no password: admin-gated surface). */}
                <form
                  action={saveTherapistScheduleAction}
                  className="flex flex-col gap-3"
                >
                  <input type="hidden" name="userId" value={userId} />
                  {days.map((d) => (
                    <fieldset
                      key={d.weekday}
                      className="flex flex-wrap items-end gap-3 rounded-v2 border border-v2-border p-3"
                    >
                      <label className="flex min-w-32 items-center gap-2 self-center">
                        <input
                          type="checkbox"
                          name={`d${d.weekday}_on`}
                          defaultChecked={d.on}
                          aria-label={`${s["admin.workingHours.worksLabel"]} — ${d.label}`}
                        />
                        <span className="font-medium text-v2-text-primary">{d.label}</span>
                      </label>
                      <input type="hidden" name={`d${d.weekday}_id`} value={d.id} />
                      <label className="flex flex-col gap-1">
                        <span className={adminLabel}>{s["admin.workingHours.start"]}</span>
                        <TimeFieldInput name={`d${d.weekday}_start`} defaultValue={d.start} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={adminLabel}>{s["admin.workingHours.end"]}</span>
                        <TimeFieldInput name={`d${d.weekday}_end`} defaultValue={d.end} />
                      </label>
                      {/* PL-14: one clinic = no per-day choice; the value still
                          posts, the select disappears. */}
                      {locations.length === 1 ? (
                        <input
                          type="hidden"
                          name={`d${d.weekday}_location`}
                          value={d.locationId || fallbackLocation}
                        />
                      ) : (
                        <label className="flex flex-col gap-1">
                          <span className={adminLabel}>{s["admin.workingHours.location"]}</span>
                          <select
                            name={`d${d.weekday}_location`}
                            defaultValue={d.locationId || fallbackLocation}
                            aria-label={`${s["admin.workingHours.location"]} — ${d.label}`}
                            className={adminInputInline}
                          >
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </fieldset>
                  ))}
                  <div className="flex justify-end">
                    <Button type="submit" variant="primary">
                      {s["common.save"]}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
