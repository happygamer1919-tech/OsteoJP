"use client";

import { Banner, Button, Drawer, Field, Input, Select, TimeField, ToastProvider, useToast } from "@osteojp/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AvailabilityPanel } from "@/app/agenda/availability-panel";
import { ConflictBanner } from "@/app/agenda/conflict-banner";
import { s } from "@/lib/i18n";
import { runAction } from "@/lib/actions/run-action";
import { useActionOwner } from "@/lib/actions/use-action-owner";
import { useLatestCallback } from "@/lib/actions/use-latest-callback";
import { bulkRescheduleAppointments } from "@/lib/scheduling/actions";
import {
  BULK_MAX_ROWS,
  type BulkChange,
  type BulkRequest,
  type BulkResult,
  type BulkRowResult,
  type BulkSide,
} from "@/lib/scheduling/bulk-reschedule-core";
import {
  listBulkRescheduleCandidatesAction,
  type BulkCandidate,
} from "@/lib/scheduling/bulk-reschedule-read-actions";
import { appointmentRefusalMessage } from "@/lib/scheduling/refusal-message";
import { formatTimeOfDay, lisbonParts } from "@/lib/scheduling/time";
import type { AgendaOptions } from "@/lib/scheduling/types";

/**
 * APPT-BULK-01 - "Alterar várias marcações" on the ficha's Marcações tab.
 *
 * Owner, admin and reception only (the page hands this nothing for anyone
 * else, and `bulkRescheduleAppointments` refuses them on the server). Three
 * steps in one panel:
 *   1. choose: tick future Agendada/Confirmada visits (quick picks: one
 *      therapist's, one lote's), then what changes;
 *   2. preview: every ticked visit, old to new, with the server's verdict.
 *      Nothing is saved. A refused visit can get another hour from the
 *      availability panel (the agenda's own, fed by getTherapistDayAvailability),
 *      and one of the three overridable conflicts can be passed by an explicit
 *      tick on that visit only;
 *   3. result: what was saved and what was left as it was.
 */
export function BulkChangeButton({ patientId, options }: { patientId: string; options: AgendaOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="bulk-change-open">
          {s["ficha.bulk.open"]}
        </Button>
      </div>
      {open && <BulkChangePanel patientId={patientId} options={options} onClose={() => setOpen(false)} />}
    </ToastProvider>
  );
}

const DURATIONS = [30, 45, 60, 90];
const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), template);

type Choice = {
  practitionerId: string;
  locationId: string;
  timeOn: boolean;
  time: string;
  shiftDays: string;
  durationMin: string;
};

const EMPTY_CHOICE: Choice = { practitionerId: "", locationId: "", timeOn: false, time: "09:00", shiftDays: "", durationMin: "" };

/** The change the server receives: only what she set. */
export function changeOf(c: Choice): BulkChange {
  const shift = c.shiftDays.trim() === "" ? null : Number(c.shiftDays);
  return {
    ...(c.practitionerId ? { practitionerId: c.practitionerId } : {}),
    ...(c.locationId ? { locationId: c.locationId } : {}),
    ...(c.timeOn && c.time ? { time: c.time } : {}),
    ...(shift !== null && Number.isFinite(shift) && shift !== 0 ? { shiftDays: Math.trunc(shift) } : {}),
    ...(c.durationMin ? { durationMin: Number(c.durationMin) } : {}),
  };
}

