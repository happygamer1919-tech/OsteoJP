"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { Button } from "@osteojp/ui";
import { createPatient, updatePatient } from "../../../lib/patients/actions";
import type { PatientWriteError } from "../../../lib/patients/actions";
import type { Patient } from "../../../lib/patients/types";
import { errorSlot } from "../../../lib/patients/form-error";
import { checkNif } from "../../../lib/patients/nif";
import {
  MAX_HEALTH_INSURANCE_ENTRIES,
  nifMessage,
  type HealthInsuranceEntry,
  type PatientField,
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
  // PL-31 — the exemption for a patient with no PT NIF. Ticking it hides the
  // NIF input (the two are mutually exclusive) and reveals a required reason.
  nifExempt: boolean;
  nifExemptReason: string;
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
    nifExempt: p?.nifExempt ?? false,
    nifExemptReason: p?.nifExemptReason ?? "",
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

/**
 * INC-nif-validationerror-at-the-desk — the refusal being shown right now.
 *
 * `seq` increments on every SUBMIT that is refused, and never on a blur check.
 * It is what re-focuses the box when the operator presses Guardar twice and is
 * refused for the same reason twice: without it React sees no state change and
 * the second refusal moves nothing on the screen, which reads as the button
 * doing nothing at all - the exact complaint this card started from.
 */
type FormError = PatientWriteError & { seq: number };

const FieldErrorContext = createContext<FormError | null>(null);

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
  const [error, setError] = useState<FormError | null>(null);
  const [pending, startTransition] = useTransition();
  const refusals = useRef(0);

  const isEdit = Boolean(patient);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  // INC-nif-validationerror-at-the-desk: one place sets a refusal, so the
  // focus rule ("a submit refusal moves the cursor, a blur check does not")
  // is expressed once instead of at each call site.
  function refuse(e: PatientWriteError, focus: boolean) {
    // A blur check is seq 0 FOREVER, not "the current count". Handing it the
    // count would move the cursor into the NIF box while somebody was tabbing
    // past it to the next field - which is the failure mode that makes
    // validate-on-blur hated, and it is one line away from either behaviour.
    if (!focus) {
      setError({ ...e, seq: 0 });
      return;
    }
    refusals.current += 1;
    setError({ ...e, seq: refusals.current });
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
        // THE REFUSAL IS A VALUE NOW, not an exception. The catch below is kept
        // and still means what it always meant - something nobody at this
        // screen can act on - but a mistyped NIF no longer takes that path.
        if (!saved.ok) {
          refuse(saved.error, true);
          return;
        }
        router.push(`/patients/${saved.patient.id}`);
        router.refresh();
      } catch (err) {
        refuse(
          { field: "form", message: err instanceof Error ? err.message : s["errors.generic"] },
          true,
        );
      }
    });
  }

  /**
   * UX ONLY, and the comment is load-bearing: this decides NOTHING. The server
   * re-runs `checkNif` on every write and its answer is the one that binds. All
   * this does is say it a few seconds earlier, at the moment the operator
   * leaves the box, instead of after they have filled in ten more fields and
   * pressed Guardar.
   *
   * It does not fire on an EMPTY box. "empty" is a legitimate in-progress state
   * while somebody is still filling the form in, and on edit it is a legitimate
   * FINAL state for a patient registered before the rule; either way, telling
   * them off for a box they have not typed in yet is noise.
   */
  function onNifBlur() {
    if (fields.nifExempt) return;
    const raw = fields.nif.trim();
    if (raw === "") return;
    const problem = checkNif(raw);
    if (problem === null) {
      // Only clear what THIS check set. A refusal about another field, or the
      // server's own, is not this check's to discard.
      setError((cur) => (cur?.field === "nif" ? null : cur));
      return;
    }
    refuse({ field: "nif", message: nifMessage(problem) }, false);
  }

  return (
    <FieldErrorContext.Provider value={error}>
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <Field label={s["patients.fieldFullName"]} required errorFor="fullName">
        <input
          required
          value={fields.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={s["patients.fieldDateOfBirth"]} errorFor="dateOfBirth">
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
        <Field label={s["patients.fieldSex"]} errorFor="sex">
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
        {/* PL-31 — NIF is required on CREATE. `required` is bound to !isEdit so
            that editing a patient registered before this rule (who has no NIF)
            is still possible; the server draws the same line. Ticking the
            exemption drops the requirement and swaps in a mandatory reason,
            because the two states are alternatives, never both.

            The checkbox and its reason sit OUTSIDE <Field> on purpose: Field
            renders a <label> around its children, and a second <label> nested
            inside it is invalid HTML — the inner control would end up
            associated with the outer NIF input, so clicking "Estrangeiro"
            would focus the NIF box and getByLabel would match two controls. */}
        <Field
          label={s["patients.fieldNif"]}
          required={!isEdit && !fields.nifExempt}
          errorFor="nif"
        >
          <input
            required={!isEdit && !fields.nifExempt}
            disabled={fields.nifExempt}
            inputMode="numeric"
            autoComplete="off"
            value={fields.nif}
            onChange={(e) => set("nif", e.target.value)}
            onBlur={onNifBlur}
            className={inputCls}
          />
          <span className="text-xs text-text-secondary">
            {fields.nifExempt ? s["patients.nifExemptHint"] : s["patients.nifHint"]}
          </span>
        </Field>
        <div className="flex flex-col gap-1 self-end">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={fields.nifExempt}
              onChange={(e) => {
                const on = e.target.checked;
                // Clear the counterpart on every toggle. Leaving the old value
                // behind is what produces a record claiming both a NIF and an
                // exemption from having one; the server rejects that state, so
                // the form must not be able to compose it in the first place.
                setFields((f) => ({
                  ...f,
                  nifExempt: on,
                  nif: on ? "" : f.nif,
                  nifExemptReason: on ? f.nifExemptReason : "",
                }));
              }}
            />
            <span>{s["patients.nifExemptLabel"]}</span>
          </label>
          {fields.nifExempt && (
            <Field label={s["patients.nifExemptReasonLabel"]} required errorFor="nifExemptReason">
              <input
                required
                value={fields.nifExemptReason}
                placeholder={s["patients.nifExemptReasonPlaceholder"]}
                onChange={(e) => set("nifExemptReason", e.target.value)}
                className={inputCls}
              />
            </Field>
          )}
        </div>
        <HealthInsuranceFields
          entries={fields.healthInsuranceNumbers}
          onChange={(next) => set("healthInsuranceNumbers", next)}
          inputCls={inputCls}
        />
        <Field label={s["patients.fieldPhone"]} errorFor="phone">
          <input
            value={fields.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldEmail"]} errorFor="email">
          <input
            type="email"
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldCity"]} errorFor="city">
          <input
            value={fields.city}
            onChange={(e) => set("city", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldPostalCode"]} errorFor="postalCode">
          <input
            value={fields.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={s["patients.fieldProfession"]} errorFor="profession">
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

      {/* The refusals with no box to point at: `healthInsuranceNumbers`, the
          conditional "Outro" fields, the clinic picker, and anything thrown
          rather than returned. `errorSlot` is the ONE place that decides, so
          the message renders here or inline and never in both - which is what
          keeps the plain getByText assertions in nif-required.spec.ts out of
          Playwright's strict-mode failure. */}
      {error && errorSlot(error.field) === "form" && (
        <p role="alert" className="text-sm text-error">
          {error.message}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={pending} variant="primary">
          {isEdit ? s["common.save"] : s["patients.create"]}
        </Button>
        <Button type="button" onClick={() => router.back()} variant="secondary">
          {s["common.cancel"]}
        </Button>
      </div>
    </form>
    </FieldErrorContext.Provider>
  );
}

const inputCls =
  "w-full rounded border border-border-strong px-3 py-2 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/**
 * INC-nif-validationerror-at-the-desk — a field that can carry its own refusal.
 *
 * `errorFor` is the PatientField this box owns, and it is deliberately an
 * UNUSUAL prop name: `form-error.test.ts` reads this file's source with a plain
 * regex and asserts the set of `errorFor` values equals `INLINE_ERROR_FIELDS`,
 * so the placement rule and the markup cannot drift apart. A prop called `name`
 * would have matched every input on the page.
 *
 * THE FOCUS IS AN EFFECT ON `seq`, NOT ON THE MESSAGE. Pressing Guardar twice
 * with the same bad NIF produces the same field and the same sentence both
 * times; only `seq` differs, and without it the second press would move
 * nothing on the screen.
 *
 * THE CONTROL IS FOUND BY QUERY RATHER THAN BY REF, because `children` is
 * arbitrary JSX - an input here, a select there, a static <p> for the
 * one-clinic line - and threading a ref through every call site would put the
 * burden on the fifteen places that must not forget it. The query is scoped to
 * this label, so it cannot reach another field's box.
 */
function Field({
  label,
  required,
  errorFor,
  children,
}: {
  label: string;
  required?: boolean;
  errorFor?: PatientField;
  children: React.ReactNode;
}) {
  const error = useContext(FieldErrorContext);
  const mine = errorFor !== undefined && error?.field === errorFor ? error : null;
  const box = useRef<HTMLLabelElement>(null);
  const seq = mine?.seq ?? 0;

  useEffect(() => {
    if (seq === 0) return;
    box.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }, [seq]);

  return (
    <label ref={box} className="relative flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {mine && (
        <span
          role="alert"
          data-testid={`field-error-${errorFor}`}
          className="absolute left-0 top-full z-10 mt-1 w-full rounded border border-error bg-surface px-2 py-1 text-sm text-error shadow-md"
        >
          {mine.message}
        </span>
      )}
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
