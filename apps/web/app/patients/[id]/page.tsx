import { can } from "@osteojp/auth";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  StatusChip,
  type StatusTone,
} from "@osteojp/ui";
import { ChevronDown, ChevronLeft, FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRequestContext } from "../../../lib/auth/context";
import { listActiveTemplates, type RecordStatus } from "../../../lib/clinical/records";
import { listFichaRecords } from "../../../lib/clinical/ficha-groups";
import { addEvaluationTarget, groupForFicha } from "../../../lib/clinical/ficha-groups-core";
import { listOpenAppEpisodes } from "../../../lib/clinical/episodes";
import { mayOpenEpisode } from "../../../lib/clinical/episode-open-core";
import { pickEpisodeToReuse } from "../../../lib/clinical/episode-reuse-core";
import { EPISODE_SPECIALTIES, isEpisodeSpecialty } from "../../../lib/clinical/episode-title";
import { listActiveLocations, listInvoices, type InvoiceStatus } from "../../../lib/invoices/queries";
import { formatPatientNumber } from "../../../lib/patients/format";
import { isFichaIncomplete } from "../../../lib/patients/nif";
import { NO_SMS_MESSAGE_KEY } from "../../../lib/patients/phone-preview";
import { noSmsReason } from "@osteojp/notify";
import { getPatient, getPatientHardDeleteBlockers } from "../../../lib/patients/queries";
import { getLatestRgpdAcceptance } from "../../../lib/patients/rgpd-acceptance";
import { listPatientDocuments } from "../../../lib/patients/documents";
import type { Patient } from "../../../lib/patients/types";
import { getAgendaOptions, listPatientAppointments } from "../../../lib/scheduling/data";
import { addDays, lisbonMidnightUtc } from "../../../lib/scheduling/time";
import type { AppointmentStatusValue } from "../../../lib/scheduling/types";
import { MarcacoesFilters } from "./marcacoes-filters.client";
import {
  canonicalMarcacoesSearch,
  type MarcacoesFilterValues,
} from "../../../lib/scheduling/marcacoes-search";
import { POPSTATE_CAPTURE_SCRIPT, UrlIsAuthoritative } from "./url-authoritative.client";
import { bookingLocationScope } from "../../../lib/auth/viewer-locations";
import { ownCancelRefusal } from "../../../lib/scheduling/cancel-authority";
import { listPatientPackInstances } from "../../../lib/packs/instances";
import { listPatientNotes } from "../../../lib/patients/note-revisions";
import { NotesComposer } from "./notes-composer";
import { NotesTab } from "./notes-tab";
import { PatientActions } from "../_components/patient-actions";
import { versionRecordAction } from "../../clinical/[id]/actions";
import { createRecordAction } from "../../clinical/new/actions";
import { AddEvaluationButton } from "./add-evaluation-button";
import { AddEpisodeButton } from "./add-episode-button";
import { FocusOnArrive } from "./focus-on-arrive.client";
import { RecordLifecycleActions } from "./record-lifecycle-actions";
import { AppointmentsList } from "./appointments-list";
import { PatientPacks } from "./patient-packs";
import { createEpisodeAction } from "./episode-actions";
import { ProfileTabs } from "./profile-tabs";
import { PatientDocuments } from "./PatientDocuments";
import { DeclaracaoDialog, type DeclaracaoAppointment } from "./DeclaracaoDialog";
import { listDeclaracaoLocations } from "../../../lib/clinical/declaracao/declaracao-locations";
import { listGuestIntakesForPatient } from "../../../lib/guest-intake/queries";
import { toGuestIntakeDisplay } from "../../../lib/guest-intake/view";
import { GuestIntakeAnswers } from "../../../components/guest-intake-answers";
// CARE-01: the therapists reception has assigned to this patient.
import { listCareTeam, listCareTeamForTherapist } from "../../../lib/admin/care-team";
import { labelCareTeamCard, staffLabelContext } from "../../../lib/scheduling/staff-options";
import { CareTeamCard } from "./care-team-card";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const ghostLink =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

const RECORD_TONE: Record<RecordStatus, StatusTone> = {
  draft: "neutral",
  locked: "info",
  signed: "success",
};
const RECORD_KEY = {
  draft: "clinical.statusDraft",
  locked: "clinical.statusLocked",
  signed: "clinical.statusSigned",
} as const;

const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  draft: "neutral",
  issued: "warning",
  paid: "success",
  void: "error",
};
const INVOICE_STATUS_KEY: Record<InvoiceStatus, keyof typeof s> = {
  draft: "invoicing.statusDraft",
  issued: "invoicing.statusIssued",
  paid: "invoicing.statusPaid",
  void: "invoicing.statusVoid",
};

