"use client";
import { useActionState, useState } from "react";
import { s, locale } from "@/lib/i18n";
import {
  enumLabel,
  hintOf,
  labelOf,
  topLevelFields,
  widgetOf,
  type FieldSchema,
  type TemplateSchema,
} from "@/lib/clinical/form-template";
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

export function RecordForm({
  schema,
  initialData,
  readOnly,
  saveAction,
}: {
  schema: TemplateSchema;
  initialData: Record<string, unknown>;
  readOnly: boolean;
  saveAction: (prev: SaveState, formData: FormData) => Promise<SaveState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [data, setData] = useState<Record<string, unknown>>(initialData);

  const required = new Set(schema.required ?? []);
  const setField = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="data" value={JSON.stringify(data)} />

      {state.code && !state.ok && (
        <p className="text-sm text-red-700">
          {state.code === "validation" ? s["clinical.validationFailed"]
            : state.code === "finalized" ? s["clinical.finalized"]
            : s["clinical.error"]}
        </p>
      )}
      {state.ok && <p className="text-sm text-green-700">{s["clinical.saved"]}</p>}

      {topLevelFields(schema).map(([key, field]) => {
        const widget = widgetOf(key, field);
        const label = labelOf(field, locale, key);
        const isRequired = required.has(key) || field["x-required"] === true;
        const hint = hintOf(field, locale);
        const err = errors[key];
        return (
          <div key={key} className="space-y-1">
            <label className="block text-sm font-medium">
              {label}
              {isRequired && <span className="text-red-600"> *</span>}
            </label>
            {hint && <p className="text-xs text-neutral-500">{hint}</p>}

            <FieldWidget
              widget={widget}
              field={field}
              value={data[key]}
              readOnly={readOnly}
              onChange={(v) => setField(key, v)}
            />

            {err && <p className="text-xs text-red-700">{s["clinical.required"]}</p>}
          </div>
        );
      })}

      {!readOnly && (
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {s["clinical.save"]}
        </button>
      )}
    </form>
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
  const baseInput = "block w-full rounded border px-2 py-1.5 text-sm disabled:bg-neutral-100";

  switch (widget) {
    case "textarea":
      return (
        <textarea
          rows={3}
          disabled={readOnly}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      );
    case "number":
      return (
        <input
          type="number"
          disabled={readOnly}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={baseInput}
        />
      );
    case "date":
      return (
        <input
          type="date"
          disabled={readOnly}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      );
    case "string_list": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <input
          type="text"
          disabled={readOnly}
          value={arr.join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
          placeholder="A, B, C"
          className={baseInput}
        />
      );
    }
    case "checkbox_group": {
      const obj = asObject(value);
      const props = field.properties ?? {};
      return (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {Object.entries(props).map(([sub, subField]) => {
            const subLabel = labelOf(subField, locale, sub);
            const isText =
              subField["x-widget"] === "text" ||
              (Array.isArray(subField.type) ? subField.type.includes("string") : subField.type === "string");
            if (isText) {
              return (
                <label key={sub} className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-3">
                  <span className="text-xs text-neutral-600">{subLabel}</span>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={asString(obj[sub])}
                    onChange={(e) => onChange({ ...obj, [sub]: e.target.value })}
                    className={baseInput}
                  />
                </label>
              );
            }
            return (
              <label key={sub} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={obj[sub] === true}
                  onChange={(e) => onChange({ ...obj, [sub]: e.target.checked })}
                />
                {subLabel}
              </label>
            );
          })}
        </div>
      );
    }
    case "subfields": {
      const obj = asObject(value);
      const props = field.properties ?? {};
      return (
        <div className="space-y-2 border-l pl-3">
          {Object.entries(props).map(([sub, subField]) => (
            <label key={sub} className="block space-y-1">
              <span className="text-xs text-neutral-600">{labelOf(subField, locale, sub)}</span>
              <textarea
                rows={2}
                disabled={readOnly}
                value={asString(obj[sub])}
                onChange={(e) => onChange({ ...obj, [sub]: e.target.value })}
                className={baseInput}
              />
            </label>
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
        <BodyChart
          markers={asMarkers(value)}
          onChange={(m) => onChange(m)}
          markerOptions={options}
          readOnly={readOnly}
        />
      );
    }
    default:
      return (
        <input
          type="text"
          disabled={readOnly}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      );
  }
}
