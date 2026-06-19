"use client";
import { useActionState } from "react";
import { GlassPanel } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { inviteAction, type InviteState } from "./actions";
import { adminBtnPrimary, adminInput, adminLabel } from "../admin-ui";

const s = getStrings(DEFAULT_LOCALE);
const initial: InviteState = { ok: false };

export function StaffInviteForm({
  roles,
}: {
  roles: { slug: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(inviteAction, initial);

  const errorText =
    state.code === "owner_tier"
      ? s["admin.staff.ownerTierBlocked"]
      : state.code === "already_invited"
        ? s["admin.staff.alreadyInvitedBlocked"]
        : state.code
          ? s["admin.staff.error"]
          : null;

  return (
    <GlassPanel title={s["admin.staff.inviteTitle"]} className="max-w-xl">
      <form action={action} className="flex flex-col gap-3">
        <label className="block space-y-1">
          <span className={adminLabel}>{s["admin.staff.fullName"]}</span>
          <input name="fullName" required className={adminInput} />
        </label>
        <label className="block space-y-1">
          <span className={adminLabel}>{s["admin.staff.email"]}</span>
          <input name="email" type="email" required className={adminInput} />
        </label>
        <label className="block space-y-1">
          <span className={adminLabel}>{s["admin.staff.role"]}</span>
          <select name="role" required className={adminInput}>
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <button type="submit" disabled={pending} className={adminBtnPrimary}>
            {s["admin.staff.invite"]}
          </button>
        </div>

        {state.ok && state.delivery === "email" && (
          <div role="status" className="rounded-v2 border border-success bg-success-bg p-3 text-sm text-v2-text-primary">
            <p className="font-medium text-success-700">{s["admin.staff.invited"]}</p>
            <p className="mt-1">{s["admin.staff.inviteEmailSent"]}</p>
          </div>
        )}
        {state.ok && state.delivery === "temp_password" && state.tempPassword && (
          <div role="status" className="rounded-v2 border border-success bg-success-bg p-3 text-sm text-v2-text-primary">
            <p className="font-medium text-success-700">{s["admin.staff.invited"]}</p>
            {/* Email could not be delivered — fall back to out-of-band hand-off. */}
            <p className="mt-1">{s["admin.staff.inviteEmailFailed"]}</p>
            <p className="mt-1">{s["admin.staff.tempPasswordNotice"]}</p>
            <code className="mt-1 block break-all rounded bg-v2-surface px-2 py-1 font-mono">
              {state.tempPassword}
            </code>
          </div>
        )}
        {errorText && <p role="alert" className="text-sm text-error">{errorText}</p>}
      </form>
    </GlassPanel>
  );
}
