"use client";
import { Fragment, useState, type ReactNode } from "react";

/**
 * Tipos de Marcacao: the IVA and Motivo IVA selects of one type.
 *
 * Choosing a rate above 0% (6, 13 or 23) clears the Motivo, because a Motivo
 * goes only with IVA 0% (strategy B10, 2026-11-05). This is an affordance: the
 * server action refuses the pair whatever the screen did (`assertVatReason`).
 * The Motivo select stays enabled, so a stored pair the rule now refuses is
 * still shown and can be corrected by hand.
 *
 * The options and labels come from the server component: `@osteojp/db` is not
 * imported into a client bundle.
 */
export function ServiceTypeVatPair({
  rateName,
  reasonName,
  form,
  rate,
  reason,
  rates,
  reasons,
  rateLabel,
  reasonLabel,
  unsetLabel,
  reasonPlaceholder,
  inputClassName,
  cellClassName,
}: {
  rateName: string;
  reasonName: string;
  form?: string;
  rate: number | null;
  reason: string | null;
  rates: readonly number[];
  reasons: readonly { code: string; label: string }[];
  rateLabel: string;
  reasonLabel: string;
  unsetLabel: string;
  reasonPlaceholder: string;
  inputClassName: string;
  /** Set in the table: each select gets its own cell. Unset in the new-type row. */
  cellClassName?: string;
}) {
  const [reasonValue, setReasonValue] = useState(reason ?? "");
  const cell = (child: ReactNode) => (cellClassName ? <td className={cellClassName}>{child}</td> : child);
  return (
    <Fragment>
      {cell(
        <select
          name={rateName}
          form={form}
          defaultValue={rate === null ? "" : String(rate)}
          onChange={(e) => {
            if (Number(e.target.value) > 0) setReasonValue("");
          }}
          aria-label={rateLabel}
          className={`w-20 ${inputClassName}`}
        >
          {/* Not one of Fisiozero's four: OsteoJP's types start with no rate, and a
              select that showed "0%" for "not set" would claim an exemption nobody
              chose. */}
          <option value="">{unsetLabel}</option>
          {rates.map((r) => (
            <option key={r} value={String(r)}>{`${r}%`}</option>
          ))}
        </select>,
      )}
      {cell(
        <select
          name={reasonName}
          form={form}
          value={reasonValue}
          onChange={(e) => setReasonValue(e.target.value)}
          aria-label={reasonLabel}
          className={`w-44 ${inputClassName}`}
        >
          <option value="">{reasonPlaceholder}</option>
          {reasons.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>,
      )}
    </Fragment>
  );
}
