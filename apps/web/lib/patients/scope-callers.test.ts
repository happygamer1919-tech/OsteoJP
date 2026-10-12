/**
 * scope-callers.test.ts: CARE-02a (0096), EVERY CALLER OF THE TWO THERAPIST
 * SCOPES, AND OF getPatient, WITH ITS VERDICT. COUNTED, NOT REMEMBERED.
 *
 * ==========================================================================
 * WHAT THIS PINS
 * ==========================================================================
 * The owner ruled that the care team READS the ficha and the registos, and
 * that no WRITE widens. scope.ts therefore has two therapist scopes:
 *
 *   therapistPatientScope      treats or created (the narrow one)
 *   therapistPatientReadScope  that, OR on the care team
 *
 * and getPatient takes `access: "read"` for the second, defaulting to the
 * first. Which one each caller takes is a decision, and this register is where
 * it is written down. A NEW caller fails here, naming itself, until somebody
 * decides which scope it gets and why; a caller that moves between scopes fails
 * until its verdict is edited here, which is the diff a reviewer reads.
 *
 * THE VERDICTS
 *   read    a patient-page READER. Takes the read scope.
 *   write   a server action or helper that writes. Keeps the narrow scope.
 *   picker  a read whose only job is to feed a write (the booking, new-registo,
 *           consultation and quick-note pickers, and prefills). Keeps the
 *           narrow scope: offering a patient you cannot act on is a dead end.
 *   queue   a Notificacoes or review work queue: every row exists to be acted
 *           on, and none is a ficha reader. Keeps the narrow scope; widening a
 *           queue is not in CARE-02a's ruling.
 *
 * The rule checked on every entry: `read` takes the read scope, and every other
 * verdict takes the narrow one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");

type Verdict = "read" | "write" | "picker" | "queue";
type Helper =
  | "therapistPatientScope"
  | "therapistPatientReadScope"
  | "therapistPatientScopeFor"
  | "therapistRegistoWriteScope"
  | "getPatient:read"
  | "getPatient:write";

/** `<file>#<function>#<helper>` -> how many calls, and the verdict with its reason. */
const EXPECTED: Record<string, { calls: number; verdict: Verdict; why: string }> = {
  // ---------------------------------------------------------------- read
  "lib/clinical/records.ts#listRecords#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "The Registos tab of the ficha. clinical_records_select (0096) admits the same set.",
  },
  "lib/clinical/ficha-groups.ts#listFichaRecords#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "EPI-01a: the Registos tab, grouped by episode. The same reach as listRecords (clinical_records_select, 0096), plus each registo's episode; it writes nothing.",
  },
  "lib/clinical/report/episode-export.ts#readEpisodeExportRows#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "EPI-01b piece 3: which registos an episode's PDF holds. The Registos tab's own reach (listFichaRecords), narrowed to one episode; each registo is then loaded by the per-record report engine under the caller's claims. It writes no registo.",
  },
  "lib/clinical/report/generate.ts#registoReadScope#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "EXPORT-01: the registo's PDF (\"Transferir PDF\"). The reach getRecordDetail opens the registo page with, so the export answers exactly where the page does. It reads one registo and writes none.",
  },
  "lib/clinical/records.ts#getRecordDetail#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "Opening a registo. Its edit, sign and version actions are refused by clinical_records' write policies, which 0096 does not touch.",
  },
  "lib/clinical/storage.ts#createAttachmentDownloadUrl#therapistPatientReadScope": {
    calls: 2, verdict: "read", why: "Downloading a file the registo or the Documentos tab lists. Both arms mirror the reader they serve.",
  },
  "lib/patients/documents.ts#documentVisibilityScope#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "The four Documentos readers: list, imported list, preview, download. attachments RLS is tenant-only, so this is the whole narrowing.",
  },
  "lib/patients/list-queries.ts#scopeConditions#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "The /patients list, its search box and its stat strip.",
  },
  "lib/patients/queries.ts#listPatients#therapistPatientReadScope": {
    calls: 1, verdict: "read", why: "A patient list. No production caller today (the /patients page uses listPatientsPage); read, like that list.",
  },
  "app/patients/[id]/page.tsx#PatientProfilePage#getPatient:read": {
    calls: 1, verdict: "read", why: "The ficha itself: every tab hangs off this read.",
  },
  "lib/patients/actions.ts#getAppointmentNotesAction#getPatient:read": {
    calls: 1, verdict: "read", why: "One appointment's note thread (agenda panel, Marcacoes popup).",
  },
  "lib/patients/actions.ts#getPatientNotesAction#getPatient:read": {
    calls: 1, verdict: "read", why: "One patient's note history (Recuperacao popup), the same read as the Notas tab.",
  },
  // ---------------------------------------------------------------- the option itself
  "lib/patients/queries.ts#getPatient#therapistPatientScopeFor": {
    calls: 1, verdict: "write", why: "getPatient's own scope: the caller's `access`, defaulting to the narrow one. Its callers are registered below as getPatient:read or getPatient:write.",
  },
  // ---------------------------------------------------------------- write
  "app/consultation/actions.ts#startConsultationAction#therapistPatientScope": {
    calls: 1, verdict: "write", why: "Records the recording consent and writes its audit row.",
  },
  "app/consultation/actions.ts#recordablePatientId#therapistPatientScope": {
    calls: 1, verdict: "write", why: "Settles the patient for the audio upload URL and the consultation write.",
  },
  "lib/patients/documents.ts#assertPatientInTenant#therapistPatientScope": {
    calls: 1, verdict: "write", why: "The document upload mint. Added by CARE-02a: it leaned on patients_select, which 0096 widens for reading.",
  },
  "lib/patients/documents.ts#confirmPatientDocument#therapistPatientScope": {
    calls: 1, verdict: "write", why: "The document upload confirm, for the same reason as the mint.",
  },
  "lib/patients/documents.ts#softDeletePatientDocument#therapistPatientScope": {
    calls: 1, verdict: "write", why: "Document delete.",
  },
  "lib/patients/actions.ts#appendPatientNoteAction#getPatient:write": {
    calls: 1, verdict: "write", why: "Appends a patient note.",
  },
  "lib/patients/actions.ts#appendAppointmentNoteAction#getPatient:write": {
    calls: 1, verdict: "write", why: "Appends an appointment note.",
  },
  "lib/patients/actions.ts#editAppointmentNoteAction#getPatient:write": {
    calls: 1, verdict: "write", why: "Edits a note.",
  },
  "lib/patients/actions.ts#deleteNoteAction#getPatient:write": {
    calls: 1, verdict: "write", why: "Deletes a note.",
  },
  "app/patients/[id]/edit/page.tsx#EditPatientPage#getPatient:write": {
    calls: 1, verdict: "write", why: "The edit form; patients_update (0047) is not widened by 0096 either.",
  },
  "app/patients/[id]/declaracao-actions.ts#generateDeclaracaoUrlAction#getPatient:write": {
    calls: 1, verdict: "write", why: "The NIF write-back after a declaracao; the read only decides whether to write.",
  },
  "app/patients/[id]/page.tsx#PatientProfilePage#getPatient:write": {
    calls: 1, verdict: "write", why: "canActOnPatient: whether the ficha shows its write controls (Editar, Nova nota, uploads, + Episodio) to this viewer.",
  },
  "lib/clinical/episodes.ts#createEpisode#therapistPatientScope": {
    calls: 1, verdict: "write", why: "Opens an episode. clinical_episodes is tenant-only, so this is the whole patient gate; added by CARE-02a.",
  },
  "lib/clinical/episodes.ts#listOpenAppEpisodes#therapistPatientScope": {
    calls: 1, verdict: "picker", why: "EPI-01b piece 2: the Registos tab's open app episodes, read only to feed '+ Avaliação' and '+ Episódio'. The same narrow reach as the writes it feeds.",
  },
  // ---------------------------------------------------------------- registo writers
  // Each reads its source registo under therapistRegistoWriteScope: the pre-0096
  // clinical_records_select therapist arm, so the write does not widen with 0096's SELECT.
  "lib/clinical/records.ts#updateRecordData#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Saves a draft registo; without it a care-team read became a 0-row UPDATE plus an audit row.",
  },
  "lib/clinical/records.ts#createAddendum#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "A new version: clinical_records_insert admits any therapist filing in their own name.",
  },
  "lib/clinical/records.ts#signAndLockRecord#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Sign and lock.",
  },
  "lib/clinical/records.ts#hardDeleteClinicalRecord#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Deletes a draft and its attachments.",
  },
  "lib/clinical/records.ts#canWriteRecord#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "The registo page asks it which write controls to show; the same test every registo writer applies.",
  },
  "lib/clinical/records.ts#annulRecord#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Anular: record_annulments is tenant-only.",
  },
  // The permission matrix, 0097's INSERT policy therapist arm once applied (a patient
  // they treat or created), asked in the app so a refusal is a clean not_found; before
  // 0097 the refusal is the app's own. The narrow scope, never the read one.
  "lib/clinical/records.ts#therapistMayFileFor#therapistPatientScope": {
    calls: 1, verdict: "write", why: "Files a new draft or version only for a patient the therapist treats or created: the permission matrix, and 0097's INSERT policy therapist arm once applied.",
  },
  "lib/clinical/records.ts#mayFileRegistoFor#therapistPatientScope": {
    calls: 1, verdict: "write", why: "0097: the registo page asks it which write controls to draw; the same test as therapistMayFileFor.",
  },
  "lib/clinical/storage.ts#createAttachmentUploadUrl#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Mints an upload onto a draft registo; attachments is tenant-only.",
  },
  "lib/clinical/storage.ts#confirmAttachment#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Files that upload.",
  },
  "lib/clinical/review.ts#claimReviewItem#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Claims an AI draft for review.",
  },
  "lib/clinical/review.ts#editReviewNarrative#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Edits a draft under review.",
  },
  "lib/clinical/review.ts#saveReviewFicha#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Saves the reviewed ficha.",
  },
  "lib/clinical/review.ts#finalizeReview#therapistRegistoWriteScope": {
    calls: 1, verdict: "write", why: "Finalizes and signs a reviewed draft.",
  },
  // ---------------------------------------------------------------- picker
  "lib/patients/queries.ts#searchPatients#therapistPatientScope": {
    calls: 1, verdict: "picker", why: "Only caller is searchPatientsAction: the booking drawer, the new-registo form, the consultation recorder and Notas Rapidas.",
  },
  "lib/clinical/records.ts#listPatients#therapistPatientScope": {
    calls: 1, verdict: "picker", why: "The new-registo Paciente picker; clinical_records_insert still keys on clinical_therapist_sees_patient().",
  },
  "app/agenda/page.tsx#AgendaPage#getPatient:write": {
    calls: 1, verdict: "picker", why: "Prefills the booking drawer; booking rights are not in CARE-02a.",
  },
  "app/clinical/new/page.tsx#NewRecordPage#getPatient:write": {
    calls: 1, verdict: "picker", why: "Prefills the new-registo form.",
  },
  "lib/notes/appointment-options.ts#listPatientAppointmentsForNoteAction#getPatient:write": {
    calls: 1, verdict: "picker", why: "The Notas Rapidas appointment picker, which feeds a note write.",
  },
  // ---------------------------------------------------------------- queue
  "lib/clinical/review.ts#listReviewQueue#therapistPatientScope": {
    calls: 2, verdict: "queue", why: "The review queue: every row is a claim, approve or reject, and clinical_records' UPDATE policy is not widened.",
  },
  "lib/consultation/stuck-consultations.ts#listStuckConsultations#therapistPatientScope": {
    calls: 1, verdict: "queue", why: "Notificacoes: the clinician's own lost recordings, to be rewritten.",
  },
  "lib/reminders/unreachable-by-sms.ts#listPatientsUnreachableBySms#therapistPatientScope": {
    calls: 1, verdict: "queue", why: "Notificacoes: phone numbers to fix before a reminder is lost.",
  },
};

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "test-results" || entry === "e2e") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

