"use client";

import {
  Banner,
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Dialog,
  Drawer,
  Field,
  Input,
  Select,
  StatusChip,
  Textarea,
  TimeField,
  useToast,
  type ComboboxOption,
} from "@osteojp/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@osteojp/auth";

import { s } from "@/lib/i18n";
import { isTherapistSelfLocked, shouldPreselectPrimaryService } from "@/lib/scheduling/self-lock-core";
import { patientLabel } from "@/lib/scheduling/patient-label";
import { getPatientContraindications, searchPatientsAction } from "@/lib/patients/actions";
import { matchedContraindications, type PatientContraindications } from "@/lib/scheduling/nesa";
import {
  batchScheduleAppointments,
  cancelAppointment,
  createAppointment,
  getTherapistLocations,
  getTherapistServices,
  hardDeleteAppointment,
  rescheduleAppointment,
  updateAppointment,
} from "@/lib/scheduling/actions";
import { pickAutoFillLocation } from "@/lib/scheduling/location-auto-fill";
import { therapistOptionsForBooking } from "@/lib/scheduling/therapist-location-filter";
import {
  getPatientPackBalanceAction,
  linkAppointmentToPackAction,
  listAvailablePacksForPatientAction,
  listLinkablePacksAction,
} from "@/lib/packs/actions";
import type { LinkablePacksView } from "@/lib/packs/link";
import type { BatchFailure } from "@/lib/scheduling/batch-core";
import type { RebookOutcome } from "@/lib/scheduling/batch-failure-core";
import { BatchFailureDialog } from "./batch-failure-dialog";
import {
  formatTimeOfDay,
  lisbonDateTimeToUtc,
  lisbonParts,
} from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AgendaOptions,
  AppointmentStatusValue,
  ConflictInfo,
  SeriesScope,
} from "@/lib/scheduling/types";
import {
  buildLoteSlots,
  generateLoteSchedule,
  type LoteEnd,
  type LoteRow,
} from "@/lib/scheduling/lote";
import { AppointmentNotesBoard } from "./appointment-notes-board";
import { AvailabilityPanel } from "./availability-panel";

import { ConfirmationIndicator } from "./confirmation-indicator";
import { PackLinkPanel } from "./pack-link-panel";
import { PackAvailableNotice, type AvailablePack } from "./pack-available-notice";

export type ModalState =
  | {
      mode: "create";
      slot?: { date: string; time: string };
      // W6-03: a deep-link from a patient profile preselects + LOCKS this patient
      // (the user then picks only therapist + date/time). Absent on a normal create.
      lockedPatient?: { value: string; label: string };
      // GUEST-06: a converted guest request also carries the service and clinic
      // they asked for. PRESELECTED, NOT LOCKED — unlike the patient, which is
      // the one fact the convert established. Reception rings the caller and the
      // service is exactly what that call may change, so locking it would put a
      // guess beyond reach. Each id is validated against `options` by
      // agenda/page.tsx before it gets here, so it always has a matching
      // <option> (STAFF-01).
      prefill?: { serviceId: string | null; locationId: string | null };
    }
  | { mode: "edit"; appt: AgendaAppointment };

type StringKey = keyof typeof s;
type FormState = {
  patientId: string;
  serviceId: string;
  // W8-01c — when set, this booking consumes a pack session; serviceId is the
  // pack's base service and the lote/recurrence path is disabled (single-session).
  packId: string;
  practitionerId: string;
  // Optional secondary participants (W4-19) — de-emphasized, create-only capture.
  patientTwoId: string;
  practitionerTwoId: string;
  locationId: string;
  room: string;
  date: string;
  time: string;
  durationMin: number;
  status: AppointmentStatusValue;
  notes: string;
  scope: SeriesScope;
};

const DURATIONS = [30, 45, 60, 90];
// PL-21: the lote weekday picker, in clinical week order (Monday first, Sunday
// last - the same order the schedule editor uses). Values are JS getDay():
// 0 = Sunday .. 6 = Saturday, which is what generateLoteSchedule expects.
const LOTE_WEEKDAYS = [
  { value: 1, key: "admin.workingHours.mon" },
  { value: 2, key: "admin.workingHours.tue" },
  { value: 3, key: "admin.workingHours.wed" },
  { value: 4, key: "admin.workingHours.thu" },
  { value: 5, key: "admin.workingHours.fri" },
  { value: 6, key: "admin.workingHours.sat" },
  { value: 0, key: "admin.workingHours.sun" },
] as const;

const STATUS_OPTIONS: { value: AppointmentStatusValue; key: StringKey }[] = [
  { value: "scheduled", key: "appointment.statusPending" },
  { value: "confirmed", key: "appointment.statusConfirmed" },
  { value: "completed", key: "appointment.statusCompleted" },
  { value: "cancelled", key: "appointment.statusCancelled" },
  { value: "no_show", key: "appointment.statusNoShow" },
];
const SCOPE_OPTIONS: { value: SeriesScope; key: StringKey }[] = [
  { value: "one", key: "appointment.scopeOne" },
  { value: "following", key: "appointment.scopeFollowing" },
  { value: "series", key: "appointment.scopeSeries" },
];

/**
 * Appointment Drawer (SPEC-staff-screens §5). Replaces the appointment modal,
 * composed from the packages/ui Drawer — identical fields, data, endpoints, and
 * permissions. The patient field is now a search Combobox; the conflict check
 * surfaces as an inline warning Banner; a dirty close routes through the Drawer's
 * discard Dialog; success fires a Toast and refetches the agenda.
 *
 * Deferred (kept native to preserve the booking/reschedule e2e contracts):
 * Data via a native date input and Hora via a native time input (the W2-01
 * DatePicker/TimeField swap is a follow-up); the "Novo paciente" inline-create
 * segment (the appointment endpoint has no patient quick-create today, rule #1).
 */
