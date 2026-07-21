"use client";
import { Banner, Button, Card, Checkbox, Field, Input, Textarea } from "@osteojp/ui";
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
 * FF2-A grouped rows (SPEC-ficha-medica.md AMENDMENT 2026-07-12). Any contiguous
 * run of top-level fields (in template order) that exactly matches a group's keys
 * renders as ONE row instead of the default one-field-per-row layout. Each field
 * still keeps its own rail anchor. `linked_appointment` was removed by FF2-B, so
 * the Peso/Altura group no longer carries it.
 *   - Position 1: Peso (weight_kg) + Altura (height_cm) as a thin card directly
 *     under the Paciente card, nothing else on it.
 *   - Position 2: Alertas (red_flags) + Códigos CID (cid_codes) as one row.
 */
const ROW_GROUPS: { keys: string[]; testid: string; card: boolean }[] = [
  { keys: ["weight_kg", "height_cm"], testid: "ficha-peso-altura-card", card: true },
  { keys: ["red_flags", "cid_codes"], testid: "ficha-alertas-cid-row", card: false },
];

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

        // W10-02b Defect 2 (Q-W10-02b-1, render-flow default; NO template/x-order/
        // schema change): when a red flag (`red_flags`) is noted, surface the
        // REQUIRED `consultation_reason` field IMMEDIATELY at that moment via an
        // inline anchored prompt below the Alertas row - it reveals + scrolls to +
        // focuses the SINGLE existing field (never a second bound input). Shown only
        // while a red flag is present and the required reason is still empty, so it
        // clears itself once the reason is filled.
        const redFlagsFilled = asString(data["red_flags"]).trim().length > 0;
        const hasConsultationReason = fields.some(([k]) => k === "consultation_reason");
        const consultationReasonEmpty = asString(data["consultation_reason"]).trim().length === 0;
        const showRedFlagPrompt = redFlagsFilled && hasConsultationReason && consultationReasonEmpty;
        const redFlagPrompt: ReactNode = showRedFlagPrompt ? (
          <div
            key="red-flag-consultation-prompt"
            data-testid="red-flag-consultation-prompt"
            className="scroll-mt-24"
          >
            <Banner
              tone="warning"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const el = document.getElementById(fieldAnchorId("consultation_reason"));
                    if (!el) return;
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.querySelector("textarea")?.focus({ preventScroll: true });
                  }}
                >
                  {s["clinical.redFlagPromptAction"]}
                </Button>
              }
            >
              {s["clinical.redFlagPromptText"]}
            </Banner>
          </div>
        ) : null;

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

        // FF2-A: walk fields in template (= v4) order; collapse any contiguous run
        // that exactly matches a ROW_GROUP into one grid row (each field keeps its
        // rail anchor); everything else renders one field per row, top-to-bottom.
        const out: ReactNode[] = [];
        let i = 0;
        while (i < fields.length) {
          const grp = ROW_GROUPS.find(
            (g) =>
              i + g.keys.length <= fields.length &&
              g.keys.every((k, j) => fields[i + j]![0] === k),
          );
          if (grp) {
            const items = fields.slice(i, i + grp.keys.length);
            out.push(
              <div
                key={`grp-${grp.testid}`}
                data-testid={grp.testid}
                className={
                  grp.card
                    ? "grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"
                    : "grid grid-cols-1 gap-4 sm:grid-cols-2"
                }
              >
                {items.map(renderField)}
              </div>,
            );
            if (redFlagPrompt && grp.keys.includes("red_flags")) out.push(redFlagPrompt);
            i += grp.keys.length;
          } else {
            const [key] = fields[i]!;
            out.push(renderField(fields[i]!));
            if (redFlagPrompt && key === "red_flags") out.push(redFlagPrompt);
            i++;
          }
        }
        return <>{out}</>;
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