const isComment = (line: string) => {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
};

const FN_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;

function enclosingFunction(lines: string[], at: number): string {
  for (let j = at; j >= 0; j--) {
    if (isComment(lines[j]!)) continue;
    const m = lines[j]!.match(FN_RE);
    if (m) return m[1]!;
  }
  return "(top level)";
}

/** Every call, keyed as EXPECTED is, with the line of each for the report. */
function callSites(): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const add = (key: string, line: number) => found.set(key, [...(found.get(key) ?? []), line]);
  for (const abs of sources(WEB)) {
    const rel = abs.slice(WEB.length + 1);
    if (rel === "lib/patients/scope.ts") continue; // the definitions
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      const code = line.replace(/\/\/.*$/, "");
      for (const helper of [
        "therapistPatientScope",
        "therapistPatientReadScope",
        "therapistPatientScopeFor",
        "therapistRegistoWriteScope",
      ] as const) {
        const n = (code.match(new RegExp(`\\b${helper}\\(`, "g")) ?? []).length;
        for (let k = 0; k < n; k++) add(`${rel}#${enclosingFunction(lines, i)}#${helper}`, i + 1);
      }
      if (/\bgetPatient\(/.test(code) && !/function\s+getPatient\(/.test(code)) {
        const access = /access:\s*"read"/.test(code) ? "getPatient:read" : "getPatient:write";
        add(`${rel}#${enclosingFunction(lines, i)}#${access}`, i + 1);
      }
    });
  }
  return found;
}

