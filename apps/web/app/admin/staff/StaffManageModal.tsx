"use client";

import { type MouseEvent, useState } from "react";
import { Button, useAnimatedDialog } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { adminInputInline, adminLabel } from "../admin-ui";
import {
  changeRoleAction,
  deleteStaffAction,
  editStaffAction,
  setActiveAction,
} from "./actions";

/**
 * StaffManageModal (W5-06) — the per-row "Gerir" management panel as a CENTERED
 * modal (UI-STYLE.md §8), replacing the far-right inline `<details>` drawer that
 * needed horizontal scrolling on the overflowing staff table.
 *
 * Built on the shared native-<dialog> primitive `useAnimatedDialog` exported
 * from @osteojp/ui (same primitive Dialog/Drawer use) — so it gets focus trap,
 * Escape-to-close, the inert background, top-layer stacking, and focus
 * restoration for free. No new packages/ui primitive.
 *
 * PRESENTATION ONLY, zero logic change: it holds the EXACT same four forms
 * (edit, role, activate/deactivate, password-gated delete) each still posting to
 * its SAME existing server-action handler. The scrypt delete gate is
 * server-enforced and untouched.
 */
export function StaffManageModal({
  userId,
  fullName,
  email,
  roleSlug,
  isActive,
  roleOptions,
  canDelete,
}: {
  userId: string;
  fullName: string;
  email: string;
  roleSlug: string;
  isActive: boolean;
  roleOptions: { slug: string; label: string }[];
  /** Delete row shown only when server-side allows it (never an owner / self). */
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { ref, shown } = useAnimatedDialog(open);
  const close = () => setOpen(false);

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
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
          "m-auto w-full max-w-md rounded-v2 p-0 shadow-v2-float glass-card",
          "backdrop:bg-text-primary/40",
          "transition-opacity duration-base ease-standard",
          shown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <div className="flex flex-col gap-4 p-6">
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

          <div className="flex flex-col gap-4">
            {/* Edit name/email — same editStaffAction handler. */}
            <form action={editStaffAction} className="flex flex-col gap-2">
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
                  defaultValue={email}
                  required
                  aria-label={s["admin.staff.email"]}
                  className={adminInputInline}
                />
              </label>
              <div>
                <Button type="submit" variant="ghost" size="sm">
                  {s["admin.staff.save"]}
                </Button>
              </div>
            </form>

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
              <input type="hidden" name="active" value={isActive ? "false" : "true"} />
              <Button type="submit" variant="ghost" size="sm">
                {isActive ? s["admin.staff.deactivate"] : s["admin.staff.reactivate"]}
              </Button>
            </form>

            {/* Password-gated hard delete — same deleteStaffAction handler; the
                scrypt gate is server-enforced and UNCHANGED (restyle only). */}
            {canDelete && (
              <form action={deleteStaffAction} className="flex flex-col gap-1">
                <input type="hidden" name="userId" value={userId} />
                <span className={adminLabel}>{s["admin.staff.deletePassword"]}</span>
                <div className="flex items-center gap-2">
                  <input
                    name="password"
                    type="password"
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
        </div>
      </dialog>
    </>
  );
}
