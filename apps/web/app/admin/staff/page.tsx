import { ROLES, type Role } from "@osteojp/auth";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listStaff } from "@/lib/admin/staff";
import { StaffInviteForm } from "./StaffInviteForm";
import { changeRoleAction, editStaffAction, setActiveAction } from "./actions";

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

  // Only an owner may assign/modify the owner tier; hide it from admins.
  const isOwner = actor.role === "owner";
  const assignable: Role[] = isOwner ? [...ROLES] : ROLES.filter((r) => r !== "owner");
  const roleOptions = assignable.map((slug) => ({ slug, label: ROLE_LABEL[slug] }));

  const errorText =
    m === "err:last_owner" ? s["admin.staff.lastOwnerBlocked"]
    : m === "err:owner_tier" ? s["admin.staff.ownerTierBlocked"]
    : m === "err:email_taken" ? s["admin.staff.emailTakenBlocked"]
    : m && m.startsWith("err") ? s["admin.staff.error"]
    : null;

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold">{s["admin.staff.title"]}</h2>

      {errorText && <p className="text-sm text-error">{errorText}</p>}

      <StaffInviteForm roles={roleOptions} />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colName"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colEmail"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colRole"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colStatus"]}</th>
            <th className="py-2 pr-4 font-medium">{s["admin.staff.colActions"]}</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((u) => {
            const manageable = isOwner || u.roleSlug !== "owner";
            return (
              <tr key={u.id} className="border-b align-top">
                <td className="py-2 pr-4">{u.fullName}</td>
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{u.roleSlug ? ROLE_LABEL[u.roleSlug] : "-"}</td>
                <td className="py-2 pr-4">
                  {u.isActive ? s["admin.staff.active"] : s["admin.staff.inactive"]}
                </td>
                <td className="py-2 pr-4">
                  {manageable ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={editStaffAction} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          name="fullName"
                          defaultValue={u.fullName}
                          required
                          aria-label={s["admin.staff.fullName"]}
                          className="rounded border px-1 py-1"
                        />
                        <input
                          name="email"
                          type="email"
                          defaultValue={u.email}
                          required
                          aria-label={s["admin.staff.email"]}
                          className="rounded border px-1 py-1"
                        />
                        <button type="submit" className="rounded border px-2 py-1">
                          {s["admin.staff.save"]}
                        </button>
                      </form>
                      <form action={changeRoleAction} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.roleSlug ?? ""}
                          className="rounded border px-1 py-1"
                        >
                          {roleOptions.map((r) => (
                            <option key={r.slug} value={r.slug}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="rounded border px-2 py-1">
                          {s["admin.staff.apply"]}
                        </button>
                      </form>
                      <form action={setActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.isActive ? "false" : "true"} />
                        <button type="submit" className="rounded border px-2 py-1">
                          {u.isActive ? s["admin.staff.deactivate"] : s["admin.staff.reactivate"]}
                        </button>
                      </form>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
