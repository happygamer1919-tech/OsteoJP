"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { createPatient, updatePatient } from "../../../lib/patients/actions";
import type { Patient } from "../../../lib/patients/types";

const s = getStrings(DEFAULT_LOCALE);

type Fields = {
  fullName: string;
  dateOfBirth: string;
  sex: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
};

function toFields(p?: Patient | null): Fields {
  return {
    fullName: p?.fullName ?? "",
    dateOfBirth: p?.dateOfBirth ?? "",
    sex: p?.sex ?? "",
    nif: p?.nif ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    address: p?.address ?? "",
    postalCode: p?.postalCode ?? "",
    city: p?.city ?? "",
    notes: p?.notes ?? "",
  };
}

export function PatientForm({ patient }: { patient?: Patient | null }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(() => toFields(patient));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(patient);

  function set<K extends keyof Fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const saved =
          isEdit && patient
            ? await updatePatient(patient.id, fields)
            : await createPatient(fields);
        router.push(`/patients/${saved.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
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
            <option value="other">{s["patients.sexOther"]}</option>
          </select>
        </Field>
        <Field label={s["patients.fieldNif"]}>
          <input
            value={fields.nif}
            onChange={(e) => set("nif", e.target.value)}
            className={inputCls}
          />
        </Field>
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
      </div>
      <Field label={s["patients.fieldAddress"]}>
        <input
          value={fields.address}
          onChange={(e) => set("address", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label={s["patients.fieldNotes"]}>
        <textarea
          rows={3}
          value={fields.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={inputCls}
        />
      </Field>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand-teal px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
        >
          {pending
            ? s["patients.saving"]
            : isEdit
              ? s["common.save"]
              : s["patients.create"]}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-border-strong px-4 py-2 text-sm"
        >
          {s["common.cancel"]}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded border border-border-strong px-3 py-2 text-sm outline-none focus:border-brand-teal";

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
