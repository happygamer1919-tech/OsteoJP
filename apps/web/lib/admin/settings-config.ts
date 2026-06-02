// Tenant operational config carried in tenants.settings (jsonb): UI locale,
// appointment-reminder preferences, and billing defaults.
//
// Pure module — no DB, no server-only, no i18n side effects beyond the LOCALES
// constant. Two seams:
//   - parseTenantConfig(): TOLERANT read. Fills every missing/invalid field with
//     a default, so tenants created before this config existed (and any partial
//     blob) read back a complete, valid shape. This is how the ticket's "defaults
//     applied to existing tenants" guarantee holds without a data migration.
//   - validateConfigInput(): STRICT write. Rejects bad input with a stable field
//     code the caller maps to an AdminError, so we never persist a malformed blob.
//
// locale lives at settings.locale (top level) because reminders/locale.ts already
// resolves the tenant locale from there; reminders/billing sit alongside it.

import { LOCALES, DEFAULT_LOCALE, type Locale } from "@osteojp/i18n";

/**
 * Reminder lead times the clinic may toggle, in hours before appointment start.
 * Intentionally the same set as reminders/offsets.ts REMINDER_OFFSETS (48h, 24h)
 * — the dispatch pipeline only knows how to render those, so the settings UI
 * must not be able to select an offset the pipeline can't honor.
 */
export const REMINDER_LEAD_TIME_OPTIONS = [48, 24] as const;
export type ReminderLeadTimeHours = (typeof REMINDER_LEAD_TIME_OPTIONS)[number];

/** Currencies billing config may use. EUR-only in V1 (PT clinic). */
export const BILLING_CURRENCIES = ["EUR"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export const VAT_RATE_MIN = 0;
export const VAT_RATE_MAX = 100;

export type ReminderConfig = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  /** Subset of REMINDER_LEAD_TIME_OPTIONS, deduped, sorted earliest-first (desc). */
  leadTimeHours: ReminderLeadTimeHours[];
};

export type BillingConfig = {
  currency: BillingCurrency;
  /** Whole-percent VAT rate, 0–100. Default is the PT standard rate (23%). */
  vatRate: number;
  /** Email that receives a copy of issued invoices; "" when unset. */
  invoiceEmail: string;
};

export type TenantConfig = {
  locale: Locale;
  reminders: ReminderConfig;
  billing: BillingConfig;
};

export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  locale: DEFAULT_LOCALE, // "pt" (pt-PT)
  reminders: {
    emailEnabled: true,
    smsEnabled: true,
    leadTimeHours: [48, 24],
  },
  billing: {
    currency: "EUR",
    vatRate: 23, // PT standard VAT. Owner-confirmable before it drives real invoices.
    invoiceEmail: "",
  },
};

/* ---------------------------------------------------------------- */
/* Tolerant read                                                    */
/* ---------------------------------------------------------------- */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

function isLeadTime(v: unknown): v is ReminderLeadTimeHours {
  return (
    typeof v === "number" &&
    (REMINDER_LEAD_TIME_OPTIONS as readonly number[]).includes(v)
  );
}

/** Dedupe + keep only valid options + sort earliest-firing first (largest hour). */
function normalizeLeadTimes(values: readonly ReminderLeadTimeHours[]): ReminderLeadTimeHours[] {
  return [...new Set(values)].sort((a, b) => b - a);
}

function parseReminders(raw: unknown): ReminderConfig {
  const d = DEFAULT_TENANT_CONFIG.reminders;
  if (!isObject(raw)) return { ...d, leadTimeHours: [...d.leadTimeHours] };

  const leadTimeHours = Array.isArray(raw.leadTimeHours)
    ? normalizeLeadTimes(raw.leadTimeHours.filter(isLeadTime))
    : [...d.leadTimeHours];

  return {
    emailEnabled: typeof raw.emailEnabled === "boolean" ? raw.emailEnabled : d.emailEnabled,
    smsEnabled: typeof raw.smsEnabled === "boolean" ? raw.smsEnabled : d.smsEnabled,
    leadTimeHours,
  };
}

