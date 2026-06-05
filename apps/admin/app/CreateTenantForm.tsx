"use client";
import { useActionState } from "react";
import { s } from "@/lib/i18n";
import { createTenantAction, type CreateState } from "./actions";

const initial: CreateState = { ok: false };

export function CreateTenantForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial);

  const errorText =
    state.code === "invalid_name"
      ? s["superadmin.create.errName"]
      : state.code === "invalid_slug"
        ? s["superadmin.create.errSlug"]
        : state.code === "invalid_nif"
          ? s["superadmin.create.errNif"]
          : state.code
            ? s["superadmin.create.errGeneric"]
            : null;

  const successText = state.ok
    ? state.created
      ? s["superadmin.create.created"]
      : s["superadmin.create.exists"]
    : null;

  return (
    <form action={action} className="space-y-3 rounded border border-border bg-surface p-4 max-w-xl">
      <h3 className="text-sm font-semibold">{s["superadmin.create.title"]}</h3>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["superadmin.create.name"]}</span>
        <input name="name" required className="block w-full rounded border border-border-strong px-2 py-1.5 text-sm" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["superadmin.create.slug"]}</span>
        <input
          name="slug"
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          className="block w-full rounded border border-border-strong px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-text-muted">{s["superadmin.create.slugHint"]}</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{s["superadmin.create.nif"]}</span>
        <input
          name="nif"
          inputMode="numeric"
          className="block w-full rounded border border-border-strong px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-text-muted">{s["superadmin.create.nifHint"]}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-teal px-3 py-2 text-sm font-medium text-text-inverse hover:bg-brand-teal/90 disabled:opacity-50"
      >
        {pending ? s["superadmin.create.pending"] : s["superadmin.create.submit"]}
      </button>

      {successText && <p className="text-sm text-success">{successText}</p>}
      {errorText && <p className="text-sm text-error">{errorText}</p>}
    </form>
  );
}
