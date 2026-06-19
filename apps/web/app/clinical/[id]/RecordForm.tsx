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

import { fieldAnchorId } from "./anchors";
import { BodyChart, type Marker } from "./BodyChart";

export type SaveState = { ok: boolean; errors?: Record<string, string>; code?: string };

const initialState: SaveState = { ok: false };

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asMarkers(v: unknown): Marker[] {
  return Array.isArray(v) ? (v as Marker[]) : [];
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
}: {
  schema: TemplateSchema;
  initialData: Record<string, unknown>;
  readOnly: boolean;
  saveAction: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  statusChip: ReactNode;
  extraActions: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [data, setData] = useState<Record<string, unknown>>(initialData);

  const required = new Set(schema.required ?? []);
  const setField = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));
  const errors = state.errors ?? {};

  return (
    <>
    <form id="record-form" action={formAction} className="flex flex-col gap-6 pb-24">
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

      {topLevelFields(schema).map(([key, field]) => {
        const widget = widgetOf(key, field);
        const label = labelOf(field, locale, key);
        const isRequired = required.has(key) || field["x-required"] === true;
        const hint = hintOf(field, locale);
        const err = errors[key] ? s["clinical.required"] : undefined;
        return (
          <div key={key} id={fieldAnchorId(key)} className="scroll-mt-24">
            <Field label={label} required={isRequired} helperText={hint ?? undefined} error={err}>
              <FieldWidget
                widget={widget}
                field={field}
                value={data[key]}
                readOnly={readOnly}
                onChange={(v) => setField(key, v)}
              />
            </Field>
          </div>
        );
      })}

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
}: {
  widget: ReturnType<typeof widgetOf>;
  field: FieldSchema;
  value: unknown;
  readOnly: boolean;
  onChange: (v: unknown) => void;
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
      const obj = asObject(value);
      const props = field.properties ?? {};
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(props).map(([sub, subField]) => {
            const subLabel = labelOf(subField, locale, sub);
            const isText =
              subField["x-widget"] === "text" ||
              (Array.isArray(subField.type) ? subField.type.includes("string") : subField.type === "string");
            if (isText) {
              return (
                <Field key={sub} label={subLabel} className="sm:col-span-2">
                  <Input
                    type="text"
                    disabled={readOnly}
                    value={asString(obj[sub])}
                    onChange={(e) => onChange({ ...obj, [sub]: e.target.value })}
                  />
                </Field>
              );
            }
            return (
              <Checkbox
                key={sub}
                label={subLabel}
                disabled={readOnly}
                checked={obj[sub] === true}
                onChange={(e) => onChange({ ...obj, [sub]: e.target.checked })}
              />
            );
          })}
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
          <BodyChart markers={asMarkers(value)} onChange={(m) => onChange(m)} markerOptions={options} readOnly={readOnly} />
        </Card>
      );
    }
    default:
      return (
        <Input type="text" disabled={readOnly} value={asString(value)} onChange={(e) => onChange(e.target.value)} />
      );
  }
}
