import Link from "next/link";
import { assignableRoles, type Role } from "@osteojp/auth";
import { Button, GlassPanel, KpiCard, StatusBadge } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listStaff } from "@/lib/admin/staff";
import { listServices } from "@/lib/admin/services";
import { listTherapistPrimaries } from "@/lib/admin/therapist-primary-service";
import { listAvailabilityTemplates } from "@/lib/admin/availability";
import { StaffInviteForm } from "./StaffInviteForm";
import { changeRoleAction, deleteStaffAction, editStaffAction, setActiveAction, setPrimaryServiceAction } from "./actions";
import {
  adminInputInline,
  adminTd,
  adminTh,
  adminTrBorder,
} from "../admin-ui";

const s = getStrings(DEFAULT_LOCALE);

const ROLE_LABEL: Record<Role, string> = {
  owner: s["admin.role.owner"],
  admin: s["admin.role.admin"],
  therapist: s["admin.role.therapist"],
  reception: s["admin.role.reception"],
};

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireRequestContext();
  const staff = await listStaff(actor);
  const primaries = await listTherapistPrimaries(actor);
  // ALL active tenant services — the primary dropdown lists these so a therapist
  // with ZERO mappings can still be assigned a first/primary service (W4-01).
  const activeServices = (await listServices(actor)).filter((svc) => svc.isActive);
  // Active working-hours templates — used only to derive the "with hours set"
  // summary count (reuse of the W2-12 read; no new query shape, no raw SQL).
  const availability = await listAvailabilityTemplates(actor);
  const { m } = await searchParams;

  // Only an owner may assign/modify the owner tier; hide it from admins. The
  // assignable set is the matrix's single source of truth (assignableRoles),
  // shared with the server-side reassignment gate (canReassignRole).
  const isOwner = actor.role === "owner";
  const roleOptions = assignableRoles(actor.role).map((slug) => ({
    slug,
    label: ROLE_LABEL[slug],
  }));

  // Team summary counts (W4-13) — derived from the reads already loaded above,
  // so the invite area's dead zone carries useful context.
  const therapistIdsWithHours = new Set(availability.map((a) => a.userId));
  const activeCount = staff.filter((u) => u.isActive).length;
  const inactiveCount = staff.length - activeCount;
  const withPrimaryCount = staff.filter(
    (u) => u.roleSlug === "therapist" && primaries.get(u.id)?.primaryServiceId,
  ).length;
  const withHoursCount = staff.filter(
    (u) => u.roleSlug === "therapist" && therapistIdsWithHours.has(u.id),
  ).length;

  const errorText =
    m === "err:last_owner" ? s["admin.staff.lastOwnerBlocked"]
    : m === "err:owner_tier" ? s["admin.staff.ownerTierBlocked"]
    : m === "err:email_taken" ? s["admin.staff.emailTakenBlocked"]
    : m === "err:password" ? s["admin.staff.deleteWrongPassword"]
    : m === "err:has_activity" ? s["admin.staff.deleteHasActivity"]
    : m && m.startsWith("err") ? s["admin.staff.error"]
    : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.staff.title"]}</h2>

      {errorText && <p className="text-sm text-error" role="status">{errorText}</p>}

      {/* Full-width invite area: invite form + a team-summary panel filling the
          former dead zone to its right (W4-13). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-start">
        <StaffInviteForm roles={roleOptions} />

        <GlassPanel title={s["admin.staff.summaryTitle"]}>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard label={s["admin.staff.summaryActive"]} value={activeCount} />
            <KpiCard label={s["admin.staff.summaryInactive"]} value={inactiveCount} />
            <KpiCard label={s["admin.staff.summaryPrimary"]} value={withPrimaryCount} />
            <KpiCard label={s["admin.staff.summaryHours"]} value={withHoursCount} />
          </div>
        </GlassPanel>
      </div>

      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={adminTrBorder}>
                <th className={adminTh}>{s["admin.staff.colName"]}</th>
                <th className={adminTh}>{s["admin.staff.colEmail"]}</th>
                <th className={adminTh}>{s["admin.staff.colRole"]}</th>
                <th className={adminTh}>{s["admin.staff.colPrimaryService"]}</th>
                <th className={adminTh}>{s["admin.staff.colStatus"]}</th>
                <th className={adminTh}>{s["admin.staff.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => {
                const manageable = isOwner || u.roleSlug !== "owner";
                return (
                  <tr key={u.id} className={adminTrBorder}>
                    <td className={adminTd}>{u.fullName}</td>
                    <td className={adminTd}>{u.email}</td>
                    <td className={adminTd}>{u.roleSlug ? ROLE_LABEL[u.roleSlug] : "—"}</td>
                    <td className={adminTd}>
                      {u.roleSlug === "therapist" ? (
                        activeServices.length === 0 ? (
                          <span className="text-v2-text-secondary">{s["admin.staff.noServices"]}</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Primary-service dropdown lists ALL active services, so a
                                zero-mapping therapist can be assigned a first primary
                                and an existing one re-designated (W4-01). Kept VISIBLE
                                in the row (W4-13): core scannable column + e2e anchor. */}
                            <form action={setPrimaryServiceAction} className="flex items-center gap-1">
                              <input type="hidden" name="therapistId" value={u.id} />
                              <select
                                name="serviceId"
                                defaultValue={primaries.get(u.id)?.primaryServiceId ?? ""}
                                aria-label={s["admin.staff.colPrimaryService"]}
                                className={adminInputInline}
                              >
                                <option value="">{s["admin.staff.selectService"]}</option>
                                {activeServices.map((svc) => (
                                  <option key={svc.id} value={svc.id}>
                                    {svc.name}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit" variant="ghost" size="sm">{s["admin.staff.setPrimary"]}</Button>
                            </form>
                            {/* Entry point into the W2-12 Horários surface, focused on
                                this therapist (W4-01 part b). */}
                            <Link
                              href={`/admin/working-hours?t=${u.id}`}
                              className="text-sm text-brand-teal underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            >
                              {s["admin.staff.workingHours"]}
                            </Link>
                          </div>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={adminTd}>
                      <StatusBadge tone={u.isActive ? "confirmed" : "cancelled"}>
                        {u.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                      </StatusBadge>
                    </td>
                    <td className={adminTd}>
                      {manageable ? (
                        // Row-actions disclosure (W4-13): the management inputs
                        // (edit, role, activate/deactivate, password-gated delete)
                        // are grouped into a compact drawer instead of always-on
                        // inline inputs. Every action wires to its SAME existing
                        // server-action handler — presentational grouping only.
                        <details className="group">
                          <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-v2 border border-v2-border bg-v2-surface px-3 py-1.5 text-sm text-v2-text-primary hover:bg-v2-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden">
                            {s["admin.staff.manage"]}
                          </summary>
                          <div className="mt-3 flex flex-col gap-3 rounded-v2 border border-v2-border bg-v2-surface p-3">
                            <form action={editStaffAction} className="flex flex-wrap items-center gap-1">
                              <input type="hidden" name="userId" value={u.id} />
                              <input name="fullName" defaultValue={u.fullName} required aria-label={s["admin.staff.fullName"]} className={adminInputInline} />
                              <input name="email" type="email" defaultValue={u.email} required aria-label={s["admin.staff.email"]} className={adminInputInline} />
                              <Button type="submit" variant="ghost" size="sm">{s["admin.staff.save"]}</Button>
                            </form>
                            <form action={changeRoleAction} className="flex items-center gap-1">
                              <input type="hidden" name="userId" value={u.id} />
                              <select name="role" defaultValue={u.roleSlug ?? ""} aria-label={s["admin.staff.colRole"]} className={adminInputInline}>
                                {roleOptions.map((r) => (
                                  <option key={r.slug} value={r.slug}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit" variant="ghost" size="sm">{s["admin.staff.apply"]}</Button>
                            </form>
                            <form action={setActiveAction}>
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="active" value={u.isActive ? "false" : "true"} />
                              <Button type="submit" variant="ghost" size="sm">
                                {u.isActive ? s["admin.staff.deactivate"] : s["admin.staff.reactivate"]}
                              </Button>
                            </form>
                            {/* Password-gated hard delete (W4-01). Never an owner or
                                yourself; refused server-side if the therapist has any
                                appointments/records/audit (deactivate instead). Gate
                                UNCHANGED — W4-13 only restyles it. */}
                            {u.roleSlug !== "owner" && u.id !== actor.userId && (
                              <form action={deleteStaffAction} className="flex items-center gap-1">
                                <input type="hidden" name="userId" value={u.id} />
                                <input
                                  name="password"
                                  type="password"
                                  required
                                  aria-label={s["admin.staff.deletePassword"]}
                                  placeholder={s["admin.staff.deletePassword"]}
                                  className={`w-28 ${adminInputInline}`}
                                />
                                <Button type="submit" variant="destructive" size="sm">
                                  {s["admin.staff.delete"]}
                                </Button>
                              </form>
                            )}
                          </div>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </section>
  );
}
