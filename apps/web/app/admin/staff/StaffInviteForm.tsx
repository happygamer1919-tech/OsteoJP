"use client";
import { useActionState } from "react";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { inviteAction, type InviteState } from "./actions";

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
    <form action={action} className="space-y-3 rounded border p-4 max-w-xl">
      <h3 className="text-sm font-semibold">{s["admin.staff.inviteTitle"]}</h3>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["admin.staff.fullName"]}</span>
        <input name="fullName" required className="block w-full rounded border px-2 py-1.5 text-sm" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["admin.staff.email"]}</span>
        <input name="email" type="email" required className="block w-full rounded border px-2 py-1.5 text-sm" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["admin.staff.role"]}</span>
        <select name="role" required className="block w-full rounded border px-2 py-1.5 text-sm">
          {roles.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {s["admin.staff.invite"]}
      </button>

      {state.ok && state.delivery === "email" && (
        <div className="rounded border border-success bg-success-bg p-3 text-sm">
          <p className="font-medium text-success">{s["admin.staff.invited"]}</p>
          <p className="mt-1">{s["admin.staff.inviteEmailSent"]}</p>
        </div>
      )}
      {state.ok && state.delivery === "temp_password" && state.tempPassword && (
        <div className="rounded border border-success bg-success-bg p-3 text-sm">
          <p className="font-medium text-success">{s["admin.staff.invited"]}</p>
          {/* Email could not be delivered — fall back to out-of-band hand-off. */}
          <p className="mt-1">{s["admin.staff.inviteEmailFailed"]}</p>
          <p className="mt-1">{s["admin.staff.tempPasswordNotice"]}</p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 font-mono">
            {state.tempPassword}
          </code>
        </div>
      )}
      {errorText && <p className="text-sm text-error">{errorText}</p>}
    </form>
  );
}
