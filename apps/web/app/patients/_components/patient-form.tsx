"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { Button } from "@osteojp/ui";
import { createPatient, updatePatient } from "../../../lib/patients/actions";
import type { Patient } from "../../../lib/patients/types";
import {
  MAX_HEALTH_INSURANCE_ENTRIES,
  type HealthInsuranceEntry,
} from "../../../lib/patients/validation";

const s = getStrings(DEFAULT_LOCALE);

// "Como nos conheceu?" (W5-11) — the four fixed option LABELS. The one stored in
// patients.referral_source is either the chosen label or, for Outro, the typed
// free-text. `referralOtherValue` is the sentinel the <select> uses for Outro.
const referralOtherValue = "__outro__";
const referralOptions = [
  s["patients.referralSocial"],
  s["patients.referralWebsite"],
  s["patients.referralFriend"],
] as const;
const referralOptionSet = new Set<string>(referralOptions);

type Fields = {
  fullName: string;
  dateOfBirth: string;
  sex: string;
  nif: string;
  // PL-23 — health insurance plans. A LIST because a patient may hold more than
  // one (ADSE plus a private insurer is ordinary here); the insurer is optional
  // beside the number, because a bare number is not usable at the desk.
  healthInsuranceNumbers: HealthInsuranceEntry[];
  email: string;
  phone: string;
  // `address` (street) is retained in state so its stored value round-trips
  // untouched on save, even though the input is no longer surfaced (see form).
  address: string;
  postalCode: string;
  city: string;
  profession: string;
  // W5-11 — "Como nos conheceu?". `referralChoice` is the <select> value (a
  // fixed label or the Outro sentinel); `referralOther` is the free-text shown
  // only when Outro is picked. They collapse to one referral_source on submit.
  referralChoice: string;
  referralOther: string;
  // NESA contraindication flags (0031) — drive the soft booking warning (W2-08).
  contraindicationEpilepsy: boolean;
  contraindicationPregnancy: boolean;
  contraindicationPacemaker: boolean;
  contraindicationOther: boolean;
  contraindicationOtherNote: string;
  // PL-15b — the clinic this patient belongs to (patients.primary_location_id).
  // "" = not set. The form is the ONLY writer: before this the column existed
  // (0045) and both the action and the validation accepted it, but no UI ever
  // sent it, so every patient registered since then was location-less and
  // therefore invisible to everyone but the owner and whoever created them.
  primaryLocationId: string;
};

function toFields(p?: Patient | null): Fields {
  // Reverse-map a stored referral_source back into the choice/other split: a
  // value matching one of the fixed labels selects that option; any other
  // non-empty value is an Outro free-text; empty/null is "not specified".
  const stored = p?.referralSource ?? "";
  const isKnown = referralOptionSet.has(stored);
  return {
    fullName: p?.fullName ?? "",
    dateOfBirth: p?.dateOfBirth ?? "",
    sex: p?.sex ?? "",
    nif: p?.nif ?? "",
    healthInsuranceNumbers: p?.healthInsuranceNumbers ?? [],
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    address: p?.address ?? "",
    postalCode: p?.postalCode ?? "",
    city: p?.city ?? "",
    profession: p?.profession ?? "",
    referralChoice: stored === "" ? "" : isKnown ? stored : referralOtherValue,
    referralOther: stored !== "" && !isKnown ? stored : "",
    contraindicationEpilepsy: p?.contraindicationEpilepsy ?? false,
    contraindicationPregnancy: p?.contraindicationPregnancy ?? false,
    contraindicationPacemaker: p?.contraindicationPacemaker ?? false,
    contraindicationOther: p?.contraindicationOther ?? false,
    contraindicationOtherNote: p?.contraindicationOtherNote ?? "",
    primaryLocationId: p?.primaryLocationId ?? "",
  };
}

// Collapse the choice/other split into the single referral_source value written
// to the DB: Outro -> the trimmed free-text; a fixed option -> its label;
// nothing selected -> "" (validation normalizes to null).
function resolveReferralSource(fields: Fields): string {
  if (fields.referralChoice === referralOtherValue) return fields.referralOther.trim();
  return fields.referralChoice;
}

