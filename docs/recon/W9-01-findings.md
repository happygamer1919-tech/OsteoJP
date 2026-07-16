# W9-01 Recon CB - findings (Wave 09 Correcoes CB)

Read-only recon answering the six root-cause questions the Castelo Branco QA raised
(`docs/qa/2026-07-16-castelo-branco-qa.md`). Downstream loops (W9-02, W9-03, W9-05,
W9-06, W9-07) consume this document instead of the QA's symptom descriptions.

- **Executed:** 2026-07-16, off fresh `origin/main` @ `934b05f` (Wave 09 authoring merge
  #594). Migration head `0037` confirmed in lock-step across `packages/db/migrations/`
  and `supabase/migrations/`.
- **Method:** repo read at that commit, plus three read-only cloud reads. Every live
  read ran inside `SET TRANSACTION READ ONLY` against catalog/staff/scheduling tables
  only. No patient data was read. No credentials printed. Nothing written.
- **Scope:** no code, no fixes, no migration, no DB write. The only writes in this loop's
  PR are this document and the board row flip.

The starting map in the loop files is **wrong in five material places**. Each correction
is called out inline and collected in "Corrections to the starting map" at the end. Three
of them change a downstream loop's scope; two of them mean a downstream loop's stated fix
is unimplementable as written. Read those before executing W9-02, W9-03, W9-05 or W9-07.

---

## Disposition summary

| Q | Answer in one line | Downstream consequence |
|---|---|---|
| (a) | NESA is **already selectable at CB**; all three hypothesised causes are refuted by evidence. The QA observation is almost certainly stale (pre-W8-01a seed). | **W9-07: NO cloud write, NO code fix as scoped. Becomes a VERIFICATION loop.** Owner confirmation recommended before close |
| (b) | Strikethrough is **already** bound to `status = cancelled`. The QA premise does not reproduce. The real defect is that the card renders **no lifecycle cue at all**. | **W9-05: do NOT remap strikethrough.** ADD a status cue instead. Remapping would invert the intended convention |
| (c) | **NO exposure.** No note field reaches the portal UI or any portal API response. | **No HALT.** W9-06 ships the guard test against the listed guard points |
| (d) | Single hardcoded LV carimbo, no location parameter anywhere in the model layer. **No CB stamp asset exists in the repo.** The logo is a hand-drawn rectangle stand-in, not a broken path. | **W9-03 MUST HALT to QUESTIONS** for the owner-supplied CB carimbo. Wiring lands; asset cannot be fabricated |
| (e) | `created_by` and `created_at` are **PRESENT** and populated on every staff create path. | **W9-06 is MIGRATION-FREE, GREEN self-merge. Zero migrations. Head stays `0037`** |
| (f) | The predicate **does not exist**. The therapist dropdown is never scoped by location. Feature absent, not broken. | **W9-02 proceeds migration-free**, but needs an owner ruling on a dominant edge case (see below) |

**The two conditional loops are both resolved:** W9-06 takes the migration-free
self-merge path. W9-07 needs no cloud write, so it does not halt for authorization -
but it also has no code fix to make, which is a bigger scope change than the loop
file anticipates.

---

## (a) NESA missing from the CB booking dropdown

**Answer: none of the three hypothesised causes hold. NESA is currently selectable at
CB. The reported symptom does not reproduce against the current cloud state.**

### The booking dropdown never implements offered-only-where-priced

The staff booking service list is built at `apps/web/lib/scheduling/data.ts:200-209`:

```ts
tx
  .select({
    id: services.id,
    label: services.name,
    durationMin: services.durationMin,
    contraindicationSensitive: services.contraindicationSensitive,
  })
  .from(services)
  .where(eq(services.isActive, true))
  .orderBy(asc(services.name)),
```

The only predicate is `services.is_active = true`. The query never references
`service_location_prices` and never references `services.location_id`. Confirmed by
grep: `service_location_prices` / `serviceLocationPrices` appear **nowhere** in
`apps/web/lib/scheduling/`. `isServiceOfferedAtLocation` and `listServiceOfferings`
(`apps/web/lib/admin/services.ts:277-297`, `:305-318`) are real and correct, but their
only caller is the admin services page (`apps/web/app/admin/services/page.tsx:58-60`).

**Hypothesis (i) is therefore refuted, not merely unconfirmed.** A missing or inactive
CB price row cannot hide NESA from a dropdown that never reads price rows. The claim at
`docs/loops/wave-09/W9-07-nesa-catalog-fix.md:15` - "The booking creation dropdown is
active-only by design - so if the CB NESA offering is missing/inactive, NESA is correctly
hidden and the fix is DATA, not code" - is false in its second half. Active-only is
right; offered-filtered is wrong.

### The cloud row state refutes hypothesis (ii)

Read-only cloud read, catalog tables only:

| id | name | price_cents | location_id | is_active |
|----|------|-------------|-------------|-----------|
| `42edf26c-bc43-4787-9cef-fc92c343aa85` | NESA | 3900 | null | **false** (frozen legacy) |
| `270fb115-154a-4c4e-a2f7-f4976c71cfbd` | NESA | null | null | **true** (canonical) |
| `7e3359a7-219c-44c7-a84d-0dc38373b1b0` | Tratamento NESA | null | null | true |

`service_location_prices` for the canonical NESA:

| service | location | price_cents | is_active |
|---------|----------|-------------|-----------|
| NESA (`270fb115`) | OsteoJP (CB) | **5000** | **true** |
| Tratamento NESA (`7e3359a7`) | OsteoJP (LV) | 5000 | true |

The canonical CB NESA is **active**, with an **active** CB price row at 50.00. It passes
the `services.is_active = true` predicate. **Hypothesis (ii) is refuted.**

### The therapist mapping filter is bypassed at CB, refuting the remaining candidate

The drawer applies a client-side narrowing at
`apps/web/app/agenda/appointment-drawer.tsx:457-465`:

```ts
const therapistServiceIds =
  form.practitionerId && therapistServiceResult?.therapistId === form.practitionerId
    ? therapistServiceResult.ids
    : null;

const serviceOptions =
  therapistServiceIds && therapistServiceIds.length > 0
    ? options.services.filter((o) => therapistServiceIds.includes(o.id))
    : options.services;
```

Empty mapping means **no filter** (show all), by deliberate design. Cloud state:
`therapist_services` holds **3 rows in total** - Osteopatia (2 therapists), Fisioterapia
(1 therapist). Zero rows reference any NESA service.

The decisive intersection: the **only** CB-assigned therapist is **Bernardo Calmeiro**
(5 active `availability_templates` rows at CB), and he has **zero** `therapist_services`
rows. So `therapistServiceIds.length === 0`, the filter is bypassed, and all 21 active
services render - NESA included.

### Verdict and the most probable explanation

Every path by which NESA could be hidden at CB is refuted by evidence. **NESA is
selectable at CB right now.**

The most probable explanation is that **the QA observation predates the W8-01a catalog
seed**. The QA was delivered 2026-07-16; W8-01a (#587, the owner-confirmed cloud catalog
seed that created the canonical CB NESA at 50.00) merged the **same day**. Before that
seed the only row named NESA was the legacy 39.00 row, which is `is_active = false` and
which `data.ts:208` correctly hides. That reproduces Rodica's symptom exactly, and the
seed resolved it.

I am inferring from data state, not from an observation of the live UI. **This should be
confirmed with Rodica or the owner before W9-07 closes.**

**Ambiguity to flag:** if the QA meant the **patient portal** booking rather than the
staff platform, the symptom *does* reproduce and the fix *is* code - the portal
hard-codes an allowlist that excludes NESA at
`apps/api/lib/appointments/services.ts:39-44` (`BOOKABLE_SERVICE_NAMES` = osteopatia,
fisioterapia, massagem terapeutica, pilates terapeutico), applied at
`apps/api/lib/appointments/store.ts:266`. The QA doc says "staff-platform QA"
(`docs/qa/2026-07-16-castelo-branco-qa.md:3-4`), so this reading is secondary - but it is
the one reading under which item 4 is still live, so it is worth one question to Rodica.

### W9-07 disposition

**No cloud data write is required, so W9-07 does NOT halt for owner authorization.**
Equally, there is **no code fix in the direction W9-07 scopes**: there is no
offered-only-where-priced booking filter to correct, and adding one would *reduce*
visibility, not restore it.

**Recommended:** W9-07 becomes a **verification loop** - an E2E/unit proof against
fixtures replicating the confirmed cloud row state (canonical NESA active + active CB
price + a CB therapist with no service mapping) that NESA is offered at CB, plus the
frozen-rows assertion. Migration-free, GREEN self-merge. This is a scope change from the
loop file and is recorded as an open question below rather than self-authorized.

### Frozen legacy rows - confirmed untouched

Read-only confirmation, all three `is_active = false`, nothing modified:

| id | name | price_cents | is_active |
|----|------|-------------|-----------|
| `de000003-0000-0000-0000-000000000004` | Pilates Terapeutico | 4000 | false |
| `42edf26c-bc43-4787-9cef-fc92c343aa85` | NESA | 3900 | false |
| `de000003-0000-0000-0000-000000000003` | Massagem Terapeutica | 5000 | false |

**Critical for any future fix:** the legacy and canonical NESA rows **share the exact
display name "NESA"** and differ only by `id` / `price_cents` / `is_active`. The dropdown
renders `services.name` (`data.ts:203`), so they are visually indistinguishable. Anyone
"fixing" this by name match will hit the frozen row. Match by `id` only.

### Separate latent defect found (NOT item 4, do not fix in W9-07)

The booking service dropdown has **no location predicate at all**, so it offers every
active service at every location - contradicting the W8-01a offered-only-where-priced
semantic. At CB it also offers the LV-only `Tratamento NESA`. Packs in the same drawer
*are* location-filtered (`appointment-drawer.tsx:345-347`), so the inconsistency is
visible in one component. This is a real defect, but it is **over-inclusion** and cannot
produce item 4's symptom. Recorded as a Wave 10 candidate; out of scope for W9-07.

---

## (b) Agenda card visual-state to axis mapping

**Answer: strikethrough is ALREADY bound to `status = cancelled`. The QA premise does not
reproduce in code. The real defect is that the card renders no lifecycle cue at all.**

### What strikethrough is bound to today

`apps/web/app/agenda/agenda-grid.tsx:335`:

```tsx
const cancelled = appt.status === "cancelled";
```

`apps/web/app/agenda/agenda-grid.tsx:376` - the only `line-through` on the agenda:

```tsx
<span className={`flex items-center gap-1 truncate text-sm font-medium ${cancelled ? "text-v2-text-secondary line-through" : "text-v2-text-primary"}`}>
```

`cancelled` is assigned once at :335 and never reassigned; `confirmationState` is never
read into it. There are exactly three `line-through` occurrences in the repo and **all
three** derive from `status === 'cancelled'`:

- `apps/web/app/agenda/agenda-grid.tsx:376` (via :335)
- `apps/web/app/marcacoes/marcacoes-view.tsx:189` (via :174)
- `apps/portal/app/portal/appointments/AppointmentsView.tsx:38` (via :26)

**The intended convention is already what is implemented.**

### Complete state to axis mapping

| Visual cue | Bound to | Value | Line |
|---|---|---|---|
| line-through + secondary text on patient name | **`status`** | `cancelled` | 335, 376 |
| Card tint / accent colour | **`serviceName`** (not an axis) | name match | 338-343 |
| Muted grey tint override | **`status`** | `cancelled` | 339-341 |
| Confirmation icon (Clock/Check/X) + sr-only label | **`confirmation_state`** | pending/confirmed/declined | 374; `confirmation-indicator.tsx:19-23` |
| Warning ring + conflict label | derived overlap; skips cancelled | - | 104, 350-352, 361 |
| "Sem nota" amber badge | `status` + `hasNote` | `completed` && `!hasNote` | 400-404 |
| `+1` badge | `patientTwoId` / `practitionerTwoId` | non-null | 388 |
| Repeat icon | `recurrenceRule` / `recurrenceParentId` | non-null | 379 |

**Not rendered at all:** `status` values `scheduled`, `confirmed`, `no_show` have **zero**
visual representation on the card. There is no lifecycle badge.

### Root cause of the QA observation

Because the card renders no lifecycle badge, the only always-visible status-like glyph is
`ConfirmationIndicator` (the confirmation axis). A **cancelled** appointment whose patient
had previously **confirmed** renders **both** a Check icon (`confirmation_state =
confirmed`, :374) **and** strikethrough (`status = cancelled`, :376). A reader sees a tick
and a strikethrough on the same card and reports "strikethrough appears for
confirmations".

Both axes are rendering correctly. The card simply gives the reader no way to see
`status`. **The defect is a missing lifecycle cue, not a mis-bound strikethrough.**

### W9-05 consequence (scope correction)

**W9-05 must NOT remap line 376.** It is already correct, and moving strikethrough onto
`confirmation_state` would **invert** the Fisiozero convention the loop is trying to
restore. W9-05's real deliverable for QA item 5 is to **add an explicit lifecycle cue**
for `status` to the card, so cancelled is legible independently of the confirmation tick.

The loop file's Field 3 "Lifecycle PROOF: strikethrough = cancelled; a confirmed
appointment is NOT struck through" is **already satisfied by main** and can be locked in
as a regression test rather than a change.

### Load-bearing check: display-only, confirmed

- No test anywhere asserts `line-through` / `textDecoration` (grep across `apps/`, `e2e/`).
- No test file exists for `agenda-grid.tsx` at all.
- E2E asserts only the text "Cancelada" on the marcacoes badge
  (`apps/web/e2e/marcacoes-tab-edit.spec.ts:158`), never the decoration.
- `cancelled` (:335) is consumed only by `accent` (:338), `tint` (:339) and the className
  (:376) - all render.

**Caveat:** `agenda-grid.tsx:104` (conflict detection) and `:191` (legend) *independently*
re-read `a.status === "cancelled"`; they do not read the `cancelled` const. Changing :376
cannot affect them. Do not "unify" them into the display flag - they are siblings, not
consumers.

### Therapist identity on the card (QA items 7 and 8 confirmed genuine)

`practitionerName` exists on the type (`apps/web/lib/scheduling/types.ts:33`) but is
**never rendered** in `agenda-grid.tsx`. `practitionerId` is used only for conflict
detection (:105); `practitionerTwoName` appears only inside a `title` tooltip (:391).

Card colour is **per-service**, not per-therapist - `serviceAccent()` string-matches on
the service name (`agenda-grid.tsx:76-89`; see the comment at :31-34: "Cards are tinted by
SERVICE category, not status"). So the QA's "all cards same colour" is imprecise - cards
differ by service - but there is **no therapist signal whatsoever**. W9-05 items (a) and
(b) are genuine gaps.

**Note for W9-05:** `serviceAccent()` matches on service **name strings**, so any service
whose name it does not recognise (NESA included) falls to the neutral "Outros servicos"
tint.

**Spec conflict to resolve in W9-05:** the three surfaces strike different elements, and
the specs disagree - `docs/design/SPEC-staff-screens.md:55` says cancelled strikes "the
time cell only"; `docs/design/SPEC-foundation.md:132` says "strikethrough on the row not
the chip"; `agenda-grid.tsx:376` strikes the patient-name span only. Real, but a scope
question for W9-05, not a binding error.

---

## (c) Portal notes exposure

**Answer: NO exposure. No note content reaches the patient portal, in the UI or in any API
response body. No HALT.**

### Endpoints the portal consumes

The portal's only HTTP surface to `apps/api` is `apps/portal/lib/api/client.ts`. Four
functions return appointment data:

| Endpoint | Route | Response | Notes present? |
|---|---|---|---|
| `GET /api/v1/appointments` | `apps/api/app/api/v1/appointments/route.ts:26` | `{ appointments: AppointmentView[] }` | No |
| `POST /api/v1/appointments` | `apps/api/app/api/v1/appointments/route.ts:44` | `{ appointment: AppointmentView }` | No |
| `POST /api/v1/appointments/[id]/reschedule` | `.../reschedule/route.ts:33` | `{ appointment: AppointmentView }` | No |
| `POST /api/v1/appointments/[id]/cancel` | `.../cancel/route.ts:24` | `{ ok: true }` | No |

Every response is an `AppointmentView`, a closed 8-field type at
`apps/api/lib/appointments/booking.ts:33-42`:

```ts
export type AppointmentView = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  serviceName: string | null;
  locationName: string | null;
  practitionerName: string | null;
  room: string | null;
};
```

The single construction site is `enrichViews` (`apps/api/lib/appointments/store.ts:102-111`)
- an explicit field-by-field object literal, **no spread**. `bookAppointment`
(`booking.ts:324`) and `rescheduleAppointment` (`booking.ts:387`) both re-read through
`getOwnAppointment` rather than echoing the written row.

Every read uses an explicit column list: `listOwn` (`store.ts:203-212`) and `getOwn`
(`store.ts:222-231`) select exactly `id, startsAt, endsAt, status, serviceId, locationId,
practitionerId, room`. `notes` is not among them. Whole-row `.select()` calls exist only
in `apps/web` (the staff app). Grep for spreads (`...appointment`, `...row`, `...appt`)
across `apps/api` returns zero hits in non-test code.

`listOpenSlots` (`store.ts:316-370`) returns `Promise<string[]>` - bare ISO timestamps.
Its only `appointments` touch is an `exists (select 1 ...)` predicate
(`apptOverlapExists`, `store.ts:145-153`) that projects no columns.

`apps/api` has **zero** references to `appointment_notes` / `appointmentNotes` and zero to
`appointments.notes`. `appointmentNotes` is imported only in `apps/web`. `apps/portal` has
**no non-HTTP data path** to appointment data.

Portal UI renders no note field: the detail page builds a fixed 4-row list
(`apps/portal/app/portal/appointments/[id]/page.tsx:34-39`). The `historico` hits in
`AppointmentsView.tsx:59,67,70,97` are a false positive - a segmented-control tab value
meaning "past appointments".

### Guard points for W9-06's test (ranked by fragility)

1. **`apps/api/lib/appointments/store.ts:203-212`** (`listOwn` column list) - the primary
   guard; the portal uses this endpoint for both list and detail.
2. **`apps/api/lib/appointments/store.ts:222-231`** (`getOwn` column list).
3. **`apps/api/lib/appointments/store.ts:102-111`** (`enrichViews` explicit literal, no
   spread) - the single serializer choke point.
4. **`apps/api/lib/appointments/booking.ts:33-42`** (`AppointmentView` type) - compile-time
   only; a widened select would still serialize extra keys at runtime, which is why the
   runtime assertion belongs on the envelope.
5. **`supabase/migrations/0026_appointment_notes.sql:74-75`** - grants `appointment_notes`
   to `authenticated` and `service_role` only; no grant to `patient`.

### Thin margin worth recording (not an exposure)

`appointments.notes` (`packages/db/src/schema.ts:597`) is defended by **app-level column
lists only**. The DB grant at `supabase/migrations/0010_patient_identity_layer.sql:98-105`
is **table-level, not column-level** (`GRANT SELECT ON ... public.appointments ... TO
patient`), and RLS (`appointments_patient_selfscope`, 0010:121-127) filters **rows, not
columns**. So the `patient` role can read `appointments.notes` for its own rows at the SQL
layer. Nothing does today, and `enrichViews` would still not leak it because it builds an
explicit literal rather than spreading - but there are two app-level guards and **zero**
DB-level guard for the inline column. `appointment_notes` by contrast is defended at both
layers.

There is currently **no test asserting notes exclusion on the appointments path**. W9-06's
guard test should assert on the **serialized envelope**, not the DTO. The fichas path is a
working template - `apps/api/lib/fichas/read.test.ts:70`:

```ts
expect(envelope).not.toContain("private_notes");
```

Recommended shape: feed a store row carrying a `notes` sentinel, assert
`JSON.stringify({ appointments })` does not contain it.

---

## (d) Declaracao de Presenca asset pipeline

**Answer: a single hardcoded LV carimbo with no location parameter anywhere in the model
layer; no CB stamp asset exists; the logo is a hand-drawn rectangle stand-in, not a broken
path; the forced download is one option on one `createSignedUrl` call.**

### Correction: the HTML template is dead documentation

`docs/pdf-templates/declaration-presenca.html` is **not** the print template, contrary to
`W9-03-declaracao-presenca-fixes.md:11` and `W9-01-recon-cb.md:13`.

- `docs/pdf-templates/SPEC.md:5`: "**Status:** HTML layouts complete, awaiting wire-up to
  PDF renderer."
- Grep for `declaration-presenca` / `pdf-templates` / `puppeteer` across all
  `*.ts/tsx/json/mjs`: **zero** code references. No puppeteer/chromium in any
  `package.json`.

The shipped renderer is **pdf-lib**, drawing primitives imperatively
(`apps/web/lib/clinical/declaracao/declaracao-pdf.ts`). **Editing the HTML would produce
zero user-visible change.**

### The generation path

| # | File:line | Role |
|---|---|---|
| 1 | `apps/web/app/patients/[id]/page.tsx:424` | mounts `<DeclaracaoDialog>` |
| 2 | `apps/web/app/patients/[id]/DeclaracaoDialog.tsx:76` | calls `generateDeclaracaoUrlAction` |
| 3 | `apps/web/app/patients/[id]/declaracao-actions.ts:24` | server action; permission gate :30; **uploads** :40; **signs URL** :45 |
| 4 | `apps/web/lib/clinical/declaracao/generate.ts:50` | orchestrator; `resolveLocalidade` :78 |
| 5 | `apps/web/lib/clinical/declaracao/declaracao-model.ts:55` | `buildDeclaracaoModel` - responsavel + stamp |
| 6 | `apps/web/lib/clinical/declaracao/declaracao-settings.ts:26` | tenant JSONB overrides |
| 7 | `apps/web/lib/clinical/declaracao/signature-stamp-asset.ts:8` | the carimbo bytes |
| 8 | `apps/web/lib/clinical/declaracao/declaracao-pdf.ts:52` | pdf-lib render |

### The carimbo: one hardcoded LV asset, no location parameter

`apps/web/lib/clinical/declaracao/declaracao-model.ts:64` - resolved with **no location
argument at all**:

```ts
stampBytes: settings.signatureStamp ? signatureStampBytes() : null,
```

`apps/web/lib/clinical/declaracao/signature-stamp-asset.ts:8-10` - zero-argument, one
baked-in blob:

```ts
export function signatureStampBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(SIGNATURE_STAMP_PNG_BASE64, "base64"));
}
```

Its provenance is the LV/Fisiozero stamp (`signature-stamp-asset.ts:1-4`): "AUTO-GENERATED
from ./assets/signature-stamp.png (W5-31). The OsteoJP signature + carimbo block extracted
from the Fisiozero Declaracao de Presenca template (owner-supplied)."

`buildDeclaracaoModel` receives `DeclaracaoInputs` (`declaracao-model.ts:31-42`), which
carries `localidade` but **no location identity** - so the model layer literally cannot
select a per-location asset today. `generate.ts:64-72` resolves `appointmentLocation` and
then **discards it**, passing only the derived `localidade` string (`generate.ts:89`).

### No CB stamp asset exists - W9-03 must HALT

Searched `apps/web/lib/clinical/declaracao/assets/`, all `public/` dirs,
`packages/ui/src/assets/`, `docs/pdf-templates/`, and every raster/vector file in the repo
outside `node_modules`. There is **exactly one** stamp asset:

- `apps/web/lib/clinical/declaracao/assets/signature-stamp.png` - PNG, 760x172, 48,699 bytes

There is **no CB stamp asset anywhere**, no per-location stamp lookup, and no
tenant/location settings key holding one. `DeclaracaoSettings`
(`declaracao-settings.ts:16-22`) has only `responsavel` (string) and `signatureStamp`
(a **boolean** on/off), no asset reference.

**W9-03 must HALT to QUESTIONS and ask the owner for the CB carimbo image** (Q-W5-9
relation), exactly as its own Field 6 anticipates
(`W9-03-declaracao-presenca-fixes.md:49`). The per-location wiring can land; the asset
cannot be fabricated.

### The logo: a geometric stand-in, not a missing file

`apps/web/lib/clinical/declaracao/declaracao-pdf.ts:66-76` is the entire "logo":

```ts
// 1. Clinic logo — centered OsteoJP brand mark at the top (vector, on-brand).
const markW = 30;
const wordmark = "OsteoJP";
...
page.drawRectangle({ x: startX, y: y - 30, width: markW, height: 30, color: TEAL });
page.drawRectangle({ x: startX + markW - 7, y: y - 30, width: 7, height: 30, color: MAGENTA });
page.drawText(wordmark, { x: startX + markW + 10, y: y - 23, size: wordmarkSize, font: bold, color: MAGENTA });
```

**Root cause: this is not a missing file, a broken relative path, a blocked remote URL, or
a dropped data-URI.** It is a teal rectangle plus a magenta bar plus the Helvetica word
"OsteoJP" - a geometric approximation of the brand mark. It renders successfully; it is
simply not the logo. CB reporting "the logo does not render" is them seeing coloured boxes
where the OsteoJP mark should be.

The real vector assets exist (`packages/ui/src/assets/brand/logo-{full,lockup,mark}.svg`,
inlined at `packages/ui/src/brand/brand-svg.ts`) but they are **SVG**, and pdf-lib embeds
only PNG/JPEG (`embedPng`/`embedJpg`; the only image call is `declaracao-pdf.ts:102`).
That is why W5-31 drew a substitute. A fix needs a **rasterised PNG** of the mark or an
SVG-path redraw in pdf-lib. Unlike the carimbo this is derivable in-repo from the
committed SVG, so it is not necessarily an owner dependency - but the remedy choice is a
W9-03 decision.

The identical stand-in appears in `apps/web/lib/clinical/report/pdf.ts:129-130` and
`apps/web/lib/clinical/rgpd/rgpd-pdf.ts:116-117`, so the clinical report and RGPD PDFs
share the defect. Fixing only the declaracao is in scope; the other two are a follow-up.

### The localidade pattern (the reference to mirror)

`apps/web/lib/clinical/declaracao/declaracao-model.ts:13-29`:

```ts
export function resolveLocalidade(
  appointmentLocation: SourceLocation | null,
  tenantDefaultLocation: SourceLocation | null,
): string {
  for (const loc of [appointmentLocation, tenantDefaultLocation]) {
    if (!loc) continue;
    const city = resolveLocationContact(loc).city;
    if (city && city.trim().length > 0) return city.trim();
  }
  return (appointmentLocation?.name ?? tenantDefaultLocation?.name ?? "").trim();
}
```

Fed by `generate.ts:64-79`; tenant fallback at `generate.ts:34-42` (first **active**
location by `createdAt`). The matching mechanism is `normalizeLocationKey` ->
`OSTEOJP_LOCATION_CONTACTS` (`apps/web/lib/clinical/report/location-contacts.ts:55-87`,
`:97-108`), which already has canonical `linda-a-velha` and `castelo-branco` entries.
**A per-location stamp resolver should key off exactly this normalized key.**

Note `location-contacts.ts:67`: "Montemor-o-Novo is intentionally absent - opening, no
confirmed contacts yet". A third location needs a fallback policy. Recommended default:
blank stamp space, never the LV stamp.

### The download decision site

`apps/web/app/patients/[id]/declaracao-actions.ts:45-47`:

```ts
const signed = await admin.storage
  .from(ATTACHMENTS_BUCKET)
  .createSignedUrl(path, 60, { download: pdf.filename });
```

`{ download: pdf.filename }` makes Supabase Storage append `?download=<filename>`, serving
the object with **`Content-Disposition: attachment`**. That header wins over anything the
client does. The client **already tries to preview** - `DeclaracaoDialog.tsx:84`:

```ts
window.open(url, "_blank", "noopener,noreferrer");
```

So the tab opens and immediately downloads. **Dropping the `download` option yields
`inline`. No client change required.**

### Framing correction: the "manual option" is not a download toggle

It is `documents.declaracao.manualOption` = **"Introducao manual"**
(`packages/i18n/src/strings.pt.json:122`), the empty-value first entry in the marcacao
dropdown (`DeclaracaoDialog.tsx:118`):

```tsx
<option value="">{s["documents.declaracao.manualOption"]}</option>
```

Choosing it sets `locationId = null` (`DeclaracaoDialog.tsx:65`) and lets the user type the
date/times by hand. **Both paths - manual and marcacao-prefilled - call the same action
and hit the same download flag.** The manual option has no bearing on disposition
whatsoever. CB's "auto-downloads even in the manual option" means "it downloads no matter
which path I use", not "there is a manual/auto setting being ignored".

**There is no preview option in the UI today to fix.** W9-03 must either flip the default
to inline or add an explicit preview affordance. This is a scope clarification, not a
blocker.

**Second consequence for W9-03:** on the manual path `locationId = null`, so
`resolveLocalidade` falls through to `tenantDefaultLocation` - the oldest **active**
location. A per-location carimbo keyed off the same null `locationId` inherits that
fallback. The dialog exposes **no location selector on the manual path**, so a manually
entered CB declaration cannot currently be told it is a CB declaration. W9-03 must decide
how the manual path selects a stamp; a location selector on that path may be required.
(See the LV/CB active-state finding in (f) - it changes which location this fallback
currently resolves to.)

### Storage and signature blast radius

The generation path **does write to Storage** - `declaracao-actions.ts:38-43` uploads a
tenant-prefixed PDF under a random UUID using the **admin/service-role** client (RLS
bypassed; isolation relies on the `${ctx.tenantId}/` path prefix). The `download` flag sits
three lines below the upload in the same file, so **W9-03 cannot avoid touching this
file** - but the change is narrow: `createSignedUrl` only, no bytes, no path, no upload
change. W9-03 must not touch the path construction at :38.

This is a **signed URL** (cryptographic, 60s TTL), **not** the clinical `record_status`
state machine. The declaration attaches no therapist signature, writes no
`clinical_records` row, and touches no DB table. The stamp is decorative PNG bytes drawn at
`declaracao-pdf.ts:102-107`, unrelated to `lib/clinical/signature-capture.ts`. **The
download change does not touch how the declaration is stored or signed** in the sense
W9-03's Field 6 guards against.

**Flagged for QUESTIONS (out of W9-03 scope):** nothing reads back from
`${tenantId}/declaracoes/`, and no retention or cleanup job exists. Objects appear to
accumulate indefinitely after their 60s URL expires.

---

## (e) Marcacao audit columns

**Answer: `created_by` and `created_at` are PRESENT and populated on every staff create
path. W9-06 is MIGRATION-FREE.**

### Schema

`packages/db/src/schema.ts:598-599`:

```ts
createdBy: uuid("created_by").references(() => users.id),
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

`created_by uuid` (FK `users`, **nullable**) and `created_at timestamptz` (NOT NULL,
`defaultNow()`). The STATE 2026-06-30 schema dump is **correct**; no migration is needed.
`created_at` (row insert time) is distinct from `starts_at` (the appointment time).

### Populated on create

| Path | File:line | Value |
|---|---|---|
| Staff single booking | `apps/web/lib/scheduling/actions.ts:324` | `createdBy: actor.userId` |
| Batch engine | `apps/web/lib/scheduling/batch.ts:124` | `createdBy: ctx.userId` |
| Clone | `apps/web/lib/scheduling/clone-core.ts:85` | `createdBy: actor.userId` |

The clone path is test-asserted (`apps/web/lib/scheduling/clone-core.test.ts:84-91`:
"derives tenantId and createdBy from the acting context, never the source").

### Nuance W9-06 must handle: portal bookings are deliberately null

`apps/api/lib/appointments/store.ts:433`:

```ts
createdBy: null, // patient has no users row — WAVE B provenance column
```

(context comment at `store.ts:409`). **Every patient-self-booked appointment has
`created_by = NULL` by design**, because a patient has no `users` row to reference. This
is not a bug and must not be "fixed" with a migration or a backfill.

**W9-06 consequence:** the created-by display must handle NULL as a **first-class value**,
not an empty cell. Recommended default: render it as the portal/patient origin (for
example "Marcado pelo utente" / "Portal do utente") rather than blank, since NULL here
carries real provenance meaning. This is a copy decision - it needs both i18n files and is
recorded as an open question below rather than self-authorized.

### Disposition

**`created_by` PRESENT -> W9-06 is MIGRATION-FREE, GREEN self-merge. Zero migrations.
Migration head stays `0037`. No `0038` is authored in this wave.** Step 3 of W9-06's
ordered steps (the migration-gated branch) is **skipped**.

---

## (f) Agenda location filter leak

**Answer: the predicate does not exist. Selecting a location never narrows the therapist
set. The feature is ABSENT, not broken.**

### The therapist dropdown is never scoped by location

The therapist list is built at `apps/web/lib/scheduling/data.ts:189-194`:

```ts
tx
  .select({ id: users.id, label: users.fullName })
  .from(users)
  .innerJoin(roles, eq(users.roleId, roles.id))
  .where(and(eq(users.isActive, true), ne(roles.slug, "reception")))
  .orderBy(asc(users.fullName)),
```

The only predicates are `users.is_active = true` and `roles.slug <> 'reception'`. **No join
to `availability_templates`, no `location_id` term.** It returns every active non-reception
user tenant-wide.

Its consumer takes **no location argument at all** (`data.ts:230-241`):

```ts
export async function getAgendaOptions(
  ctx: RequestContext,
): Promise<AgendaOptions> {
```

And the caller passes none - `apps/web/app/agenda/page.tsx:71` calls
`getAgendaOptions(actor)`, while `locationId` (parsed at `page.tsx:60`) is routed **only**
into `listAppointments` (`page.tsx:72-77`).

The toolbar renders `options.therapists` raw (`apps/web/app/agenda/agenda-view.tsx:189-204`).
`filters.locationId` is in scope on :208 and is **never consulted** on :197. That is the
faulting line.

### What the location filter actually does

`apps/web/lib/scheduling/data.ts:125-145`:

```ts
if (args.practitionerId) {
  conds.push(eq(appointments.practitionerId, args.practitionerId));
}
if (args.locationId) {
  conds.push(eq(appointments.locationId, args.locationId));
}
```

Selecting CB adds `appointments.location_id = CB`, filtering **appointments**. The two
filters are orthogonal ANDed conditions over `appointments`; neither informs the other, and
nothing feeds `locationId` into the therapist option set.

**Symptom shape:** pick CB and the grid correctly shows only CB appointments, but the
dropdown still offers LV therapists. Pick an LV therapist plus CB and you get a
legitimately empty grid. The filter "works"; it just offers impossible combinations.

The same defect exists in `marcacoes` (`marcacoes-view.tsx:363` locations, `:409`
therapists - both raw `options.*`, sharing `getAgendaOptions`), so a fix at the data layer
covers both surfaces.

### Scope correction for W9-02: there are no therapist columns

`agenda-grid.tsx:245` renders **day columns** (`dates.map(...)`), not therapist columns.
The grid receives an already-filtered `appointments` prop (`agenda-view.tsx:240-246`) and
groups by date.

**W9-02's Field 3 requires "selecting CB shows zero LV therapists in the dropdown AND the
rendered columns".** The "rendered columns" half is **not satisfiable as written** - there
is no therapist column axis in this design. The satisfiable reading is: the **dropdown**
narrows, and the **rendered appointments** (already location-filtered) contain no LV
therapist's appointments. W9-02 should restate its DoD accordingly rather than build a
therapist-column axis (which would be a redesign, far outside a migration-free bug-fix
loop).

### The W4-12 helpers exist, are correct, and are unused by the agenda

`apps/web/lib/scheduling/therapist-locations.ts:20-38`:

```ts
export async function getTherapistLocationIds(
  ctx: RequestContext,
  therapistId: string,
): Promise<string[]> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .selectDistinct({ locationId: availabilityTemplates.locationId })
      .from(availabilityTemplates)
      .innerJoin(locations, eq(availabilityTemplates.locationId, locations.id))
      .where(
        and(
          eq(availabilityTemplates.userId, therapistId),
          eq(availabilityTemplates.isActive, true),
          eq(locations.isActive, true),
        ),
      );
    return rows.map((r) => r.locationId);
  });
}
```

Semantics: one therapist in, location ids out. Filters `availability_templates.is_active`
**and** `locations.is_active`; dedupes; tenant scoping via RLS through `runScoped`. **It
does not check `valid_from` / `valid_until`** - an expired seasonal template still counts.

Call-site census: `appointment-drawer.tsx:36,437` (booking auto-fill) and
`actions.ts:33,264`. **The agenda imports neither.** The derivation W9-02 needs already
exists and is already proven; the toolbar simply never calls it.

### Schema verification: claim confirmed, no migration needed

`packages/db/src/schema.ts:631-652`: `user_id` NOT NULL (:640), `location_id` NOT NULL
(:643), `is_active boolean NOT NULL DEFAULT true` (:650), `valid_from`/`valid_until`
nullable (:648-649), index `availability_templates_tenant_location_idx` on
`(tenant_id, location_id)` (:657) - which will serve the fix's join.

**No `user_locations` table exists.** Repo-wide grep returns only prose: a TODO comment in
`packages/db/migrations/0001_rls.sql:176` (mirrored in `supabase/migrations/0001_rls.sql:180`)
describing a hypothetical future table, and the docstring at `therapist-locations.ts:11`.
Assignment is derived; `availability_templates` is the only source.

The fix is cleanly expressible with the existing model - add an optional `locationId` to
`getAgendaOptions` and an `EXISTS` predicate on `availability_templates`. Both columns are
NOT NULL, so the join is total: no NULL semantics, no orphan rows, **no migration.
W9-02 does not halt.**

### CRITICAL for W9-02: the naive fix hides 15 of 18 therapists

This is not a hypothetical edge case. It is the **dominant case**, confirmed by read-only
cloud read:

| Fact | Count |
|---|---|
| Active non-reception users (therapist dropdown source) | **18** (16 therapist + 2 owner) |
| Therapists with **zero** `availability_templates` rows | **15** |
| Distinct therapists with an active CB assignment | **1** (Bernardo Calmeiro, 5 rows) |
| Distinct therapists with an active LV assignment | **2** (Filipa Rocha, Tiago Reis) |

A strict location filter would drop the CB therapist dropdown from **18 entries to 1**, and
LV to 2. Fifteen therapists would vanish from every location and be reachable only via
"Todas as localizacoes".

**W9-02 MUST NOT ship a strict filter without a fallback policy.** Two mitigations, neither
needing a migration:

1. **Union with actually-booked therapists:** add `SELECT DISTINCT practitioner_id FROM
   appointments WHERE location_id = $loc` over the visible range, so anyone already booked
   at a location stays selectable there. This also covers the therapist who covers a
   location ad-hoc without a template row - the model's genuine limit, since
   `availability_templates` encodes *scheduled* hours, not *actual* assignment.
2. **Show unassigned therapists everywhere:** a therapist with zero availability rows is
   *unassigned*, not *un-locatable*; hiding them is a data-completeness bug surfacing as a
   UI regression.

**Recommended default (filed as an open question, not self-authorized):** apply both -
therapists with zero availability rows remain visible at every location, and the
template-derived set is unioned with the range's actually-booked practitioners. That
narrows the filter (the LV therapists with LV-only templates stop showing under CB, which
is the reported bug) without hiding staff. Under the current data this yields a CB dropdown
of Bernardo Calmeiro plus the 15 unassigned, and excludes Filipa Rocha and Tiago Reis -
exactly the intended outcome.

**Semantic drift to avoid:** `getTherapistLocationIds` ignores `valid_from`/`valid_until`.
If the agenda filter honours the validity window but auto-fill does not, the two surfaces
will disagree about "assigned". Match the existing helper's semantics unless the owner
rules otherwise.

**Cache note:** `fetchStableAgendaRef` is `unstable_cache`d (`data.ts:185-227`,
`revalidate: 60`, keyParts `["agenda-stable-ref"]`). Adding `locationId` to the args keys
correctly; it multiplies entries by location count. Not a blocker.

### Live data finding: LV is currently INACTIVE

Read-only cloud read of `locations`:

| id | name | is_active |
|---|---|---|
| `de000002-0000-0000-0000-000000000002` | OsteoJP (CB) | **true** |
| `de000002-0000-0000-0000-000000000001` | OsteoJP (LV) | **false** |

**CB is the only active location.** The agenda location dropdown filters
`locations.isActive` (`data.ts:198`), so **LV is not selectable in the location filter
today**, and `getTherapistLocationIds` (which also filters `locations.isActive`) treats LV
assignments as invisible.

This is consistent with the QA symptom - Rodica sees LV **therapists** in the therapist
dropdown (which has no location predicate at all) even though LV is not an offered
location. It does not change (f)'s root cause.

But LV is a real, operating clinic, and `Linda-a-Velha` is a canonical entry in the
location-contacts dataset. **`is_active = false` on LV looks like a data error, and it is
owner-confirmable, not something a loop should flip.** Filed as an open question. W9-02
must not assume LV is selectable when writing its E2E, and should use fixtures rather than
depend on this cloud state.

---

## Corrections to the starting map

Five material corrections. Three change a downstream loop's scope.

1. **The booking dropdown does not implement offered-only-where-priced**
   (`W9-07:15`, `W9-01:14`). It filters `services.is_active` only and never reads
   `service_location_prices` (`data.ts:200-209`). Several loop docs propagate this
   assumption. **W9-07's stated code path is unimplementable as scoped.**
2. **Strikethrough is already bound to `status = cancelled`** (`W9-05:10,14`, QA item 5).
   The QA premise does not reproduce. **W9-05 must add a lifecycle cue, not remap
   strikethrough** - remapping would invert the convention.
3. **`docs/pdf-templates/declaration-presenca.html` is not the template**
   (`W9-03:11`, `W9-01:13`). It is dead documentation; the renderer is pdf-lib. Editing the
   HTML changes nothing.
4. **There are no therapist columns on the agenda** (`W9-02:7,26`). The grid renders day
   columns. W9-02's "rendered columns" DoD half is not satisfiable as written.
5. **The "manual option" is not a download-vs-preview toggle** (`W9-03:7,15`, QA item 2).
   It is the "Introducao manual" entry in the marcacao dropdown. Both paths force the same
   download; there is no preview option today to fix.

Two corrections in the QA's own framing, both minor and already handled above: "all cards
same colour" (cards are tinted per **service**, not uniform - but carry no therapist
signal), and "the logo does not render" (a stand-in **does** render; it is just not the
logo).

---

## Open questions to file

None of these are self-authorized. Each carries a recommended default.

1. **Q-W9-01-1 (W9-07 scope):** item 4 does not reproduce - the canonical CB NESA is active
   and CB-priced, and the CB therapist has no service mapping, so NESA is offered. Should
   W9-07 become a verification loop (prove-and-close), or should Rodica re-test first?
   **Recommended default:** convert W9-07 to a verification loop with an E2E against
   fixtures replicating the confirmed row state, and ask Rodica to re-confirm on the live
   platform before the wave closes. Also confirm whether item 4 referred to the staff
   platform (as the QA doc states) or the patient portal - under the portal reading it is
   still live and is a code fix (`BOOKABLE_SERVICE_NAMES` excludes NESA).
2. **Q-W9-01-2 (W9-02 policy, blocking):** 15 of 18 active therapists have zero
   `availability_templates` rows. Should a therapist with no availability assignment be
   hidden from every location filter, or shown at all of them? **Recommended default:**
   show them at every location, and union the template-derived set with the range's
   actually-booked practitioners. A strict filter would cut the CB dropdown to 1 entry.
3. **Q-W9-01-3 (data, owner):** `OsteoJP (LV)` is `is_active = false` in the cloud; CB is
   the only active location. Deliberate, or a data error? **Recommended default:** treat as
   a data error to be confirmed and corrected by the owner. No loop flips it. The cloud DB
   is read-only.
4. **Q-W9-01-4 (W9-06 copy):** `created_by` is NULL for every portal-booked appointment by
   design. What should the marcacao detail/list show? **Recommended default:** an explicit
   portal-origin label (pt "Marcado pelo utente" / en "Booked by patient"), both i18n
   files, never a blank cell.
5. **Q-W9-01-5 (W9-03 asset, blocking):** no CB carimbo asset exists; the only stamp in the
   repo is the LV/Fisiozero block. **Recommended default:** owner supplies the CB carimbo
   (Q-W5-9 relation); W9-03 lands the per-location wiring keyed on `normalizeLocationKey`
   and HALTs on the asset. Montemor-o-Novo has no contacts entry either - default to blank
   stamp space, never the LV stamp.
6. **Q-W9-01-6 (W9-03 remedy):** the logo is a rectangle stand-in because pdf-lib cannot
   embed the committed SVGs. **Recommended default:** rasterise `logo-mark.svg` to PNG and
   embed it, mirroring the existing `signature-stamp-asset.ts` base64-inlining pattern. The
   same stand-in in `report/pdf.ts` and `rgpd-pdf.ts` is a follow-up, not W9-03 scope.
7. **Q-W9-01-7 (W9-03 manual path):** the manual path sets `locationId = null`, so a
   manually entered CB declaration cannot be told it is a CB declaration and would inherit
   the tenant-default stamp. **Recommended default:** add a location selector to the manual
   path; if that is out of scope, HALT rather than let the manual path emit a wrong-location
   carimbo.
8. **Q-W9-01-8 (hygiene, not this wave):** the booking dropdown offers every active service
   at every location, contradicting the W8-01a offered-only-where-priced semantic (packs in
   the same drawer *are* location-filtered). **Recommended default:** Wave 10 candidate; do
   not fix in W9-07.
9. **Q-W9-01-9 (hygiene, not this wave):** generated declaracao PDFs accumulate in
   `${tenantId}/declaracoes/` with no reader and no retention job. **Recommended default:**
   Wave 10 candidate; confirm whether the write is intentional.

---

## Evidence appendix: read-only cloud reads

Three reads, each inside `SET TRANSACTION READ ONLY`, against `locations`, `services`,
`service_location_prices`, `therapist_services`, `users`, `roles`,
`availability_templates`. No patient table was touched. No credentials printed. Nothing
written. Connection via `DATABASE_URL_DIRECT` (session pooler, 5432).

Reads performed:

1. `locations`; `services` matching NESA; `service_location_prices` for those;
   the three frozen legacy rows; `therapist_services` mapping counts per NESA service;
   active/inactive service counts.
2. `therapist_services` totals and per-therapist counts; which services carry any mapping;
   active non-reception user counts by role; `availability_templates` therapist-to-location
   counts; count of therapists with zero availability rows.
3. CB-assigned therapists joined to their `therapist_services` mapping; the same for LV;
   the canonical CB NESA offering state.

Aggregate catalog shape: 25 services (21 active, 4 inactive), 3 `therapist_services` rows,
13 active `availability_templates` rows across 3 therapists and 2 locations.
