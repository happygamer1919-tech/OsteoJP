"use client";
import { Button, Card, Checkbox, Field, Input, Textarea } from "@osteojp/ui";
import { Lock } from "lucide-react";
import { type ReactNode, useActionState, useState } from "react";

import {
  enumLabel,
  hintOf,
  labelOf,
  topLevelFields,
  widgetOf,
  type FieldSchema,
  type TemplateSchema,
} from "@/lib/clinical/form-template";
import { s, locale } from "@/lib/i18n";

import {
  readConsentState,
  writeConsentState,
  type ConsentDecision,
  type ConsentItemKey,
} from "@/lib/clinical/consent";

import { fieldAnchorId } from "./anchors";
import { HIDDEN_FIELD_KEYS, sectionLabel } from "./field-display";
import { BodyChart, type Marker } from "./BodyChart";
import { MobilidadeChart, type MobilidadeValue } from "./MobilidadeChart";
import { SignatureConsent } from "./SignatureConsent";

export type SaveState = { ok: boolean; errors?: Record<string, string>; code?: string };

const initialState: SaveState = { ok: false };

/**
 * SPEC-ficha-medica.md sec 5.1 header row. These fields render as ONE compact
 * grid row (not stacked full-width) so `weight_kg` (Peso) and `height_cm`
 * (Altura) sit ADJACENT with nothing between them. Only the contiguous leading
 * run of these keys, in template order, is grouped; anything else falls through
 * to the normal one-field-per-row layout.
 */
const HEADER_ROW_KEYS = ["weight_kg", "height_cm", "linked_appointment"];

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asMarkers(v: unknown): Marker[] {
  return Array.isArray(v) ? (v as Marker[]) : [];
}
function asMobilidade(v: unknown): MobilidadeValue {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as MobilidadeValue) : {};
}

/**
 * Clinical record form (SPEC-staff-screens §7), restyled with packages/ui Field
 * components. Each top-level field is a rail anchor; the bodychart keeps its
 * existing manual component inside a Card (container restyle only). A sticky
 * status bar carries the record_status chip + the save / sign / version actions;
 * locked & signed records render every input disabled with a Lock + no Gravar.
 *
 * Deferred per rule #1 (data not exposed by the record/schema): the AI-prefill
 * caption (no ai_extractable field metadata), the autosave timestamp (the form
 * saves manually, there is no autosave), and the ai_review_state review banner
 * (the record detail query does not return it).
 */