export function AppointmentDrawer({
  state,
  options,
  anchor,
  canHardDelete,
  viewer,
  onClose,
  onDone,
}: {
  state: ModalState;
  options: AgendaOptions;
  anchor: string;
  canHardDelete: boolean;
  // PL-10: the logged-in viewer's identity. When the viewer is a THERAPIST on
  // the CREATE form, the drawer self-locks: practitioner is forced to `userId`
  // and the Terapeuta selector is replaced by a static label of their own name.
  // Owner/admin/reception are never self-locked (full dropdown, unchanged).
  viewer: { role: Role; userId: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const editing = state.mode === "edit" ? state.appt : null;
  // PL-10 — therapist self-booking self-lock (create form only). See prop doc.
  const selfLocked = isTherapistSelfLocked(viewer.role, state.mode);
  const selfUserId = viewer.userId;
  // W5-22: read-only navigation from the marcação edit view to the patient
  // profile(s). Client-side push, no data change.
  const router = useRouter();
  const isRecurring = !!(editing && (editing.recurrenceRule || editing.recurrenceParentId));

  const init = useMemo<FormState>(() => {
    if (editing) {
      const start = new Date(editing.startsAt);
      const parts = lisbonParts(start);
      const durationMin = Math.round((new Date(editing.endsAt).getTime() - start.getTime()) / 60_000);
      return {
        patientId: editing.patientId,
        serviceId: editing.serviceId ?? "",
        packId: "",
        practitionerId: editing.practitionerId,
        patientTwoId: editing.patientTwoId ?? "",
        practitionerTwoId: editing.practitionerTwoId ?? "",
        locationId: editing.locationId,
        room: editing.room ?? "",
        date: parts.date,
        time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
        durationMin: durationMin > 0 ? durationMin : 60,
        status: editing.status,
        notes: editing.notes ?? "",
        scope: "one",
      };
    }
    const slot = state.mode === "create" ? state.slot : undefined;
    // W6-03: a deep-linked create preselects the locked patient.
    const lockedPatient = state.mode === "create" ? state.lockedPatient : undefined;
    // GUEST-06: a converted guest request also preselects service + clinic.
    const prefill = state.mode === "create" ? state.prefill : undefined;
    // AND ITS DURATION, because the two are ONE fact. Picking a service through
    // the <Select> runs `onServiceChange`, which sets durationMin from the
    // service; preselecting one in initial state runs nothing. Without this the
    // drawer would open reading "Fisioterapia" beside a 60-minute duration the
    // service does not have, and the length is what gets booked. Same collapse
    // as STAFF-01: a control displaying a value that is not the value in effect.
    const prefillService = prefill?.serviceId
      ? options.services.find((o) => o.id === prefill.serviceId)
      : undefined;
    return {
      patientId: lockedPatient?.value ?? "",
      serviceId: prefill?.serviceId ?? "",
      packId: "",
      // PL-10: a self-locked therapist's practitioner is forced to themselves ON
      // OPEN (the value submit sends). Everyone else starts empty and picks one.
      practitionerId: selfLocked ? selfUserId : "",
      patientTwoId: "",
      practitionerTwoId: "",
      locationId: prefill?.locationId ?? options.bookableLocations[0]?.id ?? "",
      room: "",
      date: slot?.date ?? anchor,
      time: slot?.time ?? "09:00",
      durationMin: prefillService?.durationMin ?? 60,
      status: "scheduled",
      notes: "",
      scope: "one",
    };
  }, [
    editing,
    state,
    anchor,
    options.bookableLocations,
    options.services,
    selfLocked,
    selfUserId,
  ]);

  const [form, setForm] = useState<FormState>(init);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Password-gated hard delete (W3-06) — edit-only, admin-only.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  // Partial-success batch (W2-05): when a recorrente booking has busy slots, the
  // free ones are booked and these drive the failure dialog for the rest.
  const [batchFailures, setBatchFailures] = useState<{
    bookedCount: number;
    failures: BatchFailure[];
  } | null>(null);

  // "Agendar lote" (W2-10) — replaces the V1 recorrente control. Collects a
  // count + an every-X-weeks pattern, generates candidate dates, and gives each
  // its OWN time; Confirm submits the explicit slot list to the W2-09 engine.
  const [loteMode, setLoteMode] = useState(false);
  const [loteCount, setLoteCount] = useState(4);
  const [loteEveryWeeks, setLoteEveryWeeks] = useState(1);
  const [loteRows, setLoteRows] = useState<LoteRow[]>([]);
  // PL-21 (Rodica: "you can only select if 1 per week or twice a week"). The
  // pattern people describe is WHICH weekdays, HOW OFTEN, and WHEN it stops.
  // Empty weekdays = "the weekday of the form's own date", which is exactly the
  // behaviour before this card, so opening the panel and pressing Gerar datas
  // without touching anything produces what it always did.
  const [loteWeekdays, setLoteWeekdays] = useState<number[]>([]);
  const [loteEndMode, setLoteEndMode] = useState<LoteEnd["kind"]>("count");

  /**
   * RB-02b — the pacote batch. SEPARATE STATE FROM THE LOTE, deliberately.
   *
   * The lote is a PATTERN: weekdays, an interval, an end, and a generator that
   * produces rows. The pacote path has none of those by owner ruling - every
   * slot is hand-picked - so sharing the lote's state would mean carrying four
   * controls that must never be shown and hoping nobody wires them up. Two
   * states, and the pacote one cannot express a cadence at all.
   *
   * Row 1 is seeded from the form's own date and time, which the user has
   * already chosen. Rows 2..N start EMPTY: seeding them would imply a spacing,
   * and imposing a spacing is precisely the decision Q-RB-02-1 says is the
   * clinic's rather than ours.
   */
  const [packRows, setPackRows] = useState<LoteRow[]>([]);
  const [loteUntil, setLoteUntil] = useState("");

  // A conflict banner describes one specific therapist/date/time/duration
  // combination (checked server-side inside create/update/reschedule — there
  // is no separate live pre-check endpoint to call here). If the user changes
  // any of those fields after a conflict is shown, the banner is now
  // describing a slot that's no longer being requested, and — worse — the
  // Drawer's confirm button has switched to "Guardar mesmo assim", which
  // submits with allowConflict=true. Without this, that would silently skip
  // conflict checking for the new, never-validated combination. Clearing
  // conflicts forces the next confirm to re-check the current slot from
  // scratch, same as a first-time submit. Adjusted during render (React's
  // documented pattern for resetting state when inputs change) rather than in
  // an effect, so the stale banner never has a chance to paint.
  const slotKey = `${form.practitionerId}|${form.date}|${form.time}|${form.durationMin}`;
  const [checkedSlotKey, setCheckedSlotKey] = useState(slotKey);
  if (slotKey !== checkedSlotKey) {
    setCheckedSlotKey(slotKey);
    setConflicts(null);
  }

  // Patient search — async, search-as-you-type (min 2 chars, 300 ms debounce).
  // Edit mode pre-populates the query with the existing patient name so the
  // current selection is visible without a round-trip.
  // W6-03: a deep-linked create carries a locked patient. Treat it like the
  // edit-mode preset for DISPLAY (value + label), but also lock the field so the
  // user cannot change the patient in this flow (they pick only therapist +
  // date/time). `presetPatient` unifies both preset sources for the combobox.
  const lockedPatient = state.mode === "create" ? state.lockedPatient ?? null : null;
  const patientLocked = lockedPatient !== null;
  // SEC-appointment-vanishes-with-patient-scope: on a withheld patient the
  // combobox shows the same "reserved" label the grid does. It is NOT a
  // searchable option - `patientSearchResults` comes from a scoped search that
  // cannot return this patient - so the editor can move the slot's time or
  // therapist without ever naming whose it is.
  const editingPatient = editing
    ? { value: editing.patientId, label: patientLabel(editing.patientName) }
    : null;
  const presetPatient = editingPatient ?? lockedPatient;
  const [patientQuery, setPatientQuery] = useState(presetPatient?.label ?? "");
  const [patientSearchResults, setPatientSearchResults] = useState<ComboboxOption[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);

  // When query is below the minimum, show the current patient (edit / locked) or
  // nothing (create). When at or above minimum, show the debounced search results.
  const patientOptions = useMemo<ComboboxOption[]>(() => {
    if (patientQuery.trim().length < 2) return presetPatient ? [presetPatient] : [];
    return patientSearchResults;
  }, [patientQuery, patientSearchResults, presetPatient]);

  useEffect(() => {
    // W6-03: the locked (deep-link) patient is fixed; never search for it.
    if (patientLocked) return;
    const q = patientQuery.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setPatientLoading(true);
      searchPatientsAction(q)
        .then((rows) => setPatientSearchResults(rows.map((r) => ({ value: r.id, label: r.label }))))
        .finally(() => setPatientLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  // editing is stable for the drawer's lifetime; patientQuery drives the search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientQuery]);

  // Secondary patient (W4-19) — a second, OPTIONAL search combobox mirroring the
  // primary. De-emphasized; primary-only semantics elsewhere (never fed to
  // availability/conflict/analytics). Its own search state so the two comboboxes
  // don't share results.
  const editingPatientTwo =
    editing?.patientTwoId && editing.patientTwoName
      ? { value: editing.patientTwoId, label: editing.patientTwoName }
      : null;
  // The Participantes secundários section mounts its inner fields only when open
  // (keeps the secondary controls out of the DOM otherwise — see the render).
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [patientTwoQuery, setPatientTwoQuery] = useState(editingPatientTwo?.label ?? "");
  const [patientTwoResults, setPatientTwoResults] = useState<ComboboxOption[]>([]);
  const [patientTwoLoading, setPatientTwoLoading] = useState(false);
  const patientTwoOptions = useMemo<ComboboxOption[]>(() => {
    if (patientTwoQuery.trim().length < 2) return editingPatientTwo ? [editingPatientTwo] : [];
    return patientTwoResults;
  }, [patientTwoQuery, patientTwoResults, editingPatientTwo]);
  useEffect(() => {
    const q = patientTwoQuery.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setPatientTwoLoading(true);
      searchPatientsAction(q)
        .then((rows) => setPatientTwoResults(rows.map((r) => ({ value: r.id, label: r.label }))))
        .finally(() => setPatientTwoLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientTwoQuery]);

  // NESA contraindication warning (W2-08): the selected patient's flags, fetched
  // reactively. Stored WITH the patient id they belong to so the derived value
  // reads null the instant the selection changes (no synchronous reset in the
  // effect), then updates when the fetch for the current patient lands.
  const [ciResult, setCiResult] = useState<{
    patientId: string;
    flags: PatientContraindications;
  } | null>(null);
  useEffect(() => {
    const pid = form.patientId;
    if (!pid) return;
    let cancelled = false;
    getPatientContraindications(pid).then((flags) => {
      if (!cancelled) setCiResult({ patientId: pid, flags });
    });
    return () => {
      cancelled = true;
    };
  }, [form.patientId]);
  const patientCI =
    ciResult && ciResult.patientId === form.patientId ? ciResult.flags : null;

  // W8-01c — the selected patient's active balance for the selected pack,
  // fetched reactively. Stored WITH the (patientId, packId) it belongs to so the
  // derived value reads null the instant either selection changes (same pattern
  // as the NESA fetch above), then updates when the current fetch lands.
  const [packBalanceResult, setPackBalanceResult] = useState<{
    patientId: string;
    packId: string;
    // RB-02: DERIVED from linked appointments, not the frozen sessions_remaining
    // column. The name change is deliberate - see lib/packs/instances.ts.
    balance: { sessionsTotal: number; sessionsAvailable: number } | null;
  } | null>(null);
  useEffect(() => {
    const pid = form.patientId;
    const packId = form.packId;
    if (!pid || !packId) return;
    let cancelled = false;
    getPatientPackBalanceAction(pid, packId).then((balance) => {
      if (!cancelled) setPackBalanceResult({ patientId: pid, packId, balance });
    });
    return () => {
      cancelled = true;
    };
  }, [form.patientId, form.packId]);
  const packBalance =
    packBalanceResult &&
    packBalanceResult.patientId === form.patientId &&
    packBalanceResult.packId === form.packId
      ? packBalanceResult.balance
      : null;
  const selectedPack = options.packs.find((p) => p.id === form.packId) ?? null;

  /**
   * PACK-01 — the pacotes an EXISTING appointment can be attached to.
   *
   * SAME SHAPE AS THE BALANCE FETCH ABOVE: stored WITH the appointment id it
   * belongs to, so the derived value reads null the instant the drawer moves to
   * a different appointment, rather than showing the previous one's pacotes for
   * a frame. `packLinkTick` re-runs it after a successful link, because the
   * balance the panel prints has just moved.
   */
  /**
   * PACK-02 — the selected patient's pacotes that still have sessions.
   *
   * CREATE ONLY, and keyed on the patient the same way the balance fetch above
   * is: the derived value reads empty the instant the patient changes, rather
   * than showing the previous patient's pacotes for a frame. On EDIT the
   * question is a different one and PackLinkPanel answers it.
   */
  const [availablePacksResult, setAvailablePacksResult] = useState<{
    patientId: string;
    packs: AvailablePack[];
  } | null>(null);
  useEffect(() => {
    const pid = form.patientId;
    if (editing || !pid) return;
    let cancelled = false;
    listAvailablePacksForPatientAction(pid).then((packs) => {
      if (!cancelled) setAvailablePacksResult({ patientId: pid, packs });
    });
    return () => {
      cancelled = true;
    };
  }, [editing, form.patientId]);
  const availablePacks =
    availablePacksResult && availablePacksResult.patientId === form.patientId
      ? availablePacksResult.packs
      : [];

  const editingId = editing?.id ?? null;
  const [packLinkTick, setPackLinkTick] = useState(0);
  const [packLinkResult, setPackLinkResult] = useState<{
    appointmentId: string;
    view: LinkablePacksView;
  } | null>(null);
  const [packLinkBusy, setPackLinkBusy] = useState<string | null>(null);
  const [packLinkError, setPackLinkError] = useState<StringKey | null>(null);
  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    listLinkablePacksAction(editingId).then((view) => {
      if (!cancelled) setPackLinkResult({ appointmentId: editingId, view });
    });
    return () => {
      cancelled = true;
    };
  }, [editingId, packLinkTick]);
  const packLink =
    packLinkResult && packLinkResult.appointmentId === editingId ? packLinkResult.view : null;

  async function linkPack(instanceId: string) {
    if (!editingId) return;
    setPackLinkBusy(instanceId);
    setPackLinkError(null);
    try {
      const res = await linkAppointmentToPackAction(editingId, instanceId);
      if (res.ok) {
        toast({ tone: "success", message: s["appointment.packLinkDone"] });
        // REFETCH RATHER THAN PATCH THE LOCAL LIST. The balance is derived on
        // the server from the appointments table; recomputing it here would be
        // a second definition of "available" that can disagree with the first.
        //
        // AND IT DOES NOT CALL `onDone()`. That closes the drawer, which is
        // right after a SAVE and wrong here: linking is one discrete act and the
        // person may well be mid-edit. The panel re-reads itself instead, and
        // the agenda grid shows nothing pacote-related to go stale.
        setPackLinkTick((n) => n + 1);
      } else {
        setPackLinkError(
          res.reason === "no_sessions_left" || res.reason === "already_linked"
            ? "appointment.packLinkTaken"
            : "appointment.packLinkFailed",
        );
        setPackLinkTick((n) => n + 1);
      }
    } finally {
      setPackLinkBusy(null);
    }
  }

  // RB-02b — how many sessions this booking may take. Null until the balance
  // lands; a fresh pacote registers on save, so its ceiling is the pack size.
  const packSessionsAvailable = packBalance
    ? packBalance.sessionsAvailable
    : (selectedPack?.sessionCount ?? null);

  /**
   * THE CEILING CAN TIGHTEN UNDER THE USER, so the visible list is DERIVED from
   * it rather than synchronised to it.
   *
   * Pick a pacote of ten with no patient chosen and the ceiling is ten. Choose a
   * patient who already HOLDS that pacote with three left, and the ceiling
   * becomes three while the stored list still has ten rows. The server would
   * refuse that batch by name - loud, not silent - but being told "not enough
   * sessions" about a number the screen itself just offered is a bad way to find
   * out.
   *
   * DERIVED, NOT AN EFFECT. A `useEffect` calling `setPackRows` was written
   * first and the lint rule refused it, correctly: it is a cascading render, and
   * it also leaves one frame where the screen shows rows that are already
   * invalid. Slicing at render has neither problem, and the stored rows survive
   * intact if the ceiling widens again.
   */
  const packSlots =
    packSessionsAvailable === null ? packRows : packRows.slice(0, packSessionsAvailable);

  /** Resize the hand-picked slot list, keeping what is already filled in. */
  function setPackCount(next: number) {
    const ceiling = packSessionsAvailable ?? 1;
    const n = Math.max(1, Math.min(ceiling, Math.floor(next) || 1));
    setPackRows((rows) => {
      if (n <= rows.length) return rows.slice(0, n);
      const seed: LoteRow[] = [{ date: form.date, time: form.time }];
      const grown = [...rows];
      while (grown.length < n) {
        // Row 1 takes the form's slot; every other row starts EMPTY and must be
        // picked. An empty row is refused at submit rather than guessed.
        grown.push(grown.length === 0 ? seed[0] : { date: "", time: "" });
      }
      return grown;
    });
  }
  // Packs offered at the chosen location (or at all locations). Create-only.
  const packOptions = options.packs.filter(
    (p) => p.locationId === null || p.locationId === form.locationId,
  );

  const dirty = JSON.stringify(form) !== JSON.stringify(init);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function applyService(serviceId: string) {
    const svc = options.services.find((o) => o.id === serviceId);
    setForm((f) => ({ ...f, serviceId, durationMin: svc ? svc.durationMin : f.durationMin }));
  }
  function onServiceChange(serviceId: string) {
    applyService(serviceId);
  }
  // W8-01c — selecting a pack forces the base service + its duration and locks
  // the Serviço field; clearing it frees Serviço again. The LOTE path is turned
  // off while a pacote is selected, and stays off after RB-02b: a pacote books N
  // through its own hand-picked list, which carries no pattern controls at all.
  // RB-02b — changing or clearing the pacote discards the hand-picked slots.
  // Carrying them across would attach dates chosen for one pacote's balance to
  // another's, and the count ceiling would be wrong from the first render.
  function onPackChange(packId: string) {
    setPackRows([]);
    const pack = options.packs.find((p) => p.id === packId);
    if (!pack) {
      setForm((f) => ({ ...f, packId: "" }));
      return;
    }
    setLoteMode(false);
    setLoteRows([]);
    const base = options.services.find((sv) => sv.id === pack.baseServiceId);
    setForm((f) => ({
      ...f,
      packId,
      serviceId: pack.baseServiceId,
      durationMin: base ? base.durationMin : f.durationMin,
    }));
  }
  // Auto-fill Serviço from the therapist's default service (W3-03) WITHOUT ever
  // overwriting a service the user has already chosen — the Select stays
  // editable for per-booking exceptions and a manual pick always wins, even if
  // the mapping fetch lands afterwards.
  function applyDefaultService(serviceId: string) {
    const svc = options.services.find((o) => o.id === serviceId);
    setForm((f) =>
      f.serviceId ? f : { ...f, serviceId, durationMin: svc ? svc.durationMin : f.durationMin },
    );
  }
  // Auto-fill Localização from the therapist's single active location (W4-12,
  // owner ruling). Unlike Serviço, locationId is never empty (it defaults to the
  // first active location), so a manual pick is guarded by userChangedLocation —
  // pickAutoFillLocation returns null when the user has already touched it.
  function applyDefaultLocation(locationId: string) {
    setForm((f) => ({ ...f, locationId }));
  }

  // Therapist -> service mapping (0023, SPEC-appointments §6). PL-06a (owner
  // ruling 2026-07-28): the mapping is a PRESELECTION, never a RESTRICTION — the
  // Serviço Select always lists ALL active services, and this fetch only supplies
  // the default (the therapist's primary = oldest-first ids[0]). Preselect fires
  // only when the fetch was triggered by an actual user edit to the Terapeuta
  // field (userChangedTherapist, set in the Select's onChange below) — never on
  // the initial mount value — so opening the edit drawer can never silently
  // rewrite an already-saved serviceId. A late response is dropped by the
  // `cancelled` guard in the effect, so no result state needs to outlive it.
  const userChangedTherapist = useRef(false);
  const userChangedLocation = useRef(false);

  useEffect(() => {
    const therapistId = form.practitionerId;
    if (!therapistId) return;
    let cancelled = false;
    getTherapistServices(therapistId).then((r) => {
      if (cancelled) return;
      const ids = r.ok ? r.data : [];
      // PL-06a: preselect the therapist's PRIMARY (oldest-first ids[0]) as the
      // default Serviço. This NEVER filters the Select — every active service
      // stays offered, and applyDefaultService never overwrites a service the
      // user already picked (it guards on empty). Fires on a real Terapeuta
      // change OR — PL-10 — on OPEN when the form is therapist self-locked (the
      // therapist can't change Terapeuta, so the preselect must run without a
      // manual change). Still never fires on a plain create/edit mount.
      if (shouldPreselectPrimaryService(userChangedTherapist.current, selfLocked) && ids.length >= 1) {
        applyDefaultService(ids[0]);
      }
    });
    // W4-12: on the SAME therapist-selection event, auto-fill Localização when
    // the therapist has exactly one active location. Independent fetch/setForm
    // from the service auto-fill above — different field, no clobber. Guards
    // (real therapist change, no manual location pick) read fresh after the
    // await via pickAutoFillLocation, so a location edit during the fetch wins.
    getTherapistLocations(therapistId).then((r) => {
      if (cancelled) return;
      const ids = r.ok ? r.data : [];
      const pick = pickAutoFillLocation(ids, {
        userChangedTherapist: userChangedTherapist.current,
        userChangedLocation: userChangedLocation.current,
      });
      if (pick) applyDefaultLocation(pick);
    });
    return () => {
      cancelled = true;
    };
  // applyService/options.services are stable for the drawer's lifetime (same
  // reasoning as the patient-search effect above); only the therapist drives
  // this fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.practitionerId]);

  // PL-06a (owner ruling 2026-07-28): the therapist->service mapping is a
  // PRESELECTION, never a RESTRICTION. The Serviço Select lists ALL active
  // services for every therapist (tenant-wide, exactly as the booking query
  // already is — no location clause, no therapist coupling); the mapping only
  // drives the default preselected above. A therapist whose primary is NESA
  // stays bookable for any other active service the clinic needs.
  const serviceOptions = options.services;

  // W12-23: scope the therapist dropdown to the form-selected location's team
  // (derived from availability_templates / staff_locations), keeping the current
  // therapist selectable in edit mode. Falls back to the full list when no
  // location is chosen or the assignment map is absent (old option mocks). This
  // consumes the location assignment DATA; a missing assignment surfaces as the
  // empty state below, not a code fix (the Equipa data task is owner/Rodica's).
  const therapistAssignments = useMemo(
    () => new Map<string, string[]>(Object.entries(options.therapistLocationIds ?? {})),
    [options.therapistLocationIds],
  );
  const therapistPool = options.allTherapists ?? options.therapists;
  // PL-10: a self-locked therapist's own display name, looked up from the same
  // tenant-wide roster the dropdown draws from (the name is DATA, not a string
  // key). The therapist is a bookable staff member, so this always resolves;
  // the empty fallback is defensive only.
  const selfTherapistName = selfLocked
    ? therapistPool.find((t) => t.id === selfUserId)?.label ?? ""
    : "";
  // Scope ONLY after the user actively picks a location (userChangedLocation).
  // On open, the default location keeps the FULL list, so a therapist-first
  // booking is unaffected and an unassigned therapist stays bookable until the
  // Equipa data assigns them (the loop's "default-location behaviour applies"
  // clause). keepId retains the already-selected therapist across the change.
  const therapistOptions = userChangedLocation.current
    ? therapistOptionsForBooking(
        therapistPool,
        therapistAssignments,
        form.locationId || null,
        form.practitionerId || null,
      )
    : therapistPool;
  const noTherapistsAtLocation =
    userChangedLocation.current && !!form.locationId && therapistOptions.length === 0;

  function handleResult(r: {
    ok: boolean;
    error?: string;
    conflicts?: ConflictInfo[];
    availabilityWindows?: { startTime: string; endTime: string }[];
  }): boolean {
    if (r.ok) return true;
    if (r.error === "conflict") setConflicts(r.conflicts ?? []);
    else if (r.error === "forbidden") setError(s["errors.forbidden"]);
    // INC-08: its own message, not the generic one. This Estado <Select> offers
    // all five statuses with no client-side guard, so an illegal move is one
    // click away and reception needs to be told WHICH move is refused - not
    // "ocorreu um erro", and certainly not "preencha os campos obrigatórios".
    else if (r.error === "illegal_transition") setError(s["appointment.illegalTransition"]);
    // INC-08 / 0061. Rendered as a plain message, NOT through setConflicts:
    // that path offers "Guardar mesmo assim", and this is the one refusal the
    // override may not reach. The owner is demonstrating this build to the
    // clinic team; a raw database error here would be worse than the bug.
    else if (r.error === "double_booked") setError(s["appointment.doubleBooked"]);
    // RB-03. A plain message and NOT setConflicts, for the same reason as the
    // double-booking above: that path offers "Guardar mesmo assim", and this is
    // a refusal the override may not reach. It would also render "conflicts
    // with:" followed by nothing, because there is no conflicting appointment -
    // the candidate window IS the problem.
    //
    // THE MESSAGE NAMES THE WINDOW, which is the whole point of the refusal.
    // "Fora do horário" on its own sends reception to another screen to find
    // out what the horário IS; naming it means the next attempt is informed.
    // Split shift is why this joins a LIST rather than printing one pair: a
    // therapist-day can carry two periods (W13-A) and a message naming only the
    // first would be confidently wrong about the afternoon.
    //
    // NO WINDOWS IS A DIFFERENT SENTENCE, not a missing value: the therapist has
    // hours at this location but none that weekday.
    else if (r.error === "outside_availability") {
      const w = r.availabilityWindows ?? [];
      setError(
        w.length === 0
          ? `${s["appointment.outsideAvailability"]} ${s["appointment.outsideAvailabilityNoWindows"]} ${s["appointment.outsideAvailabilityHint"]}`
          : `${s["appointment.outsideAvailability"]} ${s["appointment.outsideAvailabilityWindows"]} ` +
            `${w.map((x) => `${x.startTime}-${x.endTime}`).join(", ")}. ` +
            `${s["appointment.outsideAvailabilityHint"]}`,
      );
    }
    // STAFF-02. The form now offers only assigned locations, so reaching this is
    // either a stale tab or a request that did not come from the form - and in
    // both cases the honest message names the location, not a permission.
    else if (r.error === "location_not_assigned")
      setError(s["appointment.locationNotAssigned"]);
    // RB-02: the pacote has fewer sessions left than this booking needs. The
    // message NAMES both numbers, for the same reason outside_availability names
    // the window: "não há sessões suficientes" on its own sends reception to
    // another screen to find out how many there are.
    else if (r.error === "pack_insufficient")
      setError(s["appointment.packInsufficient"]);
    else if (r.error === "validation") setError(s["appointment.requiredFields"]);
    else if (r.error === "unauthenticated") setError(s["errors.unauthenticated"]);
    else setError(s["errors.generic"]);
    return false;
  }

  async function submit(allowConflict: boolean) {
    setError(null);
    if (!form.patientId || !form.practitionerId || !form.locationId || !form.date || !form.time || form.durationMin <= 0) {
      setError(s["appointment.requiredFields"]);
      return;
    }
    const startsAt = lisbonDateTimeToUtc(form.date, form.time);
    const endsAt = new Date(startsAt.getTime() + form.durationMin * 60_000);
    const startISO = startsAt.toISOString();
    const endISO = endsAt.toISOString();

    setSubmitting(true);
    setConflicts(null);
    try {
      if (!editing) {
        // Agendar lote (W2-10, ruling G): partial-success batch over an EXPLICIT
        // per-date slot list — book every free slot, report the busy ones in a
        // dialog. Single creation (lote off) is unchanged.
        /**
         * RB-02b — a pacote asking for MORE THAN ONE session routes to the batch
         * engine, which is the only path that books many slots and reports each
         * one's fate. A single-session pacote keeps the create path unchanged.
         *
         * EVERY ROW MUST BE PICKED. Rows 2..N start empty on purpose, and an
         * empty row is REFUSED here rather than defaulted: defaulting it would
         * book a real appointment at a time nobody chose, which is worse than
         * being asked to fill it in.
         */
        if (form.packId && packSlots.length > 1) {
          const incomplete = packSlots.some((r) => !r.date || !r.time);
          if (incomplete) {
            setError(s["pack.batchIncomplete"]);
            return;
          }
          const r = await batchScheduleAppointments({
            patientId: form.patientId,
            practitionerId: form.practitionerId,
            locationId: form.locationId,
            serviceId: form.serviceId || null,
            packId: form.packId,
            slots: buildLoteSlots(packSlots, form.durationMin),
          });
          if (!r.ok) {
            handleResult(r);
            return;
          }
          if (r.data.failures.length === 0) {
            succeed();
            return;
          }
          setBatchFailures({ bookedCount: r.data.booked.length, failures: r.data.failures });
          return;
        }

        if (loteMode) {
          const slots = buildLoteSlots(loteRows, form.durationMin);
          if (slots.length === 0) {
            setError(s["lote.noDates"]);
            return;
          }
          const r = await batchScheduleAppointments({
            patientId: form.patientId,
            practitionerId: form.practitionerId,
            locationId: form.locationId,
            serviceId: form.serviceId || null,
            slots,
          });
          if (!r.ok) {
            handleResult(r);
            return;
          }
          if (r.data.failures.length === 0) {
            succeed();
            return;
          }
          setBatchFailures({ bookedCount: r.data.booked.length, failures: r.data.failures });
          return;
        }
        const r = await createAppointment({
          patientId: form.patientId,
          practitionerId: form.practitionerId,
          locationId: form.locationId,
          serviceId: form.serviceId || null,
          room: form.room || null,
          // Optional secondary participants (W4-19) — display-only linkage.
          patientTwoId: form.patientTwoId || null,
          practitionerTwoId: form.practitionerTwoId || null,
          startsAt: startISO,
          endsAt: endISO,
          notes: form.notes || null,
          recurrence: null,
          // W8-01c — when set, the server forces serviceId to the pack's base
          // service and registers/decrements a pack session in the same tx.
          packId: form.packId || null,
          allowConflict,
        });
        if (!handleResult(r)) return;
        succeed();
        return;
      }

      const scope = form.scope;
      if (form.status === "cancelled" && editing.status !== "cancelled") {
        const r = await cancelAppointment(editing.id, form.notes || undefined, { scope });
        if (!handleResult(r)) return;
        succeed();
        return;
      }

      const patch: Parameters<typeof updateAppointment>[1] = {};
      if (form.serviceId !== (editing.serviceId ?? "")) patch.serviceId = form.serviceId || null;
      if (form.room !== (editing.room ?? "")) patch.room = form.room || null;
      if (form.notes !== (editing.notes ?? "")) patch.notes = form.notes || null;
      if (form.status !== editing.status && form.status !== "cancelled") patch.status = form.status;

      const timeOfDayChanged = form.time !== init.time || form.durationMin !== init.durationMin;
      const practOrLocChanged = form.practitionerId !== editing.practitionerId || form.locationId !== editing.locationId;
      const dateChanged = form.date !== init.date;
      const temporalChanged = scope === "one" ? dateChanged || timeOfDayChanged || practOrLocChanged : timeOfDayChanged || practOrLocChanged;

      // An edit can need TWO server actions, and each commits on its own: there
      // is no shared transaction across them. So whichever runs first is already
      // written by the time the second can refuse, and a refusal shows a
      // conflict banner that reads as "nothing was saved".
      //
      // ORDER MATTERS, and it used to be wrong. `updateAppointment` ran first,
      // so moving an appointment onto an occupied slot committed the service,
      // room, notes and status change and THEN refused the move. Cancelar out of
      // that dialog and the record disagreed with what the user believed they
      // had done.
      //
      // The reschedule now goes FIRST because it is where conflicts actually
      // come from: a therapist or room overlap at the new time. When it refuses,
      // nothing at all has been written, which is what the banner already
      // implies. The residual case is narrow and is no longer silent: if the
      // reschedule succeeds and the patch then refuses (only reachable via a
      // room double-booking at the new time), `movedFirst` makes the drawer say
      // so, instead of showing a bare conflict over an appointment that has
      // already moved.
      let movedFirst = false;

      if (temporalChanged) {
        const r = await rescheduleAppointment(editing.id, {
          startsAt: startISO,
          endsAt: endISO,
          practitionerId: form.practitionerId,
          locationId: form.locationId,
          scope,
          allowConflict,
        });
        if (!handleResult(r)) return;
        movedFirst = true;
      }

      if (Object.keys(patch).length > 0) {
        const r = await updateAppointment(editing.id, patch, { scope, allowConflict });
        if (!handleResult(r)) {
          // The move already committed. Say that plainly rather than leaving the
          // user to infer it from a dialog that looks like a clean refusal.
          if (movedFirst) setError(s["appointment.movedButDetailsNotSaved"]);
          return;
        }
      }
      succeed();
    } finally {
      setSubmitting(false);
    }
  }

  function succeed() {
    toast({ tone: "success", message: s["appointment.saved"] });
    onDone();
  }

  // Password-gated hard delete (W3-06). The password is verified SERVER-side;
  // the client only forwards it. On success the appointment is permanently gone.
  async function doHardDelete() {
    if (!editing) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      const r = await hardDeleteAppointment(editing.id, deletePw);
      if (r.ok) {
        setDeleteOpen(false);
        toast({ tone: "success", message: s["appointment.deleted"] });
        onDone();
        return;
      }
      setDeleteErr(
        r.error === "password"
          ? s["appointment.deleteWrongPassword"]
          : r.error === "linked_records"
            ? s["appointment.deleteLinkedRecords"]
            : r.error === "forbidden"
              ? s["errors.forbidden"]
              : s["errors.generic"],
      );
    } finally {
      setDeleting(false);
    }
  }

  // Re-attempt ONE slot from the failure dialog at the edited date/time, through
  // the same engine — as a single explicit slot.
  async function rebookSlot(date: string, hhmm: string): Promise<RebookOutcome> {
    const r = await batchScheduleAppointments({
      patientId: form.patientId,
      practitionerId: form.practitionerId,
      locationId: form.locationId,
      serviceId: form.serviceId || null,
      slots: buildLoteSlots([{ date, time: hhmm }], form.durationMin),
    });
    if (!r.ok) return { booked: false, failure: null };
    return { booked: r.data.booked.length > 0, failure: r.data.failures[0] ?? null };
  }

  const therapistConflicts = conflicts?.filter((c) => c.kind === "therapist") ?? [];
  const roomConflicts = conflicts?.filter((c) => c.kind === "room") ?? [];
  const availabilityConflicts = conflicts?.filter((c) => c.kind === "availability") ?? [];
  const timeOffConflicts = conflicts?.filter((c) => c.kind === "time_off") ?? [];

  // NESA contraindication warning (W2-08, ruling A): SOFT — names the matched
  // contraindication(s) when the patient has any AND the service is sensitive.
  // Never blocks submit.
  const serviceSensitive = !!options.services.find((o) => o.id === form.serviceId)?.contraindicationSensitive;
  const nesaMatched = matchedContraindications(patientCI, serviceSensitive);
  const NESA_LABEL: Record<(typeof nesaMatched)[number], StringKey> = {
    epilepsy: "patients.fieldContraindicationEpilepsy",
    pregnancy: "patients.fieldContraindicationPregnancy",
    pacemaker: "patients.fieldContraindicationPacemaker",
  };

  return (
    <>
    <Drawer
      open
      onClose={onClose}
      dirty={dirty}
      discard={{
        title: s["appointment.discardTitle"],
        message: s["appointment.discardMessage"],
        confirmLabel: s["appointment.discardConfirm"],
        cancelLabel: s["appointment.discardKeep"],
      }}
      title={editing ? s["appointment.editTitle"] : s["appointment.newTitle"]}
      closeLabel={s["appointment.close"]}
      cancelLabel={s["common.cancel"]}
      confirmLabel={conflicts ? s["appointment.saveAnyway"] : s["appointment.save"]}
      confirmVariant={conflicts ? "destructive" : "primary"}
      confirmLoading={submitting}
      onConfirm={() => void submit(!!conflicts)}
    >
      <div className="flex flex-col gap-4">
        {editing && isRecurring && (
          <Field label={s["appointment.applyTo"]}>
            <div role="radiogroup" aria-label={s["appointment.applyTo"]} className="flex flex-col gap-1">
              {SCOPE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="radio" name="scope" checked={form.scope === o.value} onChange={() => set("scope", o.value)} />
                  {s[o.key]}
                </label>
              ))}
            </div>
          </Field>
        )}

        {/* Manual label (the Combobox does not consume Field context, which is
            an existing component this wave may not change). */}
        <div className="flex flex-col gap-2">
          <label htmlFor="appt-patient" className="text-xs font-medium text-text-primary">
            {s["appointment.patient"]}
            <span aria-hidden="true" className="text-error"> *</span>
          </label>
          {patientLocked ? (
            // W6-03: deep-link flow. The patient is fixed. Show it read-only so
            // the user only picks therapist + date/time. The id is already in the
            // form state (init from lockedPatient.value), which is what submit uses.
            <div
              id="appt-patient"
              aria-readonly="true"
              className="flex items-center rounded border border-border-strong bg-surface-muted px-3 py-2 text-sm text-text-primary"
            >
              {lockedPatient?.label}
            </div>
          ) : (
            <Combobox
              id="appt-patient"
              options={patientOptions}
              value={form.patientId || null}
              onChange={(v) => set("patientId", v)}
              query={patientQuery}
              onQueryChange={setPatientQuery}
              loading={patientLoading}
              placeholder={s["appointment.patientTypeToSearch"]}
              emptyLabel={s["appointment.patientSearchEmpty"]}
            />
          )}
        </div>

        {/* Booking form order (W3-03, DECISIONS 2026-07-05): Terapeuta FIRST,
            Serviço immediately below it. Serviço auto-selects from the
            therapist's default service (see the effect above) and stays
            editable for per-booking exceptions. */}
        <Field label={s["appointment.therapist"]} required>
          {selfLocked ? (
            // PL-10: a therapist self-books. The practitioner is forced to
            // themselves (form.practitionerId = own id, set on open) and the
            // selector is replaced by a static, read-only label of their own
            // name — they cannot book for anyone else. The id is already in form
            // state (init), which is what submit sends. data-practitioner-id
            // surfaces that forced value for the component test (no effects run
            // in a static render, so state must be visible in the markup).
            <div
              aria-readonly="true"
              data-practitioner-id={form.practitionerId}
              className="flex items-center rounded border border-border-strong bg-surface-muted px-3 py-2 text-sm text-text-primary"
            >
              {selfTherapistName}
            </div>
          ) : (
            <>
              {/* W12-23: options scoped to the selected location's team. */}
              <Select
                value={form.practitionerId}
                onChange={(e) => {
                  userChangedTherapist.current = true;
                  set("practitionerId", e.target.value);
                }}
              >
                <option value="">{s["appointment.selectTherapist"]}</option>
                {therapistOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
              {noTherapistsAtLocation && (
                <p className="mt-1 text-xs text-v2-text-secondary">
                  {s["appointment.noTherapistsAtLocation"]}
                </p>
              )}
            </>
          )}
        </Field>

        <Field label={s["appointment.service"]}>
          {/* Locked to the pack's base service while a pack is selected (W8-01c). */}
          <Select
            value={form.serviceId}
            disabled={!!form.packId}
            onChange={(e) => onServiceChange(e.target.value)}
          >
            <option value="">{s["appointment.selectService"]}</option>
            {serviceOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>

        {/* PACK-02 — the unprompted half. The Select below answers a question
            reception has to think to ask; this says the answer before anybody
            asks, because the cost of not asking lands on the patient, who pays
            twice for a session they already own. Hidden once a pacote IS
            chosen: at that point the balance Banner below is the live number
            and two counts on one screen invite the one that is stale. */}
        {!editing && !form.packId && (
          <PackAvailableNotice packs={availablePacks} onUse={onPackChange} />
        )}

        {/* Pacote (W8-01c) — create-only bookable type. Selecting a pack forces
            its base service (above) and registers/decrements a patient session at
            booking. Only packs offered at the chosen location are listed. */}
        {!editing && packOptions.length > 0 && (
          <Field label={s["appointment.pack"]}>
            <Select value={form.packId} onChange={(e) => onPackChange(e.target.value)}>
              <option value="">{s["appointment.noPack"]}</option>
              {packOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </Field>
        )}
        {!editing && selectedPack && form.patientId && (
          <Banner tone="info">
            {packBalance
              ? `${s["appointment.packRemaining"]}: ${packBalance.sessionsAvailable}/${packBalance.sessionsTotal}`
              : `${s["appointment.packNew"]} (${selectedPack.sessionCount} ${s["appointment.packSessions"]})`}
          </Banner>
        )}

        {/* ==================================================================
            RB-02b — BOOK N SESSIONS OF THIS PACOTE, EVERY SLOT HAND-PICKED.
            ==================================================================
            NO WEEKDAY PICKER, NO EVERY-N-WEEKS, NO GENERATOR, by owner ruling.
            A pacote spread on a fixed cadence commits a patient to a weekday for
            months, and how far apart the sessions should be is a clinical
            decision the clinic makes per patient (Q-RB-02-1). So this offers a
            COUNT and then N date/time pickers, and nothing that could impose a
            rhythm.

            THE COUNT IS CAPPED AT THE BALANCE and editable DOWNWARDS: booking
            four now and the rest as the treatment progresses is the ordinary
            case, not an edge one. Over-booking is refused by name on the server
            as well - this input is a courtesy, not the boundary.

            ==================================================================
            IT DOES NOT WAIT FOR A PATIENT. Owner ruling 2026-08-21.
            ==================================================================
            This was gated on `form.patientId` and the owner selected a pacote
            before picking a patient, so nothing appeared and the feature read as
            missing. The ruling: selecting a pacote of N reveals N slot pickers
            in BOTH cases - a pacote the patient already HOLDS and one being
            ASSIGNED now - because pacotes are booked in advance, never consumed
            one appointment at a time.

            SO THE CEILING HAS TWO SOURCES AND THEY ARRIVE AT DIFFERENT TIMES:
            the pacote's own `sessionCount` immediately, and the held
            instance's remaining balance once a patient is chosen and the
            balance query lands. `packSessionsAvailable` prefers the balance
            when it exists, which means the count can TIGHTEN after a patient is
            picked. That is correct and it is why `setPackCount` clamps on every
            change rather than trusting the input's max attribute.

            THE ASSIGN-NOW PATH NEEDS NO NEW TRANSACTION WORK, verified rather
            than assumed: `bookPackSessionTx` registers the instance INSIDE the
            booking transaction when none exists, so the instance and its N
            appointments commit or roll back together. A batch that half-created
            an instance was never reachable. */}
        {!editing && selectedPack && packSessionsAvailable !== null && (
          <div className="flex flex-col gap-3 rounded-v2 border border-border-strong p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={s["pack.batchCount"]}>
                <Input
                  type="number"
                  min={1}
                  max={packSessionsAvailable}
                  data-testid="pack-batch-count"
                  value={String(packSlots.length || 1)}
                  onChange={(e) => setPackCount(Number(e.target.value))}
                />
              </Field>
              <p className="flex-1 text-xs text-text-secondary">
                {s["pack.batchHint"].replace("{n}", String(packSessionsAvailable))}
              </p>
            </div>

            {packSlots.length > 1 && (
              <ul className="flex flex-col gap-2">
                {packSlots.map((row, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-6 text-xs text-text-secondary">{i + 1}.</span>
                    <div className="w-44">
                      <DatePicker
                        value={row.date}
                        onChange={(d) =>
                          setPackRows((rs) => rs.map((r, j) => (j === i ? { ...r, date: d } : r)))
                        }
                        triggerLabel={s["lote.rowDate"]}
                        prevMonthLabel={s["calendar.previousMonth"]}
                        nextMonthLabel={s["calendar.nextMonth"]}
                      />
                    </div>
                    <TimeField
                      value={row.time}
                      onChange={(v) =>
                        setPackRows((rs) => rs.map((r, j) => (j === i ? { ...r, time: v } : r)))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Optional secondary participants (W4-19) — de-emphasized, create-only.
            Primary-only semantics: these are linked DISPLAY data and never affect
            availability, conflicts, the Serviço/Localização auto-selects,
            analytics, the AI-recording pair, or the Estado axes. */}
        {!editing && (
          <details
            className="rounded-v2 border border-border-strong p-3"
            onToggle={(e) => setSecondaryOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-xs font-medium text-text-secondary [&::-webkit-details-marker]:hidden">
              {s["appointment.secondaryParticipants"]}
            </summary>
            {/* Inner fields mount ONLY when opened, so the "Terapeuta 2"/"Paciente 2"
                controls are absent from the DOM by default and never collide with
                the primary Terapeuta/Paciente selectors used across the e2e suite. */}
            {secondaryOpen && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="appt-patient-2" className="text-xs font-medium text-text-primary">
                  {s["appointment.patientTwo"]}
                </label>
                <Combobox
                  id="appt-patient-2"
                  options={patientTwoOptions}
                  value={form.patientTwoId || null}
                  onChange={(v) => set("patientTwoId", v ?? "")}
                  query={patientTwoQuery}
                  onQueryChange={setPatientTwoQuery}
                  loading={patientTwoLoading}
                  placeholder={s["appointment.patientTypeToSearch"]}
                  emptyLabel={s["appointment.patientSearchEmpty"]}
                />
              </div>
              <Field label={s["appointment.therapistTwo"]}>
                <Select
                  value={form.practitionerTwoId}
                  onChange={(e) => set("practitionerTwoId", e.target.value)}
                >
                  <option value="">{s["appointment.selectTherapist"]}</option>
                  {options.therapists.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            )}
          </details>
        )}

        {/* NESA contraindication warning (W2-08) — soft, never blocks submit. */}
        {nesaMatched.length > 0 && (
          <Banner tone="warning">
            {s["appointment.nesaWarning"]}: {nesaMatched.map((k) => s[NESA_LABEL[k]]).join(", ")} (
            {s["appointment.nesaServiceSensitive"]})
          </Banner>
        )}

        <Field label={s["appointment.room"]}>
          {/* autoComplete off: Chrome heuristically fills this with a saved
              email when the drawer opens (QA 2026-07-12, reproduced twice). */}
          <Input autoComplete="off" value={form.room} onChange={(e) => set("room", e.target.value)} />
        </Field>

        {/* PL-14: with a single reachable location there is nothing to choose -
            the form already defaults to it (options.locations[0]), so the Select
            becomes a read-only line. The value still travels in `form.locationId`
            and the server re-checks it, exactly as when the Select was shown. */}
        {/* STAFF-02: the list is the actor's BOOKABLE locations, not the agenda's
            viewable ones. Exactly one assigned -> the PL-14 branch below already
            renders a locked read-only line, which is the ruled behaviour with no
            new code. Several -> a restricted dropdown. Owner -> unrestricted,
            because bookingLocationScope returns null for them.

            THE SERVER RE-CHECKS IT REGARDLESS. This list is the courtesy; the
            refusal in createAppointment / batchScheduleAppointments /
            rescheduleAppointment is the control. A UI-only lock is the INC-08
            root cause repeated. */}
        {options.bookableLocations.length === 1 ? (
          <Field label={s["header.location"]}>
            <p data-testid="appointment-fixed-location" className="text-sm text-v2-text-primary">
              {options.bookableLocations[0]!.label}
            </p>
          </Field>
        ) : (
        <Field label={s["header.location"]} required>
          <Select
            value={form.locationId}
            onChange={(e) => {
              userChangedLocation.current = true;
              const newLoc = e.target.value;
              // W8-01c — a selected pack that isn't offered at the new location is
              // cleared (packs are location-scoped; null = all locations).
              setForm((f) => {
                const pack = options.packs.find((p) => p.id === f.packId);
                const packOk = !pack || pack.locationId === null || pack.locationId === newLoc;
                return { ...f, locationId: newLoc, packId: packOk ? f.packId : "" };
              });
            }}
          >
            <option value="">{s["appointment.selectLocation"]}</option>
            {options.bookableLocations.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>
        )}

        <div className="flex flex-wrap gap-3">
          <Field label={s["appointment.date"]} required>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label={s["appointment.time"]} required>
            <TimeField value={form.time} onChange={(v) => set("time", v)} />
          </Field>
          <Field label={s["appointment.duration"]}>
            <Select value={String(form.durationMin)} onChange={(e) => set("durationMin", Number(e.target.value))}>
              {[...new Set([...DURATIONS, form.durationMin])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>{d} {s["appointment.minutesSuffix"]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <AvailabilityPanel
          therapistId={form.practitionerId}
          date={form.date}
          locationId={form.locationId}
          durationMin={form.durationMin}
          time={form.time}
          onPickTime={(hhmm) => set("time", hhmm)}
        />

        {/* Agendar lote (W2-10) — replaces the V1 recorrente control. Hidden while
            a pack is selected (W8-01c): a pack booking is single-session. */}
        {!editing && !form.packId && (
          <div className="flex flex-col gap-3">
            <Checkbox
              label={s["lote.checkbox"]}
              checked={loteMode}
              onChange={(e) => {
                setLoteMode(e.target.checked);
                if (!e.target.checked) setLoteRows([]);
              }}
            />
            {loteMode && (
              <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-3">
                {/* PL-21: weekday picker. Ticking nothing keeps the pre-PL-21
                    behaviour (repeat the form date's own weekday), so the panel
                    is not harder to use for the simple weekly case. Rendered in
                    clinical week order, Monday first. */}
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-xs font-medium text-text-primary">
                    {s["lote.weekdays"]}
                  </legend>
                  <div className="flex flex-wrap gap-1" data-testid="lote-weekdays">
                    {LOTE_WEEKDAYS.map(({ value, key }) => {
                      const on = loteWeekdays.includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setLoteWeekdays((prev) =>
                              prev.includes(value)
                                ? prev.filter((w) => w !== value)
                                : [...prev, value],
                            )
                          }
                          className={`h-9 min-w-12 rounded border px-2 text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                            on
                              ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                              : "border-border-strong text-text-secondary hover:bg-surface-muted"
                          }`}
                        >
                          {s[key].slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-wrap items-end gap-3">
                  <Field label={s["lote.everyWeeks"]}>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={String(loteEveryWeeks)}
                      onChange={(e) => setLoteEveryWeeks(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </Field>
                  {/* PL-21: "termina após N marcações" OR "termina numa data".
                      Rodica books both ways - a 10-session plan, and a block
                      that runs until the patient's holiday. */}
                  <Field label={s["lote.endMode"]}>
                    <Select
                      value={loteEndMode}
                      aria-label={s["lote.endMode"]}
                      onChange={(e) => setLoteEndMode(e.target.value as LoteEnd["kind"])}
                    >
                      <option value="count">{s["lote.endAfterCount"]}</option>
                      <option value="until">{s["lote.endOnDate"]}</option>
                    </Select>
                  </Field>
                  {loteEndMode === "count" ? (
                    <Field label={s["lote.count"]}>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={String(loteCount)}
                        onChange={(e) => setLoteCount(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </Field>
                  ) : (
                    <Field label={s["lote.until"]}>
                      <Input
                        type="date"
                        value={loteUntil}
                        data-testid="lote-until"
                        onChange={(e) => setLoteUntil(e.target.value)}
                      />
                    </Field>
                  )}
                  <button
                    type="button"
                    data-testid="lote-generate"
                    onClick={() =>
                      setLoteRows(
                        generateLoteSchedule({
                          from: form.date,
                          weekdays: loteWeekdays,
                          everyWeeks: loteEveryWeeks,
                          end:
                            loteEndMode === "until"
                              ? { kind: "until", date: loteUntil }
                              : { kind: "count", count: loteCount },
                        }).map((date) => ({ date, time: form.time })),
                      )
                    }
                    className="h-10 rounded border border-brand-teal px-3 text-sm font-medium text-brand-teal hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    {s["lote.generate"]}
                  </button>
                </div>

                {loteRows.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-text-secondary">
                      {loteRows.length} {s["lote.summaryCount"]}
                    </span>
                    <ul className="flex flex-col gap-2">
                      {/* Per-row DATE + TIME (W5-05): the weekly generator seeds
                          the rows; each date is an editable per-row override on
                          top (same DatePicker primitive as the agenda header).
                          Editing a row recomposes ONLY that row's startsAt at
                          submit (buildLoteSlots: Lisbon wall-clock -> UTC).
                          Index key: dates are user-editable (duplicates possible
                          mid-edit) and rows are only ever replaced wholesale by
                          "Gerar datas", never inserted/removed individually. */}
                      {loteRows.map((row, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                          <div className="w-44">
                            <DatePicker
                              value={row.date}
                              onChange={(d) =>
                                setLoteRows((rs) =>
                                  rs.map((r, j) => (j === i ? { ...r, date: d } : r)),
                                )
                              }
                              triggerLabel={s["lote.rowDate"]}
                              prevMonthLabel={s["calendar.previousMonth"]}
                              nextMonthLabel={s["calendar.nextMonth"]}
                            />
                          </div>
                          <TimeField
                            value={row.time}
                            onChange={(v) =>
                              setLoteRows((rs) =>
                                rs.map((r, j) => (j === i ? { ...r, time: v } : r)),
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lifecycle "Estado" — edit-only. A NEW marcação is always created with
            the house defaults (status = scheduled via the form init above,
            confirmation_state = pending via the DB default); the selector is
            hidden on create so the two axes are never set by hand at booking
            time. It stays on edit, where marking completed/cancelled/no_show is
            the point. Never conflated with the orthogonal confirmation axis
            below. */}
        {editing && (
          <Field label={s["appointment.status"]}>
            <Select value={form.status} onChange={(e) => set("status", e.target.value as AppointmentStatusValue)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{s[o.key]}</option>
              ))}
            </Select>
          </Field>
        )}

        {/* Confirmation axis (0024) — read-only display, ORTHOGONAL to the
            "Estado" lifecycle Select above. Never derived from `form.status`
            and never edited here (BACKLOG specs a display only, no edit
            control); shown separately so the two are never visually or
            semantically conflated. Manual label, same reasoning as the
            patient Combobox above: not a Field-wrapped form control. */}
        {editing && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-primary">{s["appointment.confirmation"]}</span>
            <ConfirmationIndicator state={editing.confirmationState} showLabel />
            {editing.confirmationReceivedAt && (
              <p className="text-xs text-text-secondary">
                {s["appointment.confirmationReceivedAt"]}{": "}
                {new Date(editing.confirmationReceivedAt).toLocaleString("pt-PT")}
                {editing.confirmationChannel ? ` · ${editing.confirmationChannel}` : ""}
              </p>
            )}
          </div>
        )}

        {/* PACK-01 — attach an EXISTING appointment to a pacote the patient
            already holds. Edit-only: on create the pacote is chosen up front
            and `bookPackSessionTx` attaches it inside the booking transaction.
            The panel is a PURE component (pack-link-panel.tsx) so its three
            outcomes can be render-tested; this file only fetches and links. */}
        {editing && packLink && (
          <PackLinkPanel
            view={packLink}
            busyInstanceId={packLinkBusy}
            error={packLinkError}
            onLink={(id) => void linkPack(id)}
          />
        )}

        {/* No-note indicator (W2-04): a completed visit with no per-visit note.
            Present-state read (editing.hasNote); clears once a note is added. */}
        {editing && editing.status === "completed" && !editing.hasNote && (
          <StatusChip tone="warning">{s["appointment.noNote"]}</StatusChip>
        )}

        {/* Audit provenance (W9-06, item 10): who created the marcacao and when.
            createdByName is NULL for a portal booking (no staff users row) - the
            owner-ruled label "Reserva online (portal)" stands in for the name,
            never blank. createdAt is the row insert time, in Lisbon locale. */}
        {editing && (
          <p className="text-xs text-text-secondary">
            {s["appointment.createdBy"]}{": "}
            {editing.createdByName ?? s["appointment.createdByPortal"]}
            {" · "}
            {new Date(editing.createdAt).toLocaleString("pt-PT")}
          </p>
        )}

        {/* THE APPOINTMENT ID, READABLE AND SELECTABLE.
            ============================================================
            WHY IT IS ON THE SCREEN AT ALL, since nothing on this drawer reads
            it back. /admin/messaging-check takes an OPTIONAL appointment id,
            and with one the confirm code it sends is REAL and the link confirms
            that appointment - which is the only way to exercise the whole round
            trip on a handset. There was nowhere in the product to obtain one:
            the id exists in the agenda card's `data-appointment-id` attribute,
            which is a test handle, so the owner's own delivery test could only
            ever be run in its sample mode.

            IT IS NOT SECRET AND IT IS INERT. This drawer already renders the
            patient's name, the practitioner and the times to the same viewer,
            and RLS decides what reaches the page at all; nothing reads this
            value back, so no behaviour depends on it being displayed. Same
            reasoning the agenda card's attribute carries.

            `select-all` and `font-mono` are the whole of the affordance: one
            click selects the id, and a monospace run makes a mistyped character
            visible. No copy BUTTON, because a clipboard write is a permission
            prompt and a failure path for a line that is read far more often
            than it is copied. */}
        {editing && (
          <p className="text-xs text-text-secondary">
            {s["appointment.idLabel"]}{": "}
            <span data-testid="drawer-appointment-id" className="select-all font-mono">
              {editing.id}
            </span>
          </p>
        )}

        {/* PL-16 — notes are a THREAD, not one overwritable box. On an existing
            marcacao the board renders every note with its author + timestamp and
            an "Adicionar nota" button above them: this is the reception <-> therapist
            channel, so nothing is ever replaced. On CREATE there is no appointment
            row yet to hang notes on, so the first note stays a plain field and is
            written as note one by createAppointment. */}
        {editing ? (
          <AppointmentNotesBoard appointmentId={editing.id} />
        ) : (
          <Field label={s["appointment.notes"]}>
            <Textarea autoComplete="off" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
        )}

        {conflicts && (
          <Banner tone="warning">
            <span className="flex flex-col gap-1">
              {therapistConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictTherapist"]} items={therapistConflicts} />}
              {roomConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictRoom"]} items={roomConflicts} />}
              {availabilityConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictAvailability"]} items={availabilityConflicts} />}
              {timeOffConflicts.length > 0 && <ConflictLine heading={s["agenda.conflictTimeOff"]} items={timeOffConflicts} />}
            </span>
          </Banner>
        )}

        {error && (
          <p role="alert" className="text-sm text-error">{error}</p>
        )}

        {/* W5-22: "Ficha do paciente" — read-only navigation from the marcação
            edit view to the patient profile(s). Primary always; a second link
            when Paciente 2 is linked. No data change. */}
        {editing && (
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/patients/${editing.patientId}`)}
            >
              {s["appointment.patientRecordLink"]}
            </Button>
            {editing.patientTwoId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/patients/${editing.patientTwoId}`)}
              >
                {s["appointment.patientTwoRecordLink"]}
              </Button>
            )}
          </div>
        )}

        {/* Password-gated hard delete (W3-06) — edit-only, admin-only. */}
        {editing && canHardDelete && (
          <div className="mt-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeletePw("");
                setDeleteErr(null);
                setDeleteOpen(true);
              }}
            >
              {s["appointment.delete"]}
            </Button>
          </div>
        )}
      </div>
    </Drawer>
    {batchFailures && (
      <BatchFailureDialog
        bookedCount={batchFailures.bookedCount}
        failures={batchFailures.failures}
        onRebook={rebookSlot}
        onClose={() => {
          setBatchFailures(null);
          succeed();
        }}
      />
    )}
    {editing && canHardDelete && (
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={s["appointment.delete"]}
        message={s["appointment.deletePasswordPrompt"]}
        confirmVariant="destructive"
        confirmLabel={s["appointment.deleteConfirm"]}
        confirmLoading={deleting}
        cancelLabel={s["common.cancel"]}
        onConfirm={() => {
          void doHardDelete();
        }}
      >
        <div className="flex flex-col gap-2">
          <Input
            type="password"
            value={deletePw}
            onChange={(e) => setDeletePw(e.target.value)}
            aria-label={s["appointment.deletePasswordLabel"]}
          />
          {deleteErr && <p role="alert" className="text-sm text-error">{deleteErr}</p>}
        </div>
      </Dialog>
    )}
    </>
  );
}

const TIME_OFF_REASON_KEY: Record<string, StringKey> = {
  vacation: "appointment.timeOffReasonVacation",
  sick: "appointment.timeOffReasonSick",
  holiday: "appointment.timeOffReasonHoliday",
  other: "appointment.timeOffReasonOther",
};

function ConflictLine({ heading, items }: { heading: string; items: ConflictInfo[] }) {
  return (
    <span className="block">
      <span className="font-medium">{heading}</span>
      {": "}
      {items
        .map((c) => {
          const lead = c.patientName ?? (c.reason ? s[TIME_OFF_REASON_KEY[c.reason] ?? "appointment.timeOffReasonOther"] : null);
          const prefix = [lead, c.room].filter(Boolean).join(" · ");
          const time = `${formatTimeOfDay(new Date(c.startsAt))}-${formatTimeOfDay(new Date(c.endsAt))}`;
          return prefix ? `${prefix}: ${time}` : time;
        })
        .join("; ")}
    </span>
  );
}