/**
 * THE TRANSITIVE READERS OF A REGISTO (review round 2). The register above
 * counts DIRECT scope callers. getRecordDetail is one of them, with the read
 * scope, so every page or action that opens a registo THROUGH it can now hold
 * a colleague's registo that its reader may not write. Round 1's register did
 * not see the review page, which drew claim-less but otherwise full review
 * controls that always refuse. Each such reader is listed here with what keeps
 * it from offering a write that will refuse:
 *   canWriteRecord  the same function asks canWriteRecord, the registo
 *                   writers' own test (therapistRegistoWriteScope), and draws
 *                   or reaches no write control when it says no;
 *   after-write     the read happens only after a registo write under the
 *                   write scope has already succeeded in the same function.
 * A new reader fails here, naming itself, until it is given one of the two.
 */
const RECORD_DETAIL_READERS: Record<string, { guard: "canWriteRecord" | "after-write"; why: string }> = {
  "app/clinical/[id]/page.tsx#RecordDetailPage": {
    guard: "canWriteRecord",
    why: "The registo viewer: readOnly, canSign, canVersion and the AI draft's review link all follow canWriteRecord.",
  },
  "app/clinical/review/[recordId]/page.tsx#ReviewDetailPage": {
    guard: "canWriteRecord",
    why: "The review editor is nothing but writes; a reader who cannot write is redirected to the registo viewer.",
  },
  "app/clinical/[id]/actions.ts#saveRecordAction": {
    guard: "after-write",
    why: "Reads the saved registo's patient for the terms acceptance, only after updateRecordData succeeded.",
  },
};

