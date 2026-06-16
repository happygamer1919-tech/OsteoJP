import { assignableRoles, type Role } from "@osteojp/auth";
import { GlassPanel } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listStaff } from "@/lib/admin/staff";
import { StaffInviteForm } from "./StaffInviteForm";
import { changeRoleAction, editStaffAction, setActiveAction } from "./actions";
import {
  adminBtnGhost,
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
  const { m } = await searchParams;

  // Only an owner may assign/modify the owner tier; hide it from admins. The
  // assignable set is the matrix's single source of truth (assignableRoles),
  // shared with the server-side reassignment gate (canReassignRole).
  const isOwner = actor.role === "owner";
  const roleOptions = assignableRoles(actor.role).map((slug) => ({
    slug,
    label: ROLE_LABEL[slug],
  }));

  const errorText =
    m === "err:last_owner" ? s["admin.staff.lastOwnerBlocked"]
    : m === "err:owner_tier" ? s["admin.staff.ownerTierBlocked"]
    : m === "err:email_taken" ? s["admin.staff.emailTakenBlocked"]
    : m && m.startsWith("err") ? s["admin.staff.error"]
    : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.staff.title"]}</h2>

      {errorText && <p className="text-sm text-error" role="status">{errorText}</p>}

      <StaffInviteForm roles={roleOptions} />

      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={adminTrBorder}>
                <th className={adminTh}>{s["admin.staff.colName"]}</th>
                <th className={adminTh}>{s["admin.staff.colEmail"]}</th>
                <th className={adminTh}>{s["admin.staff.colRole"]}</th>
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
                      {u.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                    </td>
                    <td className={adminTd}>
                      {manageable ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={editStaffAction} className="flex items-center gap-1">
                            <input type="hidden" name="userId" value={u.id} />
                            <input name="fullName" defaultValue={u.fullName} required aria-label={s["admin.staff.fullName"]} className={adminInputInline} />
                            <input name="email" type="email" defaultValue={u.email} required aria-label={s["admin.staff.email"]} className={adminInputInline} />
                            <button type="submit" className={adminBtnGhost}>{s["admin.staff.save"]}</button>
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
                            <button type="submit" className={adminBtnGhost}>{s["admin.staff.apply"]}</button>
                          </form>
                          <form action={setActiveAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="active" value={u.isActive ? "false" : "true"} />
                            <button type="submit" className={adminBtnGhost}>
                              {u.isActive ? s["admin.staff.deactivate"] : s["admin.staff.reactivate"]}
                            </button>
                          </form>
                        </div>
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