export function RecordForm({
  schema,
  initialData,
  readOnly,
  saveAction,
  statusChip,
  extraActions,
  patientSex,
  patientId,
  recordId,
}: {
  schema: TemplateSchema;
  initialData: Record<string, unknown>;
  readOnly: boolean;
  saveAction: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  statusChip: ReactNode;
  extraActions: ReactNode;
  patientSex?: string | null;
  patientId: string;
  recordId: string;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  // Ruling B: no episode_date prefill/seed here — the field has no input and is
  // stamped from created_at server-side on save. Existing values in `data` (from
  // a prior save) round-trip unchanged through the hidden `data` field.
  const [data, setData] = useState<Record<string, unknown>>(initialData);

  const required = new Set(schema.required ?? []);
  const setField = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));
  const errors = state.errors ?? {};

  // SPEC sec 5.14 / 7.3: the Consinto block persists MIGRATION-FREE inside the
  // record `data` under the reserved `_consent` key. Read the current decisions
  // from `data` and fold updates back in — they save with the ficha through the
  // one hidden `data` field, no separate action/table. The per-item update
  // recomputes the block from the FRESH `d` inside the functional updater so two
  // toggles in one render batch never clobber a sibling (stale-snapshot safe).
  const consent = readConsentState(data);
  const setDecision = (key: ConsentItemKey, decision: ConsentDecision) =>
    setData((d) => writeConsentState(d, { ...readConsentState(d), [key]: decision }));

  return (
    <>
    <form id="record-form" action={formAction} className="flex min-w-0 flex-col gap-6 pb-24">
      <input type="hidden" name="data" value={JSON.stringify(data)} />

      {state.code && !state.ok && (
        <p role="alert" className="text-sm text-error">
          {state.code === "validation"
            ? s["clinical.validationFailed"]
            : state.code === "finalized"
              ? s["clinical.finalized"]
              : s["clinical.error"]}
        </p>
      )}
      {state.ok && <p role="status" className="text-sm text-success">{s["clinical.saved"]}</p>}

      {(() => {
        const fields = topLevelFields(schema).filter(([key]) => !HIDDEN_FIELD_KEYS.has(key));
        // SPEC sec 5.1: the leading contiguous run of header-row keys renders as
        // one grid row (Peso/Altura adjacent). Everything after keeps the normal
        // one-field-per-row layout. Each field stays its own rail anchor.
        let headerRunEnd = 0;
        while (
          headerRunEnd < fields.length &&
          HEADER_ROW_KEYS.includes(fields[headerRunEnd]![0])
        ) {
          headerRunEnd++;
        }
        const headerFields = fields.slice(0, headerRunEnd);
        const restFields = fields.slice(headerRunEnd);

        const renderField = ([key, field]: (typeof fields)[number]) => {
          const widget = widgetOf(key, field);
          const label = sectionLabel(field, locale, key);
          const isRequired = required.has(key) || field["x-required"] === true;
          const hint = hintOf(field, locale);
          const err = errors[key] ? s["clinical.required"] : undefined;
          return (
            <div key={key} id={fieldAnchorId(key)} className="scroll-mt-24 min-w-0">
              <Field label={label} required={isRequired} helperText={hint ?? undefined} error={err}>
                <FieldWidget
                  widget={widget}
                  field={field}
                  value={data[key]}
                  readOnly={readOnly}
                  onChange={(v) => setField(key, v)}
                  patientSex={patientSex}
                />
              </Field>
            </div>
          );
        };

        return (
          <>
            {headerFields.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {headerFields.map(renderField)}
              </div>
            )}
            {restFields.map(renderField)}
          </>
        );
      })()}

      {/* SPEC sec 5.14 / 7: signature + Gerar PDF + Consinto block, after the
          ficha body (5.13 observations). Read-only on finalized records. */}
      <SignatureConsent
        patientId={patientId}
        recordId={recordId}
        readOnly={readOnly}
        consent={consent}
        onSetDecision={setDecision}
      />

    </form>

      {/* Sticky status bar — OUTSIDE the form so the sign/version forms in
          extraActions are not nested inside the record form. Gravar submits the
          record form via the `form` attribute. */}
      <div className="sticky bottom-0 -mx-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          {readOnly && <Lock size={16} strokeWidth={1.75} aria-hidden="true" className="text-text-secondary" />}
          {statusChip}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          {!readOnly && (
            <Button type="submit" form="record-form" loading={pending}>
              {s["clinical.save"]}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function FieldWidget({
  widget,
  field,
  value,
  readOnly,
  onChange,
  patientSex,
}: {
  widget: ReturnType<typeof widgetOf>;
  field: FieldSchema;
  value: unknown;
  readOnly: boolean;
  onChange: (v: unknown) => void;
  patientSex?: string | null;
}) {
  switch (widget) {
    case "textarea":
      return (
        <Textarea
          rows={3}
          disabled={readOnly}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          disabled={readOnly}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "date":
      return (
        <Input type="date" disabled={readOnly} value={asString(value)} onChange={(e) => onChange(e.target.value)} />
      );
    case "string_list": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Input
          type="text"
          disabled={readOnly}
          value={arr.join(", ")}
          onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
          placeholder={s["clinical.stringListPlaceholder"]}
        />
      );
    }
    case "checkbox_group": {
      // SPEC-ficha-medica.md AMENDMENTS ruling F (Wave 05 Ficha Final): render the
      // Outros section as the legacy 4-column x 5-row grid — strict 4-up on desktop,
      // 2-up collapse, with NO intermediate 3-column step so the legacy left-to-right
      // top-to-bottom reading order is exact. The nineteen boolean checkboxes render
      // in seed property order; the single free-text sub-field ("other") renders
      // INLINE as the final (20th) grid cell — one cell wide, no visible label
      // (aria-label preserved), placeholder "Outras..." — superseding ruling C's
      // separate below-grid block. Presentation only: read/write against each
      // sub-key is unchanged, so the stored `health_problems` keys before == after
      // (nineteen booleans + `other`).
      const obj = asObject(value);
      const props = field.properties ?? {};
      const isTextSub = (subField: FieldSchema): boolean =>
        subField["x-widget"] === "text" ||
        (Array.isArray(subField.type)
          ? subField.type.includes("string")
          : subField.type === "string");
      const entries = Object.entries(props);
      const checkboxEntries = entries.filter(([, f]) => !isTextSub(f));
      const textEntries = entries.filter(([, f]) => isTextSub(f));
      return (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {checkboxEntries.map(([sub, subField]) => (
            <div key={sub} className="min-w-0">
              <Checkbox
                label={labelOf(subField, locale, sub)}
                disabled={readOnly}
                className="w-full"
                checked={obj[sub] === true}
                onChange={(e) => onChange({ ...obj, [sub]: e.target.checked })}
              />
            </div>
          ))}
          {textEntries.map(([sub, subField]) => (
            // Ruling F: the free-text sub-field is the 20th grid cell — same cell
            // width as a checkbox, NO visible label (aria-label preserves the
            // accessible name), placeholder "Outras...". `other` is the sole text
            // sub-field (recon). Read/write against `obj.other` is unchanged.
            <div key={sub} className="min-w-0">
              <Input
                type="text"
                disabled={readOnly}
                className="w-full"
                aria-label={labelOf(subField, locale, sub)}
                placeholder={sub === "other" ? s["clinical.healthProblemsOtherPlaceholder"] : undefined}
                value={asString(obj[sub])}
                onChange={(e) => onChange({ ...obj, [sub]: e.target.value })}
              />
            </div>
          ))}
        </div>
      );
    }
    case "subfields": {
      const obj = asObject(value);
      const props = field.properties ?? {};
      return (
        <div className="flex flex-col gap-3 border-l border-border pl-3">
          {Object.entries(props).map(([sub, subField]) => (
            <Field key={sub} label={labelOf(subField, locale, sub)}>
              <Textarea
                rows={2}
                disabled={readOnly}
                value={asString(obj[sub])}
                onChange={(e) => onChange({ ...obj, [sub]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      );
    }
    case "bodychart": {
      const markerField = field.items?.properties?.["marker_type"];
      const options = (markerField?.enum ?? [])
        .filter((v): v is string => typeof v === "string")
        .map((v) => ({ value: v, label: markerField ? enumLabel(markerField, v, locale) : v }));
      return (
        <Card>
          <BodyChart markers={asMarkers(value)} onChange={(m) => onChange(m)} markerOptions={options} readOnly={readOnly} sex={patientSex} />
        </Card>
      );
    }
    case "mobilidade":
      return (
        <Card>
          <MobilidadeChart value={asMobilidade(value)} onChange={(v) => onChange(v)} readOnly={readOnly} />
        </Card>
      );
    default:
      return (
        <Input type="text" disabled={readOnly} value={asString(value)} onChange={(e) => onChange(e.target.value)} />
      );
  }
}