function parseBilling(raw: unknown): BillingConfig {
  const d = DEFAULT_TENANT_CONFIG.billing;
  if (!isObject(raw)) return { ...d };

  const currency =
    typeof raw.currency === "string" &&
    (BILLING_CURRENCIES as readonly string[]).includes(raw.currency)
      ? (raw.currency as BillingCurrency)
      : d.currency;

  const vatRate =
    typeof raw.vatRate === "number" &&
    Number.isInteger(raw.vatRate) &&
    raw.vatRate >= VAT_RATE_MIN &&
    raw.vatRate <= VAT_RATE_MAX
      ? raw.vatRate
      : d.vatRate;

  const invoiceEmail = typeof raw.invoiceEmail === "string" ? raw.invoiceEmail : d.invoiceEmail;

  return { currency, vatRate, invoiceEmail };
}

/**
 * Read a complete, valid TenantConfig from the raw tenants.settings jsonb. Never
 * throws: any missing or malformed field falls back to its default.
 */
export function parseTenantConfig(settings: unknown): TenantConfig {
  const s = isObject(settings) ? settings : {};
  return {
    locale: isLocale(s.locale) ? s.locale : DEFAULT_TENANT_CONFIG.locale,
    reminders: parseReminders(s.reminders),
    billing: parseBilling(s.billing),
  };
}

/* ---------------------------------------------------------------- */
/* Strict write                                                     */
/* ---------------------------------------------------------------- */

/** Raw, pre-validation input as it arrives from the settings form. */
export type TenantConfigInput = {
  locale: string;
  reminderEmailEnabled: boolean;
  reminderSmsEnabled: boolean;
  /** Already-parsed selected lead times (validated against the option set here). */
  reminderLeadTimeHours: number[];
  billingCurrency: string;
  /** Raw VAT string from the form; parsed + range-checked here. */
  billingVatRate: string;
  billingInvoiceEmail: string;
};

export type ConfigValidationError = { field: keyof TenantConfigInput };

export type ConfigValidationResult =
  | { ok: true; value: TenantConfig }
  | { ok: false } & ConfigValidationError;

// Deliberately light: shape check only, not RFC-5322. The real deliverability
// gate is the mail provider; this just catches obvious fat-finger input.
function looksLikeEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

/**
 * Validate raw form input into a TenantConfig, or report the first offending
 * field. Strict where read-parsing is tolerant: a user typing garbage gets a
 * rejection, never a silently-defaulted value.
 */
export function validateConfigInput(input: TenantConfigInput): ConfigValidationResult {
  if (!isLocale(input.locale)) return { ok: false, field: "locale" };

  const leadTimeHours = input.reminderLeadTimeHours.filter(isLeadTime);
  if (leadTimeHours.length !== input.reminderLeadTimeHours.length) {
    return { ok: false, field: "reminderLeadTimeHours" };
  }

  if (!(BILLING_CURRENCIES as readonly string[]).includes(input.billingCurrency)) {
    return { ok: false, field: "billingCurrency" };
  }

  // Number("") is 0, not NaN — reject empty/whitespace before the range check.
  const vatRaw = input.billingVatRate.trim();
  const vatRate = Number(vatRaw);
  if (
    vatRaw === "" ||
    !Number.isInteger(vatRate) ||
    vatRate < VAT_RATE_MIN ||
    vatRate > VAT_RATE_MAX
  ) {
    return { ok: false, field: "billingVatRate" };
  }

  const invoiceEmail = input.billingInvoiceEmail.trim();
  if (invoiceEmail !== "" && !looksLikeEmail(invoiceEmail)) {
    return { ok: false, field: "billingInvoiceEmail" };
  }

  return {
    ok: true,
    value: {
      locale: input.locale,
      reminders: {
        emailEnabled: input.reminderEmailEnabled,
        smsEnabled: input.reminderSmsEnabled,
        leadTimeHours: normalizeLeadTimes(leadTimeHours),
      },
      billing: {
        currency: input.billingCurrency as BillingCurrency,
        vatRate,
        invoiceEmail,
      },
    },
  };
}
