import { getStrings, DEFAULT_LOCALE, LOCALES } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getTenantSettings } from "@/lib/admin/settings";
import {
  REMINDER_LEAD_TIME_OPTIONS,
  BILLING_CURRENCIES,
} from "@/lib/admin/settings-config";
import { saveSettings } from "./actions";

const s = getStrings(DEFAULT_LOCALE);

const LEAD_TIME_LABEL: Record<number, string> = {
  48: s["admin.settings.leadTime48"],
  24: s["admin.settings.leadTime24"],
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireRequestContext();
  const settings = await getTenantSettings(actor);
  const { config } = settings;
  const { m } = await searchParams;

  const banner =
    m === "ok" ? { ok: true, text: s["admin.settings.saved"] }
    : m ? { ok: false, text: s["admin.settings.error"] }
    : null;

  return (
    <section className="max-w-xl space-y-4">
      <h2 className="text-base font-semibold">{s["admin.settings.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success" : "text-error"}`}>
          {banner.text}
        </p>
      )}

      <form action={saveSettings} className="space-y-6">
        <div className="space-y-3">
          <Field name="name" label={s["admin.settings.clinicName"]} defaultValue={settings.name} required />
          <Field name="nif" label={s["admin.settings.nif"]} defaultValue={settings.nif} />
          <Field name="email" label={s["admin.settings.email"]} type="email" defaultValue={settings.contacts.email} />
          <Field name="phone" label={s["admin.settings.phone"]} defaultValue={settings.contacts.phone} />
          <Field name="address" label={s["admin.settings.address"]} defaultValue={settings.contacts.address} />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{s["admin.settings.sectionPreferences"]}</legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{s["admin.settings.locale"]}</span>
            <select
              name="locale"
              defaultValue={config.locale}
              className="block w-full rounded border px-2 py-1.5 text-sm"
            >
              {LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {s[`admin.settings.locale.${loc}` as const]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{s["admin.settings.sectionReminders"]}</legend>
          <Toggle
            name="reminderEmailEnabled"
            label={s["admin.settings.reminderEmail"]}
            defaultChecked={config.reminders.emailEnabled}
          />
          <Toggle
            name="reminderSmsEnabled"
            label={s["admin.settings.reminderSms"]}
            defaultChecked={config.reminders.smsEnabled}
          />
          <div className="space-y-1">
            <span className="text-sm font-medium">{s["admin.settings.reminderLeadTime"]}</span>
            {REMINDER_LEAD_TIME_OPTIONS.map((hours) => (
              <Toggle
                key={hours}
                name={`reminderLeadTime_${hours}`}
                label={LEAD_TIME_LABEL[hours]}
                defaultChecked={config.reminders.leadTimeHours.includes(hours)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{s["admin.settings.sectionBilling"]}</legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{s["admin.settings.billingCurrency"]}</span>
            <select
              name="billingCurrency"
              defaultValue={config.billing.currency}
              className="block w-full rounded border px-2 py-1.5 text-sm"
            >
              {BILLING_CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
          </label>
          <Field
            name="billingVatRate"
            label={s["admin.settings.billingVatRate"]}
            type="number"
            defaultValue={String(config.billing.vatRate)}
          />
          <Field
            name="billingInvoiceEmail"
            label={s["admin.settings.billingInvoiceEmail"]}
            type="email"
            defaultValue={config.billing.invoiceEmail}
          />
        </fieldset>

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

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="rounded border" />
      <span className="text-sm">{label}</span>
    </label>
  );
}