/** PL-15b — the clinics this viewer may file a patient under (already narrowed
 *  to their own; see lib/auth/location-choice). One entry = no choice to make. */
export type PatientLocationOption = { id: string; name: string };

export function PatientForm({
  patient,
  locations = [],
}: {
  patient?: Patient | null;
  locations?: PatientLocationOption[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(() => {
    const base = toFields(patient);
    // PL-14 rule: with exactly one reachable clinic there is nothing to choose,
    // so it is pre-applied rather than offered. On edit an existing value always
    // wins - a patient already filed at another clinic is never silently moved.
    if (!base.primaryLocationId && locations.length === 1) {
      return { ...base, primaryLocationId: locations[0]!.id };
    }
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(patient);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Collapse the referral choice/other split into the single stored value,
    // dropping the UI-only split keys before the payload reaches the action.
    const { referralChoice, referralOther, ...rest } = fields;
    void referralChoice;
    void referralOther;
    const payload = { ...rest, referralSource: resolveReferralSource(fields) };
    startTransition(async () => {
      try {
        const saved =
          isEdit && patient
            ? await updatePatient(patient.id, payload)
            : await createPatient(payload);
        router.push(`/patients/${saved.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : s["errors.generic"]);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <Field label={s["patients.fieldFullName"]} required>
        <input
          required
          value={fields.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={s["patients.fieldDateOfBirth"]}>
          {/* BUG-08 fix: lang="pt-PT" ensures browser date picker uses
              dd/mm/yyyy format on all machines, not the tester's OS locale */}
          <input
            type="date"
            lang="pt-PT"
            value={fields.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldSex"]}>
          {/* BUG-07 fix: was a plain <input type="text">; now a <select> */}
          <select
            value={fields.sex}
            onChange={(e) => set("sex", e.target.value)}
            className={inputCls}
          >
            <option value="">{s["patients.sexNotSpecified"]}</option>
            <option value="male">{s["patients.sexMale"]}</option>
            <option value="female">{s["patients.sexFemale"]}</option>
          </select>
        </Field>
        <Field label={s["patients.fieldNif"]}>
          <input
            value={fields.nif}
            onChange={(e) => set("nif", e.target.value)}
            className={inputCls}
          />
        </Field>
        <HealthInsuranceFields
          entries={fields.healthInsuranceNumbers}
          onChange={(next) => set("healthInsuranceNumbers", next)}
          inputCls={inputCls}
        />
        <Field label={s["patients.fieldPhone"]}>
          <input
            value={fields.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldEmail"]}>
          <input
            type="email"
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldCity"]}>
          <input
            value={fields.city}
            onChange={(e) => set("city", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldPostalCode"]}>
          <input
            value={fields.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldProfession"]}>
          <input
            value={fields.profession}
            onChange={(e) => set("profession", e.target.value)}
            className={inputCls}
          />
        </Field>
        {/* PL-15b — which clinic the patient belongs to. This is what makes a
            patient visible to that clinic's reception/admin (0047 RLS reads
            primary_location_id when there is no appointment yet). PL-14 rule:
            one clinic -> a static line, several -> a required picker. */}
        {locations.length === 1 ? (
          <Field label={s["header.location"]}>
            <p data-testid="patient-fixed-location" className="py-2 text-sm text-text-primary">
              {locations[0]!.name}
            </p>
          </Field>
        ) : locations.length > 1 ? (
          <Field label={s["header.location"]} required>
            <select
              required
              value={fields.primaryLocationId}
              onChange={(e) => set("primaryLocationId", e.target.value)}
              className={inputCls}
            >
              <option value="">{s["appointment.selectLocation"]}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={s["patients.fieldReferralSource"]}>
          <select
            value={fields.referralChoice}
            onChange={(e) => set("referralChoice", e.target.value)}
            className={inputCls}
          >
            <option value="">{s["patients.referralNotSpecified"]}</option>
            <option value={s["patients.referralSocial"]}>{s["patients.referralSocial"]}</option>
            <option value={s["patients.referralWebsite"]}>{s["patients.referralWebsite"]}</option>
            <option value={s["patients.referralFriend"]}>{s["patients.referralFriend"]}</option>
            <option value={referralOtherValue}>{s["patients.referralOther"]}</option>
          </select>
        </Field>
        {fields.referralChoice === referralOtherValue && (
          <Field label={s["patients.fieldReferralOther"]}>
            <input
              value={fields.referralOther}
              onChange={(e) => set("referralOther", e.target.value)}
              className={inputCls}
            />
          </Field>
        )}
      </div>
      {/* NESA contraindication flags (W2-08) — drive a soft booking warning. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-text-secondary">
          {s["patients.contraindicationsLabel"]}
        </legend>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={fields.contraindicationEpilepsy}
            onChange={(e) => set("contraindicationEpilepsy", e.target.checked)}
          />
          {s["patients.fieldContraindicationEpilepsy"]}
        </label>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={fields.contraindicationPregnancy}
            onChange={(e) => set("contraindicationPregnancy", e.target.checked)}
          />
          {s["patients.fieldContraindicationPregnancy"]}
        </label>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={fields.contraindicationPacemaker}
            onChange={(e) => set("contraindicationPacemaker", e.target.checked)}
          />
          {s["patients.fieldContraindicationPacemaker"]}
        </label>
        {/* W12-25: decoupled "Outra" contraindication + a free-text note (shown
            when checked), mirroring the referral "Outro" pattern. */}
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={fields.contraindicationOther}
            onChange={(e) => set("contraindicationOther", e.target.checked)}
          />
          {s["patients.fieldContraindicationOther"]}
        </label>
        {fields.contraindicationOther && (
          <input
            value={fields.contraindicationOtherNote}
            onChange={(e) => set("contraindicationOtherNote", e.target.value)}
            placeholder={s["patients.fieldContraindicationOtherNote"]}
            maxLength={500}
            className={inputCls}
            data-testid="contraindication-other-note"
          />
        )}
      </fieldset>
      {/* Street address input intentionally not surfaced (address-reduction,
          2026-06-30). `fields.address` is preserved from the loaded patient and
          submitted unchanged, so the stored value and historical data are kept. */}
      {/* Patient notes moved to the append-only Notas tab (W2-11): the edit form
          no longer reads or writes patients.notes. */}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={pending} variant="primary">
          {isEdit ? s["common.save"] : s["patients.create"]}
        </Button>
        <Button type="button" onClick={() => router.back()} variant="secondary">
          {s["common.cancel"]}
        </Button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded border border-border-strong px-3 py-2 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

/**
 * PL-23 — the repeatable "Números dos seguros de saúde" block.
 *
 * A list rather than one box: the owner's own plural, and a patient holding
 * ADSE plus a private insurer is ordinary in PT. Empty rows are harmless - the
 * validator drops any entry with no NUMBER on save, so an abandoned half-filled
 * row never becomes a stored plan.
 */
function HealthInsuranceFields({
  entries,
  onChange,
  inputCls,
}: {
  entries: HealthInsuranceEntry[];
  onChange: (next: HealthInsuranceEntry[]) => void;
  inputCls: string;
}) {
  const update = (i: number, patch: Partial<HealthInsuranceEntry>) =>
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{s["patients.fieldHealthInsurance"]}</legend>
      {entries.length === 0 && (
        <p className="text-sm text-text-secondary">{s["patients.insuranceNone"]}</p>
      )}
      {entries.map((entry, i) => (
        // Index key: rows are positional and only ever appended or removed
        // wholesale, exactly like the lote rows in the booking drawer.
        <div key={i} className="flex flex-wrap items-end gap-2" data-testid="insurance-row">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-xs text-text-secondary">{s["patients.insuranceInsurer"]}</span>
            <input
              value={entry.insurer ?? ""}
              onChange={(e) => update(i, { insurer: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-xs text-text-secondary">{s["patients.insuranceNumber"]}</span>
            <input
              value={entry.number}
              onChange={(e) => update(i, { number: e.target.value })}
              className={inputCls}
              data-testid="insurance-number"
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
          >
            {s["patients.insuranceRemove"]}
          </Button>
        </div>
      ))}
      {entries.length < MAX_HEALTH_INSURANCE_ENTRIES && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="insurance-add"
            onClick={() => onChange([...entries, { insurer: "", number: "" }])}
          >
            {s["patients.insuranceAdd"]}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