/** The registo writers an `after-write` reader may follow: each reads under therapistRegistoWriteScope (EXPECTED above). */
const REGISTO_WRITERS = ["updateRecordData", "createAddendum", "signAndLockRecord"] as const;

/** `<file>#<function>` -> the lines where it calls `name(`, comments and the definition excluded. */
function callersOf(name: string): Map<string, number[]> {
  const found = new Map<string, number[]>();
  for (const abs of sources(WEB)) {
    const rel = abs.slice(WEB.length + 1);
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      const code = line.replace(/\/\/.*$/, "");
      if (new RegExp(`function\\s+${name}\\(`).test(code)) return;
      if (!new RegExp(`\\b${name}\\(`).test(code)) return;
      const key = `${rel}#${enclosingFunction(lines, i)}`;
      found.set(key, [...(found.get(key) ?? []), i + 1]);
    });
  }
  return found;
}

describe("CARE-02a: every reader that opens a registo through getRecordDetail says how it avoids a refused write", () => {
  const readers = callersOf("getRecordDetail");

  it("finds the readers at all (the scanner is not silently empty)", () => {
    expect(readers.size).toBeGreaterThanOrEqual(3);
  });

  it("REGISTERS every reader, and keeps no entry for one that is gone", () => {
    expect(
      [...readers.keys()].sort(),
      "A new caller of getRecordDetail has no entry in RECORD_DETAIL_READERS. It can now open a colleague's registo " +
        "(the care-team read scope): ask canWriteRecord before drawing any write control, or read only after a write.",
    ).toEqual(Object.keys(RECORD_DETAIL_READERS).sort());
  });

  it("a `canWriteRecord` reader really asks canWriteRecord, in the same function", () => {
    const asks = callersOf("canWriteRecord");
    const missing = Object.entries(RECORD_DETAIL_READERS)
      .filter(([key, v]) => v.guard === "canWriteRecord" && !asks.has(key))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("an `after-write` reader reads only after a registo writer, in the same function", () => {
    const wrong: string[] = [];
    for (const [key, v] of Object.entries(RECORD_DETAIL_READERS)) {
      if (v.guard !== "after-write") continue;
      const readAt = Math.min(...(readers.get(key) ?? [Infinity]));
      const writeAt = Math.min(
        ...REGISTO_WRITERS.flatMap((w) => callersOf(w).get(key) ?? []),
        Infinity,
      );
      if (!(writeAt < readAt)) wrong.push(`${key}: first read at ${readAt}, first registo write at ${writeAt}`);
    }
    expect(wrong).toEqual([]);
  });

  it("every reader says why", () => {
    for (const [key, v] of Object.entries(RECORD_DETAIL_READERS)) expect(v.why.length, key).toBeGreaterThan(10);
  });
});

describe("CARE-02a: every therapist-scope caller has a verdict", () => {
  const found = callSites();

  it("finds the callers at all (the scanner is not silently empty)", () => {
    expect(found.size).toBeGreaterThanOrEqual(35);
  });

  it("REGISTERS every caller: an unlisted one fails here, naming itself", () => {
    const unknown = [...found.keys()].filter((k) => !(k in EXPECTED));
    expect(
      unknown.map((k) => `${k} at line ${found.get(k)!.join(", ")}`),
      "A new caller of a therapist scope or of getPatient has no verdict in scope-callers.test.ts. " +
        "Decide read (a ficha reader: the care-team read scope) or write/picker/queue (the narrow scope), and record why.",
    ).toEqual([]);
  });

  it("keeps no entry for a caller that no longer exists, and counts each exactly", () => {
    const counts = Object.fromEntries([...found].map(([k, lines]) => [k, lines.length]));
    const expected = Object.fromEntries(Object.entries(EXPECTED).map(([k, v]) => [k, v.calls]));
    expect(counts).toEqual(expected);
  });

  it("a READER takes the read scope, and NOTHING ELSE does: no write, picker or queue widens", () => {
    const wrong: string[] = [];
    for (const [key, v] of Object.entries(EXPECTED)) {
      const helper = key.split("#")[2] as Helper;
      const readScope = helper === "therapistPatientReadScope" || helper === "getPatient:read";
      if ((v.verdict === "read") !== readScope) wrong.push(`${key} is ${v.verdict}`);
    }
    expect(wrong).toEqual([]);
  });

  it("every verdict says why", () => {
    for (const [key, v] of Object.entries(EXPECTED)) expect(v.why.length, key).toBeGreaterThan(10);
  });
});
