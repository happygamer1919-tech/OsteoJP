import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getTenantSettings } from "@/lib/admin/settings";
import { saveSettings } from "./actions";

const s = getStrings(DEFAULT_LOCALE);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireRequestContext();
  const settings = await getTenantSettings(actor);
  const { m } = await searchParams;

  const banner =
    m === "ok" ? { ok: true, text: s["admin.settings.saved"] }
    : m ? { ok: false, text: s["admin.settings.error"] }
    : null;

  return (
    <section className="max-w-xl space-y-4">
      <h2 className="text-base font-semibold">{s["admin.settings.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-green-700" : "text-red-700"}`}>
          {banner.text}
        </p>
      )}

      <form action={saveSettings} className="space-y-3">
        <Field name="name" label={s["admin.settings.clinicName"]} defaultValue={settings.name} required />
        <Field name="nif" label={s["admin.settings.nif"]} defaultValue={settings.nif} />
        <Field name="email" label={s["admin.settings.email"]} type="email" defaultValue={settings.contacts.email} />
        <Field name="phone" label={s["admin.settings.phone"]} defaultValue={settings.contacts.phone} />
        <Field name="address" label={s["admin.settings.address"]} defaultValue={settings.contacts.address} />
        <button type="submit" className="rounded border px-3 py-2 text-sm font-medium">
          {s["common.save"]}
        </button>
      </form>
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="block w-full rounded border px-2 py-1.5 text-sm"
      />
    </label>
  );
}