function BulkChangePanel({
  patientId,
  options,
  onClose,
}: {
  patientId: string;
  options: AgendaOptions;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const owner = useActionOwner();

  const [candidates, setCandidates] = useState<BulkCandidate[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Choice>(EMPTY_CHOICE);
  const [phase, setPhase] = useState<"choose" | "preview" | "result">("choose");
  const [preview, setPreview] = useState<BulkResult | null>(null);
  const [stale, setStale] = useState(false);
  const [rowTime, setRowTime] = useState<Record<string, string>>({});
  const [rowOverride, setRowOverride] = useState<Record<string, boolean>>({});
  // The start of each visit as the LAST preview read it. Every preview reads
  // the candidates again, so "Pré-visualizar de novo" really does see a visit
  // moved since; the save then names these starts, so a retried save finds
  // its own work done instead of moving the visits again.
  const [seenStarts, setSeenStarts] = useState<Record<string, string>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The candidates, read once when the panel opens. Only the async callback
  // sets state, as AvailabilityPanel does.
  useEffect(() => {
    let cancelled = false;
    function load() {
      void runAction(() => listBulkRescheduleCandidatesAction(patientId), {
        kind: "read",
        retry: () => {
          if (!cancelled) load();
        },
      }).then((out) => {
        if (cancelled) return;
        if (out.failed || !out.value.ok) {
          setLoadError(true);
          return;
        }
        setLoadError(false);
        setCandidates(out.value.data);
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of [...(options.allTherapists ?? []), ...options.therapists, ...(options.sharedResources ?? [])]) {
      m.set(o.id, o.label);
    }
    for (const c of candidates ?? []) m.set(c.practitionerId, c.practitionerName);
    return m;
  }, [options, candidates]);
  const clinics = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of [...options.locations, ...options.bookableLocations]) m.set(o.id, o.label);
    for (const c of candidates ?? []) m.set(c.locationId, c.locationName);
    return m;
  }, [options, candidates]);

  const therapistChoices = options.allTherapists ?? options.therapists;
  const shown = (candidates ?? []).slice(0, BULK_MAX_ROWS);
  const tooMany = (candidates ?? []).length > BULK_MAX_ROWS;
  const therapistsInList = [...new Map(shown.map((c) => [c.practitionerId, c.practitionerName])).entries()];
  const batches = useMemo(() => {
    const m = new Map<string, BulkCandidate[]>();
    for (const c of shown) if (c.batchId) m.set(c.batchId, [...(m.get(c.batchId) ?? []), c]);
    return [...m.entries()];
  }, [shown]);

  const change = changeOf(choice);
  const hasChange = Object.keys(change).length > 0;

  function touch() {
    if (phase === "preview") setStale(true);
  }

  /**
   * `fresh`: a preview started from the choice step forgets the hours picked
   * and the ticks made in an earlier preview, which described another choice.
   */
  function request(mode: "preview" | "apply", fresh = false, starts: Record<string, string> = seenStarts): BulkRequest {
    const times = fresh ? {} : rowTime;
    // The tick reaches the server only for a row whose LATEST preview verdict
    // is an overridable conflict: a tick left from an earlier preview never
    // passes a conflict she has not seen.
    const conflicting = new Set(
      fresh || !preview ? [] : preview.rows.filter((r) => r.verdict.kind === "conflict").map((r) => r.id),
    );
    return {
      patientId,
      mode,
      change,
      rows: shown
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          id: c.id,
          // The start she saw: a row that moved since is left alone, so a save
          // retried after a lost answer cannot shift the visits twice.
          expectedStartsAt: starts[c.id] ?? c.startsAt,
          ...(times[c.id] ? { time: times[c.id] } : {}),
          ...(mode === "apply" && rowOverride[c.id] && conflicting.has(c.id) ? { allowConflict: true } : {}),
        })),
    };
  }

  const retryPreview = useLatestCallback(() => void runPreview(phase === "choose"));
  async function runPreview(fresh: boolean) {
    setError(null);
    if (selected.size === 0 || !hasChange) {
      setError(s["ficha.bulk.needChange"]);
      return;
    }
    setBusy(true);
    try {
      // Read the visits again: a preview always plans from where they are now.
      const listed = await runAction(() => listBulkRescheduleCandidatesAction(patientId), {
        kind: "read",
        retry: retryPreview,
        owner,
      });
      if (listed.failed) return;
      if (!listed.value.ok) {
        setError(s["ficha.bulk.loadError"]);
        return;
      }
      setCandidates(listed.value.data);
      const starts = Object.fromEntries(listed.value.data.map((c) => [c.id, c.startsAt]));
      setSeenStarts(starts);
      const body = request("preview", fresh, starts);
      if (fresh) {
        setRowTime({});
        setRowOverride({});
      }
      const out = await runAction(() => bulkRescheduleAppointments(body), {
        kind: "read",
        retry: retryPreview,
        owner,
      });
      if (out.failed) return;
      if (!out.value.ok) {
        setError(appointmentRefusalMessage(out.value));
        return;
      }
      setPreview(out.value.data);
      setStale(false);
      setPickFor(null);
      setPhase("preview");
    } finally {
      setBusy(false);
    }
  }

  const retryApply = useLatestCallback(() => void runApply());
  async function runApply() {
    setError(null);
    setBusy(true);
    try {
      const out = await runAction(() => bulkRescheduleAppointments(request("apply")), {
        kind: "write",
        retry: retryApply,
        owner,
      });
      if (out.failed) return;
      if (!out.value.ok) {
        setError(appointmentRefusalMessage(out.value));
        return;
      }
      setResult(out.value.data);
      setPhase("result");
      if (out.value.data.okCount > 0) {
        toast({ tone: "success", message: fill(s["ficha.bulk.saved"], { count: out.value.data.okCount }) });
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const willSave = preview
    ? preview.rows.filter((r) => r.verdict.kind === "ok" || (r.verdict.kind === "conflict" && rowOverride[r.id])).length
    : 0;

  const confirm =
    phase === "choose"
      ? { label: s["ficha.bulk.preview"], onConfirm: () => void runPreview(true), disabled: selected.size === 0 || !hasChange }
      : phase === "preview"
        ? stale
          ? { label: s["ficha.bulk.previewAgain"], onConfirm: () => void runPreview(false), disabled: false }
          : { label: fill(s["ficha.bulk.apply"], { count: willSave }), onConfirm: () => void runApply(), disabled: willSave === 0 }
        : { label: s["common.close"], onConfirm: onClose, disabled: false };

  const label = (side: BulkSide | null) => {
    if (!side) return "";
    const start = new Date(side.startsAt);
    return [
      `${dateFmt.format(start)} · ${formatTimeOfDay(start)}-${formatTimeOfDay(new Date(side.endsAt))}`,
      names.get(side.practitionerId) ?? "",
      clinics.get(side.locationId) ?? "",
    ]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <Drawer
      open
      onClose={() => {
        if (phase === "result") router.refresh();
        onClose();
      }}
      title={s["ficha.bulk.open"]}
      closeLabel={s["common.close"]}
      cancelLabel={phase === "result" ? s["common.close"] : s["common.cancel"]}
      confirmLabel={confirm.label}
      confirmLoading={busy}
      confirmDisabled={confirm.disabled || busy}
      onConfirm={confirm.onConfirm}
    >
      <div className="flex flex-col gap-4" data-testid="bulk-change-panel">
        {phase === "choose" && (
          <>
            <p className="text-sm text-text-secondary">{s["ficha.bulk.intro"]}</p>
            {candidates === null && !loadError && <p className="text-sm text-text-secondary">{s["ficha.bulk.loading"]}</p>}
            {loadError && (
              <p role="alert" className="text-sm text-error">
                {s["ficha.bulk.loadError"]}
              </p>
            )}
            {candidates !== null && shown.length === 0 && (
              <p className="text-sm text-text-secondary">{s["ficha.bulk.none"]}</p>
            )}
            {shown.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium text-text-primary">{s["ficha.bulk.listLegend"]}</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set(shown.map((c) => c.id)))}>
                    {s["ficha.bulk.selectAll"]}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    {s["ficha.bulk.selectNone"]}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    aria-label={s["ficha.bulk.sameTherapist"]}
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) setSelected(new Set(shown.filter((c) => c.practitionerId === id).map((c) => c.id)));
                    }}
                  >
                    <option value="">{s["ficha.bulk.sameTherapist"]}</option>
                    {therapistsInList.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  {batches.length > 0 && (
                    <Select
                      aria-label={s["ficha.bulk.sameBatch"]}
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) setSelected(new Set(shown.filter((c) => c.batchId === id).map((c) => c.id)));
                      }}
                    >
                      <option value="">{s["ficha.bulk.sameBatch"]}</option>
                      {batches.map(([id, rows]) => (
                        <option key={id} value={id}>
                          {fill(s["ficha.bulk.batchLabel"], {
                            date: dateFmt.format(new Date(rows[0]!.startsAt)),
                            count: rows.length,
                          })}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                {tooMany && <p className="text-xs text-text-secondary">{fill(s["ficha.bulk.tooMany"], { max: BULK_MAX_ROWS })}</p>}
                <ul className="flex flex-col gap-1">
                  {shown.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-start gap-2 text-sm text-text-primary" data-testid="bulk-candidate" data-appointment-id={c.id}>
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(c.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            setSelected(next);
                          }}
                        />
                        <span>{label({ startsAt: c.startsAt, endsAt: c.endsAt, practitionerId: c.practitionerId, locationId: c.locationId })}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-secondary" data-testid="bulk-selected-count">
                  {fill(s["ficha.bulk.selectedCount"], { count: selected.size })}
                </p>
              </fieldset>
            )}

            {shown.length > 0 && (
              <fieldset className="flex flex-col gap-3">
                <legend className="text-xs font-medium text-text-primary">{s["ficha.bulk.changesLegend"]}</legend>
                <Field label={s["ficha.bulk.newTherapist"]}>
                  <Select
                    value={choice.practitionerId}
                    onChange={(e) => setChoice({ ...choice, practitionerId: e.target.value })}
                  >
                    <option value="">{s["ficha.bulk.keep"]}</option>
                    {therapistChoices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={s["ficha.bulk.newClinic"]}>
                  <Select value={choice.locationId} onChange={(e) => setChoice({ ...choice, locationId: e.target.value })}>
                    <option value="">{s["ficha.bulk.keep"]}</option>
                    {options.bookableLocations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={choice.timeOn}
                    onChange={(e) => setChoice({ ...choice, timeOn: e.target.checked })}
                    data-testid="bulk-change-time"
                  />
                  {s["ficha.bulk.changeTime"]}
                </label>
                {choice.timeOn && (
                  <Field label={s["ficha.bulk.newTime"]}>
                    <TimeField value={choice.time} onChange={(v) => setChoice({ ...choice, time: v })} />
                  </Field>
                )}
                <Field label={s["ficha.bulk.shiftDays"]}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={choice.shiftDays}
                    onChange={(e) => setChoice({ ...choice, shiftDays: e.target.value })}
                  />
                </Field>
                <p className="-mt-2 text-xs text-text-secondary">{s["ficha.bulk.shiftHelp"]}</p>
                <Field label={s["ficha.bulk.newDuration"]}>
                  <Select value={choice.durationMin} onChange={(e) => setChoice({ ...choice, durationMin: e.target.value })}>
                    <option value="">{s["ficha.bulk.keep"]}</option>
                    {DURATIONS.map((d) => (
                      <option key={d} value={String(d)}>
                        {fill(s["ficha.bulk.minutes"], { n: d })}
                      </option>
                    ))}
                  </Select>
                </Field>
              </fieldset>
            )}
          </>
        )}

        {phase === "preview" && preview && (
          <>
            <p className="text-sm text-text-secondary">{s["ficha.bulk.previewIntro"]}</p>
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPhase("choose");
                  setError(null);
                }}
              >
                {s["ficha.bulk.back"]}
              </Button>
            </div>
            {stale && <Banner tone="info">{s["ficha.bulk.stale"]}</Banner>}
            <ul className="flex flex-col gap-3">
              {preview.rows.map((r) => (
                <PreviewRow
                  key={r.id}
                  row={r}
                  label={label}
                  pickedTime={rowTime[r.id] ?? null}
                  override={!!rowOverride[r.id]}
                  onOverride={(v) => setRowOverride({ ...rowOverride, [r.id]: v })}
                  picking={pickFor === r.id}
                  onTogglePick={() => setPickFor(pickFor === r.id ? null : r.id)}
                  onPickTime={(t) => {
                    setRowTime({ ...rowTime, [r.id]: t });
                    touch();
                  }}
                />
              ))}
            </ul>
          </>
        )}

        {phase === "result" && result && (
          <>
            <h3 className="text-sm font-medium text-text-primary">{s["ficha.bulk.resultTitle"]}</h3>
            <p className="text-sm text-text-primary" data-testid="bulk-result-saved">
              {fill(s["ficha.bulk.saved"], { count: result.okCount })}
            </p>
            {result.alreadySavedCount > 0 && (
              <p className="text-sm text-text-primary" data-testid="bulk-result-already">
                {fill(s["ficha.bulk.alreadySaved"], { count: result.alreadySavedCount })}
              </p>
            )}
            {result.skippedCount > 0 && (
              <p className="text-sm text-text-primary" data-testid="bulk-result-skipped">
                {fill(s["ficha.bulk.skipped"], { count: result.skippedCount })}
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {result.rows.map((r) => (
                <li key={r.id} className="text-sm" data-testid="bulk-result-row" data-applied={r.applied ? "true" : "false"}>
                  <span className="font-medium">
                    {r.applied || r.verdict.kind === "already_saved" ? s["ficha.bulk.applied"] : s["ficha.bulk.notApplied"]}
                  </span>
                  {": "}
                  {label(r.applied || r.verdict.kind === "already_saved" ? r.after : r.before)}
                  {!r.applied && <span className="block text-text-secondary">{verdictText(r)}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}

/** The sentence for one row's verdict, from the agenda's own refusal sentences. */
function verdictText(r: BulkRowResult): string {
  switch (r.verdict.kind) {
    case "ok":
      return s["ficha.bulk.verdictOk"];
    case "unchanged":
      return s["ficha.bulk.verdictUnchanged"];
    case "not_eligible":
      return s["ficha.bulk.verdictNotEligible"];
    case "changed":
      return s["ficha.bulk.verdictChanged"];
    case "already_saved":
      return s["ficha.bulk.verdictAlreadySaved"];
    case "past":
      return s["ficha.bulk.verdictPast"];
    case "overlap":
      return s["ficha.bulk.verdictOverlap"].split("{time}").join(formatTimeOfDay(new Date(r.verdict.with.startsAt)));
    case "conflict":
      return s["agenda.conflict"];
    case "refused":
      return appointmentRefusalMessage(r.verdict);
  }
}

function PreviewRow({
  row,
  label,
  pickedTime,
  override,
  onOverride,
  picking,
  onTogglePick,
  onPickTime,
}: {
  row: BulkRowResult;
  label: (side: BulkSide | null) => string;
  pickedTime: string | null;
  override: boolean;
  onOverride: (v: boolean) => void;
  picking: boolean;
  onTogglePick: () => void;
  onPickTime: (hhmm: string) => void;
}) {
  const v = row.verdict;
  const fixable = (v.kind === "conflict" || v.kind === "refused" || v.kind === "overlap") && row.after !== null;
  const after = row.after;
  const afterStart = after ? new Date(after.startsAt) : null;
  const minutes = after ? Math.round((new Date(after.endsAt).getTime() - new Date(after.startsAt).getTime()) / 60_000) : 0;
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      data-testid="bulk-preview-row"
      data-appointment-id={row.id}
      data-verdict={v.kind}
    >
      <span className="text-sm text-text-secondary">{label(row.before)}</span>
      {after && v.kind !== "unchanged" && v.kind !== "not_eligible" && v.kind !== "changed" && v.kind !== "already_saved" && (
        <span className="text-sm font-medium text-text-primary">{`→ ${label(after)}`}</span>
      )}
      {v.kind === "ok" && <span className="text-sm text-success">{s["ficha.bulk.verdictOk"]}</span>}
      {v.kind === "unchanged" && <span className="text-sm text-text-secondary">{s["ficha.bulk.verdictUnchanged"]}</span>}
      {(v.kind === "not_eligible" ||
        v.kind === "changed" ||
        v.kind === "already_saved" ||
        v.kind === "past" ||
        v.kind === "overlap") && (
        <span className="text-sm text-text-secondary">{verdictText(row)}</span>
      )}
      {v.kind === "conflict" && (
        <>
          <ConflictBanner conflicts={v.conflicts} />
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={override} onChange={(e) => onOverride(e.target.checked)} data-testid="bulk-override" />
            {s["ficha.bulk.override"]}
          </label>
        </>
      )}
      {v.kind === "refused" && (
        <p role="alert" className="text-sm text-error">
          {appointmentRefusalMessage(v)}
          {v.error === "outside_availability" && (
            <>
              {" "}
              <Link href="/horarios" className="underline">
                {s["ficha.bulk.horarios"]}
              </Link>
            </>
          )}
        </p>
      )}
      {fixable && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onTogglePick} data-testid="bulk-pick-time">
              {s["ficha.bulk.pickTime"]}
            </Button>
            {pickedTime && (
              <span className="text-sm text-text-primary">{s["ficha.bulk.pickedTime"].split("{time}").join(pickedTime)}</span>
            )}
          </div>
          {picking && after && afterStart && (
            <AvailabilityPanel
              therapistId={after.practitionerId}
              date={lisbonParts(afterStart).date}
              locationId={after.locationId}
              durationMin={minutes}
              time={pickedTime ?? formatTimeOfDay(afterStart)}
              onPickTime={onPickTime}
            />
          )}
        </div>
      )}
    </li>
  );
}
