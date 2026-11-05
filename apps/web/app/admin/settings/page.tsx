import { Button, GlassPanel } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE, LOCALES } from "@osteojp/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getTenantSettings } from "@/lib/admin/settings";
import {
  REMINDER_LEAD_TIME_OPTIONS,
  BILLING_CURRENCIES,
} from "@/lib/admin/settings-config";
import { changeDeletePasswordAction, saveBirthdayIndicationAction, saveSettings } from "./actions";
import {
  adminHelp,
  adminInput,
  adminLabel,
  adminLegend,
} from "../admin-ui";

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
    <section className="flex max-w-xl flex-col gap-4">
      <h2 className="text-xl text-v2-text-primary">{s["admin.settings.title"]}</h2>

      {banner && (
        <p className={`text-sm ${banner.ok ? "text-success-700" : "text-error"}`} role="status">
          {banner.text}
        </p>
      )}

      {/* Indicação de Aniversários (Fisiozero parity): Fisiozero's FIRST panel
          under Definições gerais, so it is first here too. One row, the label
          and grey sub-text on the left, the switch on the right. Its own form,
          like the delete password below, so it never rides on the main save.
          No client JavaScript: the switch is a submit button with
          role="switch" that posts the value it changes to (the ficha's survey
          switch is the same control). */}
      <GlassPanel>
        <form action={saveBirthdayIndicationAction} className="flex flex-col gap-3">
          <h3 className="text-lg text-v2-text-primary">{s["admin.settings.sectionBirthdays"]}</h3>
          <input
            type="hidden"
            name="birthdayHeaderIcon"
            value={settings.birthdayIndication.headerIcon ? "false" : "true"}
          />
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span id="birthday-header-icon-label" className={adminLabel}>
                {s["admin.settings.birthdayHeaderIcon"]}
              </span>
              <span id="birthday-header-icon-hint" className={adminHelp}>
                {s["admin.settings.birthdayHeaderIconHint"]}
              </span>
            </div>
            <button
              type="submit"
              role="switch"
              aria-checked={settings.birthdayIndication.headerIcon}
              aria-labelledby="birthday-header-icon-label"
              aria-describedby="birthday-header-icon-hint"
              data-testid="settings-birthday-header-icon"
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
                settings.birthdayIndication.headerIcon ? "bg-accent-2-600" : "bg-neutral-300"
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform duration-fast ease-standard ${
                  settings.birthdayIndication.headerIcon ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>
        </form>
      </GlassPanel>

      <GlassPanel>
        <form action={saveSettings} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Field name="name" label={s["admin.settings.clinicName"]} defaultValue={settings.name} required />
            <Field name="nif" label={s["admin.settings.nif"]} defaultValue={settings.nif} />
            <Field name="email" label={s["admin.settings.email"]} type="email" defaultValue={settings.contacts.email} />
            <Field name="phone" label={s["admin.settings.phone"]} defaultValue={settings.contacts.phone} />
            <Field name="address" label={s["admin.settings.address"]} defaultValue={settings.contacts.address} />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className={adminLegend}>{s["admin.settings.sectionPreferences"]}</legend>
            <label className="block space-y-1">
              <span className={adminLabel}>{s["admin.settings.locale"]}</span>
              <select name="locale" defaultValue={config.locale} className={adminInput}>
                {LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {s[`admin.settings.locale.${loc}` as const]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className={adminLegend}>{s["admin.settings.sectionReminders"]}</legend>
            <Toggle name="reminderEmailEnabled" label={s["admin.settings.reminderEmail"]} defaultChecked={config.reminders.emailEnabled} />
            <Toggle name="reminderSmsEnabled" label={s["admin.settings.reminderSms"]} defaultChecked={config.reminders.smsEnabled} />
            <div className="flex flex-col gap-1">
              <span className={adminLabel}>{s["admin.settings.reminderLeadTime"]}</span>
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

          <fieldset className="flex flex-col gap-3">
            <legend className={adminLegend}>{s["admin.settings.sectionBilling"]}</legend>
            <label className="block space-y-1">
              <span className={adminLabel}>{s["admin.settings.billingCurrency"]}</span>
              <select name="billingCurrency" defaultValue={config.billing.currency} className={adminInput}>
                {BILLING_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </label>
            <Field name="billingVatRate" label={s["admin.settings.billingVatRate"]} type="number" defaultValue={String(config.billing.vatRate)} />
            <Field name="billingInvoiceEmail" label={s["admin.settings.billingInvoiceEmail"]} type="email" defaultValue={config.billing.invoiceEmail} />
          </fieldset>

          <div>
            <Button type="submit" variant="primary">
              {s["common.save"]}
            </Button>
          </div>
        </form>
      </GlassPanel>

      {/* Appointment hard-delete password (W3-06) — its own form so it never
          rides on the main settings save. The current value is never shown
          (stored hashed server-side); leave the field to keep it unchanged. */}
      <GlassPanel>
        <form action={changeDeletePasswordAction} className="flex flex-col gap-3">
          <h3 className="text-lg text-v2-text-primary">{s["admin.settings.sectionDeletePassword"]}</h3>
          <p className="text-sm text-v2-text-secondary">{s["admin.settings.deletePasswordHint"]}</p>
          <Field
            name="deletePassword"
            label={s["admin.settings.deletePassword"]}
            type="password"
            defaultValue=""
          />
          <div>
            <Button type="submit" variant="primary">
              {s["admin.settings.deletePasswordSave"]}
            </Button>
          </div>
        </form>
      </GlassPanel>
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
      <span className={adminLabel}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} className={adminInput} />
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
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 rounded border-v2-border text-v2-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2" />
      <span className="text-sm text-v2-text-primary">{label}</span>
    </label>
  );
}