/** A uuid's shape: the only form of `episodio` the Registos tab reads. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
// EPI-01a: an evaluation's DATE, in Lisbon. An imported row's created_at is the
// evaluation date at Lisbon midnight stored as UTC, so a formatter without a time
// zone would show the day before for every summer evaluation on a UTC server.
const evalDateFmt = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
// SPEC-ficha-medica.md sec 4: record created_at shown in Europe/Lisbon.
const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function PatientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // U1: the Marcações filters live in the URL, so a filtered ficha is a link,
  // the back button returns to the previous filter and a reload keeps it. Every
  // one of them is read by the SERVER and turned into a WHERE clause.
  searchParams: Promise<{
    tab?: string;
    m?: string;
    anulados?: string;
    de?: string;
    ate?: string;
    estado?: string;
    terapeuta?: string;
    clinica?: string;
    servico?: string;
    semnota?: string;
    ordem?: string;
    // EPI-01b, piece 2: where "+ Episódio" lands. `episodio` is the episode it
    // opened; `esp` is the specialty it was asked for when one is already open.
    episodio?: string;
    esp?: string;
  }>;
}) {
  const { id } = await params;
  const {
    tab: tabParam,
    m,
    anulados,
    de,
    ate,
    estado,
    terapeuta,
    clinica,
    servico,
    semnota,
    ordem,
    episodio,
    esp,
  } = await searchParams;
  // W5-30: the "Mostrar anulados" toggle (default off) surfaces annulled fichas.
  const showAnnulled = anulados === "1";

  const ctx = await getRequestContext();
  if (!ctx) {
    return (
      <main className="py-16 text-center">
        <p className="text-sm text-text-secondary">{s["common.signIn"]}</p>
      </main>
    );
  }

  // CARE-02a: the ficha is a READER, so a therapist on this patient's care team
  // opens it (0098). Every write reached from it keeps the narrow scope in its
  // own server action.
  const patient = await getPatient(id, { includeDeleted: true, access: "read" });
  if (!patient) notFound();

  // CARE-02a: may this viewer also ACT on the patient? A therapist on the care
  // team reads the ficha (0098) but writes only where they could before 0098,
  // which is the narrow scope getPatient applies by default. Every write
  // refuses on the server either way; this keeps the controls that would refuse
  // off the screen. One extra read, for a therapist only.
  const canActOnPatient =
    ctx.role !== "therapist" || (await getPatient(id, { includeDeleted: true })) !== null;

  // PL-15b: the patient's clinic, resolved for the identity line. Null when the
  // patient has none (pre-PL-15b registrations) - shown as absent, never guessed.
  const patientLocationName = patient.primaryLocationId
    ? ((await listActiveLocations(ctx)).find((l) => l.id === patient.primaryLocationId)?.name ??
      null)
    : null;

  // RGPD-01 — whether this patient's RGPD consent is on file. THE ABSENCE OF A
  // ROW IS THE ANSWER: every patient registered before this shipped has none,
  // so they read "RGPD em falta" without the migration touching a single row.
  const rgpdAcceptance = await getLatestRgpdAcceptance(ctx, patient.id);

  const canReadClinical = can(ctx.role, "clinical_records:read");
  // Documentos tab: every staff role can view/upload administrative patient
  // documents (patients:read to view, patients:write to upload) — this is an
  // administrative surface, not clinical_records.
  const canUploadDocuments = can(ctx.role, "patients:write") && canActOnPatient;
  const canInvoice = can(ctx.role, "invoices:read");
  // Consultas per-row edits (W5-09) REUSE the Agenda gates verbatim: reschedule
  // and Estado change need appointments:write; Cancel needs appointments:delete
  // (therapist can write but NOT cancel). These flags only shape the affordance;
  // each Agenda server action re-asserts its own capability server-side.
  const canEditAppointments = can(ctx.role, "appointments:write") && canActOnPatient;
  const canCancelAppointments = can(ctx.role, "appointments:delete");
  // SCHED-30 (owner dispatch 2026-09-14): a therapist cancels, and brings back,
  // the rows they are Terapeuta or Terapeuta 2 on, at their own clinics. Only the
  // affordance; cancelAppointment and updateAppointment re-check it.
  const canCancelOwnAppointments = !canCancelAppointments && can(ctx.role, "appointments:cancel_own");
  const canDelete = can(ctx.role, "patients:delete");
  const canStartEpisode = can(ctx.role, "clinical_records:author") && canActOnPatient;
  // Hard delete is Tenant-settings tier (W5-08), like appointment/staff delete.
  // The blockers read only drives the disabled affordance — the server action
  // re-enforces the password gate and every refuse guard.
  const canHardDelete = can(ctx.role, "settings:manage");
  const hardDeleteBlockers = canHardDelete
    ? await getPatientHardDeleteBlockers(patient.id)
    : null;
  const hardDeleteBlocked = hardDeleteBlockers?.hasClinicalRecords
    ? ("records" as const)
    : hardDeleteBlockers?.hasOtherReferences
      ? ("references" as const)
      : null;

  // Permission-filtered tabs. aria-controls links each tab button to its panel.
  const tabItems = [
    { value: "resumo", label: s["patients.tabSummary"], "aria-controls": "tabpanel-resumo" },
    { value: "consultas", label: s["patients.tabAppointments"], "aria-controls": "tabpanel-consultas" },
    { value: "notas", label: s["patients.tabNotes"], "aria-controls": "tabpanel-notas" },
    ...(canReadClinical ? [{ value: "registos", label: s["patients.tabRecords"], "aria-controls": "tabpanel-registos" }] : []),
    { value: "documentos", label: s["patients.tabDocuments"], "aria-controls": "tabpanel-documentos" },
    ...(canInvoice ? [{ value: "faturacao", label: s["patients.tabInvoicing"], "aria-controls": "tabpanel-faturacao" }] : []),
  ];
  const tab = tabItems.some((t) => t.value === tabParam) ? tabParam! : "resumo";

  // PL-31 — derived, never stored: no NIF and no exemption. Reachable via the
  // consultation quick-create, and true of every patient registered before the
  // rule existed.
  const nifIncomplete = isFichaIncomplete(patient);
  // PHONE-01 — null for a mobile or no phone; otherwise why SMS will not arrive.
  const noSms = noSmsReason(patient.phone);

  const personalRows: [string, string][] = [
    [s["patients.fieldDateOfBirth"], patient.dateOfBirth ? dateFmt.format(new Date(patient.dateOfBirth)) : "—"],
    [s["patients.fieldSex"], patient.sex ? formatSex(patient.sex) : "—"],
    // PL-31 — an exempted patient shows the exemption and its reason, never a
    // bare "—". A dash reads as "nobody filled this in yet"; this patient has
    // no NIF as a recorded, reasoned decision, and the row must say which.
    [
      s["patients.fieldNif"],
      patient.nifExempt
        ? `${s["patients.nifExemptBadge"]}${patient.nifExemptReason ? ` — ${patient.nifExemptReason}` : ""}`
        : (patient.nif ?? "—"),
    ],
    // patient_number is NOT NULL post-backfill (migration 0029); still rendered
    // defensively so the row is simply omitted rather than showing "—" if absent.
    ...(patient.patientNumber
      ? ([[s["patients.patientNumber"], formatPatientNumber(patient.patientNumber)]] as [string, string][])
      : []),
    // Contactos folded into Dados pessoais (one card instead of two). No field
    // dropped — phone/email relocated here from the old Contactos card.
    [s["patients.fieldPhone"], patient.phone ?? "—"],
    [s["patients.fieldEmail"], patient.email ?? "—"],
  ];
  // Street `address` is intentionally not surfaced (address-reduction direction,
  // 2026-06-30): localidade (city) + região are shown below instead. The DB
  // column is retained; historical data still lives there.
  if (patient.profession) personalRows.push([s["patients.fieldProfession"], patient.profession]);
  if (patient.city) personalRows.push([s["patients.fieldCity"], patient.city]);
  if (patient.region) personalRows.push([s["patients.fieldRegion"], patient.region]);
  // W5-11 — "Como nos conheceu?" referral source (staff-entered on intake).
  if (patient.referralSource)
    personalRows.push([s["patients.fieldReferralSource"], patient.referralSource]);
  // W5-21 — NESA contraindication flags (staff screening). Surface whichever are
  // set as one row (pacemaker MUST show; epilepsia/gravidez co-located for
  // consistency); omitted entirely when the patient carries none.
  const contraindications = [
    patient.contraindicationEpilepsy ? s["patients.fieldContraindicationEpilepsy"] : null,
    patient.contraindicationPregnancy ? s["patients.fieldContraindicationPregnancy"] : null,
    patient.contraindicationPacemaker ? s["patients.fieldContraindicationPacemaker"] : null,
    // W12-25: "Outra" shows its free-text note when present.
    patient.contraindicationOther
      ? patient.contraindicationOtherNote
        ? `${s["patients.fieldContraindicationOther"]}: ${patient.contraindicationOtherNote}`
        : s["patients.fieldContraindicationOther"]
      : null,
  ].filter((x): x is string => x !== null);
  if (contraindications.length > 0)
    personalRows.push([s["patients.contraindicationsLabel"], contraindications.join(", ")]);
  // Patient notes moved to the append-only Notas tab (W2-11); the profile
  // summary no longer reads patients.notes.

  // Registos clínicos: the same RLS + role-scoped reach as listRecords, with
  // each registo's episode (EPI-01a, lib/clinical/ficha-groups.ts), grouped the
  // way the Fisiozero ficha was (ficha-groups-core.ts: one group per specialty
  // for the imported history, one per app episode, and "Sem episódio").
  // W5-30: annulled fichas are hidden unless the "Mostrar anulados" toggle is on.
  const records =
    tab === "registos" && canReadClinical
      ? await listFichaRecords(ctx, { patientId: id, includeAnnulled: showAnnulled })
      : [];
  // EPI-01b, piece 2: "+ Episódio". A therapist who may write for this patient
  // (createEpisode asks the same on the server, whatever is drawn here).
  const canAddEpisode = canStartEpisode && mayOpenEpisode(ctx.role);
  // The patient's open app episodes, for a viewer who may write here: an
  // episode with no registo yet has no group of its own, and this is what
  // draws it, with "+ Avaliação" at hand.
  const openEpisodes =
    tab === "registos" && canStartEpisode ? await listOpenAppEpisodes(ctx, patient.id) : [];
  const recordGroups = groupForFicha(
    records,
    openEpisodes
      .filter((e) => e.empty)
      .map((e) => ({ id: e.id, title: e.title, openedAt: e.openedAt.toISOString() })),
  );
  // "+ Episódio" opened nothing because an episode of that specialty is open:
  // the one to show is R31's choice (the most recently opened), read again
  // here, never taken from the address. Nothing to show: no question.
  const confirmSpecialty =
    canAddEpisode && m === "episodioAberto" && isEpisodeSpecialty(esp) ? esp : null;
  const confirmEpisodeId = confirmSpecialty
    ? pickEpisodeToReuse(openEpisodes, {
        tenantId: ctx.tenantId,
        patientId: patient.id,
        specialty: confirmSpecialty,
      })
    : null;
  const confirmEpisode = openEpisodes.find((e) => e.id === confirmEpisodeId) ?? null;
  // "+ Episódio" opened this one: named only while it holds no registo yet.
  const openedId = typeof episodio === "string" && UUID_RE.test(episodio) ? episodio.toLowerCase() : null;
  const openedGroup =
    (openedId &&
      recordGroups.find((g) => g.kind === "episode" && g.episodeId === openedId && g.records.length === 0)) ||
    null;
  // EPI-01b (S-1002-D P2.2): "+ Avaliação" on a group files a new registo
  // through THE record-creation action (/clinical/new's createRecordAction, so
  // createDraftRecord: the patient scope, Q9's same-patient episode guard, the
  // audit row), with the template that form offers (Ficha Médica, the only
  // one). Shown to whoever sees "Nova ficha": an author (owner or therapist;
  // admin and reception hold no clinical_records:author) who may write for
  // this patient (a therapist: treats or created, which is 0097's INSERT
  // policy). Read only when a group will show it; no template, no button.
  const addEvaluationTemplateId =
    tab === "registos" && canStartEpisode && recordGroups.length > 0
      ? ((await listActiveTemplates(ctx))[0]?.id ?? null)
      : null;
  // INTAKE-01: the clinical questionnaire(s) this person answered at their first
  // online booking, reaching the ficha once reception converted the request to
  // this patient. Read-only, verbatim, attributed and dated. Every staff role
  // holds `guest_intake:read`; 0087's policy decides which rows come back (a
  // therapist only for a patient they see clinically). Empty until 0087 is
  // applied. It NEVER feeds the contraindication flags above: those are a
  // clinician's assertion, and these are the person's own words.
  const guestIntakes =
    tab === "resumo" && can(ctx.role, "guest_intake:read")
      ? await listGuestIntakesForPatient(ctx, patient.id)
      : [];
  // CARE-01 (ruling Q-CARE-1, 2026-09-16): the assigned therapists, and the
  // people reception can pick from. Gated on the capability BEFORE the call,
  // because `listCareTeam` asserts it and would throw rather than return empty -
  // the same shape the guest-intake fetch above uses.
  //
  // RECEPTION AND OWNER MANAGE IT, with Atribuir and Remover.
  //
  // CARE-02b, WIRED BY CARE-02a (0098): A THERAPIST SEES THE SAME LIST,
  // READ-ONLY, WHEN THEY CAN READ ALL OF IT. 0098's `patient_care_team_select`
  // admits a therapist to the whole live team of a patient whose team they are
  // on AT ONE OF THEIR OWN CLINICS (the owner's clinic limit), and to their own
  // rows. `listCareTeamForTherapist` returns null unless the patient is in that
  // clinic-limited set AND the list names the viewer, so the card appears only
  // when it is the real team: never for a therapist who is not on it, never for
  // one whose only readable row is their own, and never before 0098 is applied,
  // when the card would otherwise say "Nenhum terapeuta atribuido" about a
  // patient who has one.
  const canManageCareTeam = can(ctx.role, "care_team:manage");
  const therapistCareTeam =
    tab === "resumo" && !canManageCareTeam && ctx.role === "therapist"
      ? await listCareTeamForTherapist(ctx, patient.id)
      : null;
  const showCareTeam = canManageCareTeam || therapistCareTeam !== null;
  const careTeam =
    tab === "resumo" && canManageCareTeam
      ? await listCareTeam(ctx, patient.id)
      : (therapistCareTeam ?? []);
  const careTeamOptions =
    tab === "resumo" && showCareTeam ? await getAgendaOptions(ctx) : null;
  // NESA-SCOPE: members and picker are named as one list (labelCareTeamCard),
  // so two same-named machines on this card always read apart. Labels only.
  const careTeamLabels = careTeamOptions ? staffLabelContext(careTeamOptions) : null;
  // CARE-02c: each member carries how it got there and when, so the card can
  // label it and offer Remover on a manual entry only.
  const careTeamMembersRaw = careTeam.map((m) => ({
    userId: m.userId,
    fullName: m.fullName,
    source: m.source,
    assignedAt: m.assignedAt,
  }));
  // The read-only card offers no picker, so a therapist's card is named against
  // the roster alone and carries no candidates.
  const { candidates: careTeamCandidates, members: careTeamMembers } =
    careTeamLabels && careTeamOptions
      ? labelCareTeamCard(
          canManageCareTeam ? careTeamOptions.therapists : [],
          careTeamMembersRaw,
          careTeamLabels,
          careTeamOptions.allTherapists ?? careTeamOptions.therapists,
        )
      : {
          candidates: canManageCareTeam ? (careTeamOptions?.therapists ?? []) : [],
          members: careTeamMembersRaw,
        };
  // Faturação tab: fetch invoices for this patient when the tab is active.
  const patientInvoices = tab === "faturacao" && canInvoice ? await listInvoices(ctx, { patientId: id }) : [];
  // U1 — the Marcações filters, read from the URL and applied IN SQL.
  //
  // THE DATE BOUNDS ARE CONVERTED HERE, NOT IN THE QUERY. `starts_at` is a
  // timestamptz and the clinic thinks in Lisbon calendar days, so the page turns
  // "de 2026-09-01" into an instant and hands the data layer UTC. That keeps one
  // copy of the timezone rule, beside the one /marcacoes already uses, instead of
  // a second copy inside the read layer.
  //
  // `ate` IS INCLUSIVE TO THE READER AND EXCLUSIVE TO THE QUERY: the bound sent
  // is the start of the NEXT day, which is the only shape that includes every
  // instant of the last day without naming 23:59:59.999.
  const estadoValues = (estado ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e): e is AppointmentStatusValue =>
      (["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const).includes(
        e as AppointmentStatusValue,
      ),
    );
  const marcacoesFilters: MarcacoesFilterValues = {
    from: de ?? "",
    to: ate ?? "",
    estado: estadoValues,
    therapist: terapeuta ?? "",
    clinic: clinica ?? "",
    service: servico ?? "",
    semNota: semnota === "1",
    order: ordem === "antigas" ? "oldest" : "newest",
  };
  // Is a filter NARROWING the list? Drives the empty state's wording, so zero
  // rows can say "nothing matched these filters" instead of the false "this
  // patient has no appointments".
  //
  // `order` IS DELIBERATELY NOT PART OF THIS. Sorting changes nothing about
  // which rows come back, so a patient with no history who happens to have
  // picked "oldest first" must still be told they have no history.
  const marcacoesFiltered =
    Boolean(
      marcacoesFilters.from ||
        marcacoesFilters.to ||
        marcacoesFilters.therapist ||
        marcacoesFilters.clinic ||
        marcacoesFilters.service,
    ) ||
    marcacoesFilters.estado.length > 0 ||
    marcacoesFilters.semNota;
  // The three dropdowns. Same 60s-cached reference read the Notas tab already
  // uses; fetched only when the tab that renders them is the one being shown.
  // NESA-SCOPE: a therapist's Terapeuta list is narrowed to their own clinics,
  // so the id the URL is filtering by is kept in it, or the select would paint
  // its "all" option over a filtered list.
  const consultasOptions =
    tab === "consultas"
      ? await getAgendaOptions(ctx, null, { keepStaffId: marcacoesFilters.therapist || null })
      : { therapists: [], locations: [], bookableLocations: [], services: [], packs: [] };
  // Consultas tab: this patient's appointment history (Row 3 — schedule-again),
  // narrowed by whatever the URL asks for. No filter set = the whole history,
  // exactly as before.
  const patientAppointments =
    tab === "consultas"
      ? await listPatientAppointments(ctx, id, {
          fromUtc: marcacoesFilters.from ? lisbonMidnightUtc(marcacoesFilters.from) : null,
          toUtc: marcacoesFilters.to ? lisbonMidnightUtc(addDays(marcacoesFilters.to, 1)) : null,
          status: marcacoesFilters.estado,
          practitionerId: marcacoesFilters.therapist || null,
          locationId: marcacoesFilters.clinic || null,
          serviceId: marcacoesFilters.service || null,
          withoutNote: marcacoesFilters.semNota,
          order: marcacoesFilters.order,
        })
      : [];
  const ownCancelScope =
    canCancelOwnAppointments && patientAppointments.length > 0 ? await bookingLocationScope(ctx) : null;
  const ownCancelIds = canCancelOwnAppointments
    ? patientAppointments
        .filter((a) => ownCancelRefusal(ctx.userId, ownCancelScope, [a]) === null)
        .map((a) => a.id)
    : [];
  // Consultas tab: this patient's pack instances + remaining sessions (W8-01c).
  const patientPackInstances =
    tab === "consultas" ? await listPatientPackInstances(ctx, id) : [];
  // Notas tab: unified note history (W12-13) — appointment_notes (patient-level
  // + per-appointment) merged with the legacy patient_note_revisions (0030).
  const noteRevisions = tab === "notas" ? await listPatientNotes(ctx, id) : [];
  // PL-17: the appointment panel opened from a note is the shared
  // AppointmentDrawer, which needs the same reference data the agenda gives it.
  // Fetched only for the Notas tab (it is a 60s-cached read).
  const agendaOptions =
    tab === "notas" && noteRevisions.length > 0
      ? await getAgendaOptions(ctx)
      : { therapists: [], locations: [], bookableLocations: [], services: [], packs: [] };
  // Documentos tab: patient-level administrative documents (attachments with a
  // patient_id and no clinical_record_id). Tenant + role scoped in the query.
  const patientDocuments = tab === "documentos" ? await listPatientDocuments(ctx, id) : [];
  // W5-31: the Documentos tab's Declaração de Presença dialog prefills from the
  // patient's marcações (appointments:read; reception/therapist/admin all hold it).
  const declaracaoAppointments: DeclaracaoAppointment[] =
    tab === "documentos" && can(ctx.role, "appointments:read")
      ? (await listPatientAppointments(ctx, id)).map((a) => ({
          id: a.id,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          locationId: a.locationId,
          locationName: a.locationName,
        }))
      : [];
  // R45: a manual declaration has no marcação to take its location from, so the
  // dialog asks, over the active locations this staff member may act in.
  const declaracaoLocations = tab === "documentos" ? await listDeclaracaoLocations(ctx) : [];

  return (
    <main>
      <Link href="/patients" className={`${ghostLink} mb-4 inline-flex items-center gap-1`}>
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />{s["patients.back"]}
      </Link>

      {/* Header card */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text-secondary">
              {initials(patient.fullName)}
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl text-text-primary">{patient.fullName}</h1>
                {patient.mergedIntoId ? (
                  <StatusChip tone="neutral">{s["patients.mergedBadge"]}</StatusChip>
                ) : patient.deletedAt ? (
                  <StatusChip tone="error">{s["patients.deletedBadge"]}</StatusChip>
                ) : null}
                {/* RGPD-01 — shown ALONGSIDE the merged/deleted chip rather
                    than inside that ternary: those two are mutually exclusive
                    states of the record, this is an independent fact about it,
                    and a merged patient whose consent is missing is still
                    missing it. Warning, not error: nothing is broken and
                    nothing is blocked, there is a form still to collect. */}
                {!rgpdAcceptance ? (
                  <StatusChip tone="warning">{s["patients.rgpdMissingBadge"]}</StatusChip>
                ) : null}
              </div>
              <p className="text-sm text-text-secondary">{identityLine(patient, patientLocationName)}</p>
              <p className="text-sm text-text-secondary">{contactLine(patient)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* W6-03: deep-link into Agenda with the create drawer open and THIS
                patient preselected + locked (the user then picks only therapist +
                date/time). Mirrors the /clinical/new?patientId= precedent.
                CARE-02a: not for a read-only care-team viewer. The agenda's
                prefill and patient picker keep the narrow scope (booking
                rights are not in 0098), so the link would open an empty drawer. */}
            {canActOnPatient && (
              <Link href={`/agenda?novaMarcacaoPaciente=${id}`} className={primaryLink}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                {s["patients.newAppointment"]}
              </Link>
            )}
          </div>
        </div>
      </Card>

      {/* PL-31 — the ficha is short a NIF. Shown above the tabs, not inside the
          Dados pessoais card, because it applies to the whole record and to
          what can be issued from it, not just to one field's display. */}
      {nifIncomplete && (
        <div
          role="status"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="ficha-incompleta-nif"
        >
          <p className="font-medium">{s["patients.nifIncompleteWarning"]}</p>
          <p className="mt-1">{s["patients.nifIncompleteHelp"]}</p>
        </div>
      )}

      {/* PHONE-01 — an SMS will not reach the stored phone (a landline, a
          foreign number, or a value that is not a number at all). Derived from
          the stored value on every render, so it is right for imported free-text
          phones too. Beside the NIF notice for the same reason: it is about what
          the clinic can do with this record, not about one field's display. */}
      {noSms && (
        <div
          role="status"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="patient-no-sms-marker"
          data-reason={noSms}
        >
          <p className="font-medium">{s[NO_SMS_MESSAGE_KEY[noSms]]}</p>
        </div>
      )}

      <div className="mb-6">
        <ProfileTabs patientId={id} current={tab} items={tabItems} label={s["patients.tabSummary"]} />
      </div>

      {tab === "resumo" && (
        <div role="tabpanel" id="tabpanel-resumo" aria-label={s["patients.tabSummary"]}>
          {/* Single Dados pessoais card — Contactos (phone/email) folded in via
              personalRows above. One card instead of two. */}
          <div className="max-w-2xl">
            <Card
              title={s["patients.cardPersonal"]}
              headerAction={
                canActOnPatient ? (
                  <Link href={`/patients/${id}/edit`} className={ghostLink}>
                    <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                    {s["patients.editRecord"]}
                  </Link>
                ) : undefined
              }
            >
              <Rows rows={personalRows} />
            </Card>
            {/* INTAKE-01: the person's own answers from the online booking,
                read-only and dated. One card per converted request (ruling 1:
                a second booking adds a dated submission, never overwrites). */}
            {guestIntakes.length > 0 && (
              <section
                data-testid="ficha-guest-intakes"
                aria-label={s["guestIntake.fichaTitle"]}
                className="mt-6 flex flex-col gap-6"
              >
                {guestIntakes.map((intake) => (
                  <Card key={intake.guestBookingRequestId} title={s["guestIntake.fichaTitle"]}>
                    <GuestIntakeAnswers display={toGuestIntakeDisplay(intake)} />
                  </Card>
                ))}
              </section>
            )}
            {/* CARE-01: reception decides which therapists follow this patient.
                An assigned therapist reads the patient's whole appointment
                history, including the appointments with colleagues - which is
                the thing the clinic asked for. CARE-02a: a therapist on the
                team sees the same list, read-only (no Atribuir, no Remover). */}
            {showCareTeam && (
              <section className="mt-6" data-testid="ficha-care-team">
                <CareTeamCard
                  patientId={id}
                  locale={DEFAULT_LOCALE}
                  members={careTeamMembers}
                  candidates={careTeamCandidates}
                  error={canManageCareTeam && typeof m === "string" && m.startsWith("err")}
                  readOnly={!canManageCareTeam}
                />
              </section>
            )}
          </div>
        </div>
      )}

      {tab === "consultas" && (
        <div
          role="tabpanel"
          id="tabpanel-consultas"
          aria-label={s["patients.tabAppointments"]}
          className="flex flex-col gap-6"
        >
          {/* RB-02: no patientId and no canAdjust - the consumir/restaurar
              controls are gone, so there is nothing here to authorise and
              nothing to revalidate. */}
          <PatientPacks instances={patientPackInstances} />
          {/* U1: the history filters. Server-side: every control writes a URL
              param that becomes a WHERE clause, so a match is found whether or
              not it was already on screen. */}
          {/* U1 / Q-U1-1 — the URL is authoritative after Back and Forward.
              The inline script runs while the document is still parsing, which
              is the window the defect lives in: before hydration the client
              router answers a popstate by rewriting the URL to the payload it
              already holds, making zero server requests. The component below
              drains what the script recorded and re-asks the server for
              whatever the address bar actually says. */}
          <script dangerouslySetInnerHTML={{ __html: POPSTATE_CAPTURE_SCRIPT }} />
          <UrlIsAuthoritative search={canonicalMarcacoesSearch(marcacoesFilters)} />
          <MarcacoesFilters
            patientId={id}
            values={marcacoesFilters}
            therapists={consultasOptions.therapists}
            locations={consultasOptions.locations}
            services={consultasOptions.services}
            count={patientAppointments.length}
          />
          <AppointmentsList
            appointments={patientAppointments}
            canEdit={canEditAppointments}
            canCancel={canCancelAppointments}
            ownCancelIds={ownCancelIds}
            filtered={marcacoesFiltered}
          />
        </div>
      )}

      {tab === "notas" && (
        <div role="tabpanel" id="tabpanel-notas" aria-label={s["patients.tabNotes"]}>
          <Card title={s["patients.tabNotes"]}>
            {/* PL-13: the composer adds a note; unified notes are editable in
                place with a last-edited stamp (NotesList), legacy revisions are
                read-only. */}
            {canActOnPatient && <NotesComposer patientId={id} />}
            {noteRevisions.length === 0 ? (
              <p className="mt-4 text-sm text-text-secondary">{s["patients.notesEmpty"]}</p>
            ) : (
              /* PL-17: each note names its marcação and can open it in the same
                 side panel the agenda uses. */
              <NotesTab
                notes={noteRevisions}
                options={agendaOptions}
                viewer={{ role: ctx.role, userId: ctx.userId }}
                canHardDelete={canHardDelete}
              />
            )}
          </Card>
        </div>
      )}

      {tab === "registos" && (
        <div role="tabpanel" id="tabpanel-registos" aria-label={s["patients.tabRecords"]}>
          {/* W7-03: section header - purple (accent-1-700) left rule + count,
              matching Documentos so the two tabs read as one system. */}
          <div className="mb-4 flex items-center gap-3 border-l-2 border-accent-1-700 pl-3">
            <h2 className="text-lg text-text-primary">{s["patients.tabRecords"]}</h2>
            <span className="text-sm tabular-nums text-text-secondary">{records.length}</span>
          </div>
          {/* Fichas placement (ruling F): all clinical-record entry points live
              here. "Nova ficha" reuses the /clinical/new creation flow, pre-scoped
              to this patient. */}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            {/* W5-30: "Mostrar anulados" toggle — a link that flips the ?anulados param. */}
            <Link
              href={`/patients/${id}?tab=registos${showAnnulled ? "" : "&anulados=1"}`}
              className={ghostLink}
            >
              {showAnnulled ? s["clinical.hideAnnulled"] : s["clinical.showAnnulled"]}
            </Link>
            <div className="flex flex-wrap items-end justify-end gap-3">
              {/* EPI-01b, piece 2: "+ Episódio". The therapist picks a specialty
                  from the closed list and nothing else: the title is a specialty
                  and a date, by ruling, and the server builds it. */}
              {canAddEpisode && (
                <form
                  action={createEpisodeAction}
                  className="flex flex-wrap items-end gap-2"
                  data-testid="add-episode-form"
                >
                  <input type="hidden" name="patientId" value={patient.id} />
                  <Field label={s["patients.fichaAddEpisodeSpecialty"]} required className="min-w-48">
                    <Select name="specialty" defaultValue="" data-testid="add-episode-specialty">
                      <option value="" disabled>
                        {s["patients.fichaAddEpisodeChoose"]}
                      </option>
                      {EPISODE_SPECIALTIES.map((specialty) => (
                        <option key={specialty} value={specialty}>
                          {specialty}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <AddEpisodeButton
                    plus
                    label={s["patients.fichaAddEpisode"]}
                    ariaLabel={s["patients.fichaAddEpisodeAria"]}
                    testId="add-episode-submit"
                  />
                </form>
              )}
              {canStartEpisode && (
                <Link href={`/clinical/new?patientId=${id}`} className={primaryLink}>
                  <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                  {s["clinical.new"]}
                </Link>
              )}
            </div>
          </div>
          {/* EPI-01b, piece 2: what "+ Episódio" did, said here. */}
          {m === "episodeErr" && (
            <p role="alert" className="mb-4 text-sm text-error" data-testid="add-episode-error">
              {s["patients.episodeError"]}
            </p>
          )}
          {openedGroup && (
            <p role="status" className="mb-4 text-sm text-text-primary" data-testid="add-episode-opened">
              {s["patients.fichaAddEpisodeOpened"].replace("{title}", openedGroup.label ?? "")}
              <FocusOnArrive targetId={`episodio-${openedGroup.episodeId}-resumo`} />
            </p>
          )}
          {confirmEpisode && confirmSpecialty && (
            /* An episode of that specialty is open: it is shown, and another
               is opened only on an explicit confirmation that names it. */
            <div
              role="group"
              aria-labelledby="add-episode-confirm-title"
              data-testid="add-episode-confirm"
              className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <h3
                id="add-episode-confirm-title"
                tabIndex={-1}
                className="font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {s["patients.fichaAddEpisodeExistsTitle"].replace("{specialty}", confirmSpecialty)}
              </h3>
              <FocusOnArrive targetId="add-episode-confirm-title" />
              <p className="mt-1" data-testid="add-episode-confirm-existing">
                {s["patients.fichaAddEpisodeExistsBody"].replace("{title}", confirmEpisode.title)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href={
                    recordGroups.some((g) => g.kind === "episode" && g.episodeId === confirmEpisode.id)
                      ? `#episodio-${confirmEpisode.id}`
                      : `/clinical/episodes/${confirmEpisode.id}`
                  }
                  className={ghostLink}
                  data-testid="add-episode-confirm-view"
                >
                  {s["patients.fichaAddEpisodeExistsView"]}
                </Link>
                <form action={createEpisodeAction}>
                  <input type="hidden" name="patientId" value={patient.id} />
                  <input type="hidden" name="specialty" value={confirmSpecialty} />
                  <input type="hidden" name="confirmOpenEpisodeId" value={confirmEpisode.id} />
                  <AddEpisodeButton
                    label={s["patients.fichaAddEpisodeExistsConfirm"].replace("{specialty}", confirmSpecialty)}
                    testId="add-episode-confirm-submit"
                  />
                </form>
                <Link href={`/patients/${id}?tab=registos`} className={ghostLink} data-testid="add-episode-confirm-cancel">
                  {s["common.cancel"]}
                </Link>
              </div>
            </div>
          )}
          {/* EPI-01b: a "+ Avaliação" that filed nothing says why, here. */}
          {m === "episodeMismatch" && (
            <p role="alert" className="mb-4 text-sm text-error" data-testid="add-evaluation-error">
              {s["clinical.episodeMismatch"]}
            </p>
          )}
          {m === "episodeClosed" && (
            <p role="alert" className="mb-4 text-sm text-error" data-testid="add-evaluation-error">
              {s["clinical.episodeClosedRefused"]}
            </p>
          )}
          {m === "avaliacaoErr" && (
            <p role="alert" className="mb-4 text-sm text-error" data-testid="add-evaluation-error">
              {s["patients.fichaGroupAddEvaluationError"]}
            </p>
          )}
          {recordGroups.length === 0 ? (
            <EmptyState icon={FileText} title={s["patients.emptyRecordsTitle"]} description={s["patients.emptyRecordsHelp"]} />
          ) : (
            /* EPI-01a: the registos grouped the way the Fisiozero ficha was
               (ficha-groups-core.ts). Every group renders OPEN, so every
               registo and its actions stay one tap away; a long group (the
               largest imported one on production holds 51) folds on its
               summary. The record rows inside are the same rows as before. */
            <div className="flex flex-col gap-4" data-testid="record-groups">
              {recordGroups.map((g) => {
                // EPI-01b: what this group's "+ Avaliação" files (ficha-groups-core
                // addEvaluationTarget): its own app episode, or an imported group's
                // SPECIALTY, for which the server reuses the patient's open app
                // episode or opens a new one (R31); "Sem episódio" gets none.
                const add = addEvaluationTemplateId ? addEvaluationTarget(g) : null;
                return (
                <details
                  key={g.key}
                  id={g.episodeId ? `episodio-${g.episodeId}` : undefined}
                  open
                  data-testid="record-group"
                  data-group-kind={g.kind}
                  data-group-key={g.key}
                  className="group rounded-lg border border-border bg-surface"
                >
                  <summary
                    id={g.episodeId ? `episodio-${g.episodeId}-resumo` : undefined}
                    className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <span className="text-sm font-medium tabular-nums text-text-primary" data-testid="record-group-date">
                      {evalDateFmt.format(new Date(g.firstAt))}
                    </span>
                    {g.kind === "none" ? (
                      <StatusChip tone="neutral">{s["patients.fichaGroupNoEpisode"]}</StatusChip>
                    ) : (
                      g.label && <StatusChip tone="neutral">{g.label}</StatusChip>
                    )}
                    {g.imported && <StatusChip tone="info">{s["patients.fichaGroupImported"]}</StatusChip>}
                    <span className="text-sm tabular-nums text-text-secondary" data-testid="record-group-count">
                      {g.evaluations === 0
                        ? s["patients.fichaGroupCountNone"]
                        : g.evaluations === 1
                          ? s["patients.fichaGroupCountOne"]
                          : s["patients.fichaGroupCountMany"].replace("{n}", String(g.evaluations))}
                    </span>
                    {/* A flex summary drops the browser's own fold marker, so
                        the fold is drawn here (the admin danger zone's pattern). */}
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                      data-testid="record-group-chevron"
                      className="ml-auto shrink-0 text-text-secondary transition-transform duration-fast ease-standard group-open:rotate-180"
                    />
                    <span className="min-w-0 basis-full truncate text-sm text-text-secondary">
                      {g.excerpt ?? s["patients.fichaGroupNoExcerpt"]}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    {add && addEvaluationTemplateId && (
                      <form action={createRecordAction} className="flex justify-end">
                        <input type="hidden" name="from" value="ficha" />
                        <input type="hidden" name="patientId" value={patient.id} />
                        <input type="hidden" name="formTemplateId" value={addEvaluationTemplateId} />
                        {add.kind === "episode" ? (
                          <input type="hidden" name="episodeId" value={add.episodeId} />
                        ) : (
                          <input type="hidden" name="newEpisodeSpecialty" value={add.specialty} />
                        )}
                        <AddEvaluationButton
                          label={s["patients.fichaGroupAddEvaluation"]}
                          ariaLabel={(add.kind === "episode"
                            ? s["patients.fichaGroupAddEvaluationInEpisode"]
                            : s["patients.fichaGroupAddEvaluationOpenOrNewEpisode"]
                          ).replace("{group}", g.label ?? "")}
                        />
                      </form>
                    )}
                    {g.records.map((r) => (
                      <div
                        key={r.id}
                        data-testid="record-row"
                        data-record-id={r.id}
                        data-annulled={r.annulled ? "true" : "false"}
                      >
                      <Card>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          {/* W7-03: two lines, not three. The title leads; the two
                              dates collapse into ONE labelled, tabular meta line (the
                              old row stacked an unlabelled updatedAt under a labelled
                              createdAt, three lines of near-equal weight). */}
                          <Link href={`/clinical/${r.id}`} className="flex min-w-0 flex-col gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                            <span className="font-medium text-text-primary">
                              {r.templateTitle ?? s["patients.recordDefaultName"]}
                            </span>
                            {/* SPEC-ficha-medica.md sec 4: the record's auto-stamped
                                creation instant (Lisbon display), never hand-typed. */}
                            <span className="text-sm tabular-nums text-text-secondary">
                              {s["clinical.recordCreatedAt"]}: {dateTimeFmt.format(new Date(r.createdAt))}
                              {" · "}
                              {s["clinical.recordUpdatedAt"]}: {dateFmt.format(new Date(r.updatedAt))}
                            </span>
                            {/* EPI-01a: the evaluation's one-line complaint (Q3). */}
                            {r.excerpt && (
                              <span className="line-clamp-1 text-sm text-text-secondary" data-testid="record-excerpt">
                                {r.excerpt}
                              </span>
                            )}
                          </Link>
                          {/* Status first, then actions, with a visible gap between the
                              two groups: state must never read as an action. */}
                          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
                            {/* record_status axis. The ai_review_state second axis is not in
                                the records list query, so it is not shown here (rule #1). */}
                            <StatusChip tone={RECORD_TONE[r.status]} dot>
                              {s[RECORD_KEY[r.status]]}
                            </StatusChip>
                            {/* W5-30: ANULADO badge — the signed record row is untouched;
                                this reflects a record_annulments row. */}
                            {r.annulled && (
                              <StatusChip tone="error" dot>
                                {s["clinical.recordAnulado"]}
                              </StatusChip>
                            )}
                            {/* Per-ficha addendum: reuse the existing versionRecordAction.
                                A finalized (non-draft) ficha is immutable; changes create a
                                new version. Author-gated. Not offered on annulled fichas. */}
                            {canStartEpisode && r.status !== "draft" && !r.annulled && (
                              <form action={versionRecordAction.bind(null, r.id)}>
                                <Button type="submit" variant="secondary">{s["clinical.newVersion"]}</Button>
                              </form>
                            )}
                            {/* W5-30: password-gated Eliminar (draft) / Anular (signed). */}
                            {canStartEpisode && (
                              <RecordLifecycleActions
                                recordId={r.id}
                                patientId={id}
                                status={r.status}
                                annulled={r.annulled}
                              />
                            )}
                          </div>
                        </div>
                      </Card>
                      </div>
                    ))}
                  </div>
                </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "documentos" && (
        <div role="tabpanel" id="tabpanel-documentos" aria-label={s["patients.tabDocuments"]}>
          {/* W5-31: attendance-declaration (Declaração de Presença) generator.
              PL-31: a declaração carries the patient's fiscal identity, so it
              cannot be issued for a ficha that has neither a NIF nor a recorded
              exemption. The button is replaced by the reason rather than
              rendered disabled with no explanation — a dead control teaches
              nothing, and the fix (edit the ficha) is one sentence away. */}
          {nifIncomplete ? (
            <div
              className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              data-testid="declaracao-blocked-no-nif"
            >
              {s["patients.nifRequiredForDocument"]}
            </div>
          ) : (
            <div className="mb-4 flex justify-end">
              <DeclaracaoDialog
                patientId={patient.id}
                appointments={declaracaoAppointments}
                locations={declaracaoLocations}
                patientNif={patient.nif}
              />
            </div>
          )}
          <PatientDocuments
            patientId={patient.id}
            items={patientDocuments}
            canUpload={canUploadDocuments}
            // SR-62 PU-4: Eliminar (soft delete) shares upload's capability,
            // patients:write. softDeletePatientDocument re-asserts it (Q-PU4-1).
            canDelete={canUploadDocuments}
          />
        </div>
      )}

      {tab === "faturacao" && (
        <div role="tabpanel" id="tabpanel-faturacao" aria-label={s["patients.tabInvoicing"]}>
          {patientInvoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={s["patients.emptyInvoicingTitle"]}
              description={s["patients.emptyInvoicingHelp"]}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {patientInvoices.map((inv) => (
                <Card key={inv.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-text-primary">
                        {inv.externalId ?? `#${inv.id.slice(-6)}`}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {inv.issuedAt ? dateFmt.format(new Date(inv.issuedAt)) : "—"}
                        {inv.amountCents != null &&
                          ` · ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: inv.currency }).format(inv.amountCents / 100)}`}
                      </span>
                    </div>
                    <StatusChip tone={INVOICE_STATUS_TONE[inv.status]} dot>
                      {s[INVOICE_STATUS_KEY[inv.status]]}
                    </StatusChip>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {canDelete && (
        <section className="mt-8">
          <PatientActions
            patientId={patient.id}
            isDeleted={Boolean(patient.deletedAt)}
            canHardDelete={canHardDelete}
            hardDeleteBlocked={hardDeleteBlocked}
            hardDeleteCounts={hardDeleteBlockers?.counts ?? []}
          />
        </section>
      )}
    </main>
  );
}

function formatSex(sex: string): string {
  if (sex === "male") return s["patients.sexMale"];
  if (sex === "female") return s["patients.sexFemale"];
  // PL-24: see PatientHeaderStrip.formatSex - no third sex, so a legacy
  // "other" and an unrecorded value read the same, and honestly.
  return s["patients.sexNotSpecified"];
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-text-secondary">{label}</dt>
          <dd className="text-sm text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}

function identityLine(p: Patient, locationName?: string | null): string {
  const parts: string[] = [];
  const age = ageFrom(p.dateOfBirth);
  if (age !== null) parts.push(`${age} ${s["patients.ageSuffix"]}`);
  if (p.sex) parts.push(formatSex(p.sex));
  if (p.nif) parts.push(`${s["patients.fieldNif"]} ${p.nif}`);
  // PL-15b: the patient's clinic, on the identity line of their own record.
  if (locationName) parts.push(locationName);
  return parts.join(" · ") || "—";
}
function contactLine(p: Patient): string {
  return [p.phone, p.email].filter(Boolean).join(" · ") || "—";
}
function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const mo = now.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
