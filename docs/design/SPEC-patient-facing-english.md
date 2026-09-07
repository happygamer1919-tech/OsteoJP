# SPEC — English on the patient-facing flows

**Status: DESIGN REPORT ONLY. NOTHING IS BUILT.**
Author: PURPLE, 2026-09-07. Re-derived from `origin/main` at `380e1023`.

**Division of labour, from the dispatch:** BLUE holds the patient LANGUAGE
COLUMN and the SMS BODIES, because a reminder is sent by a background job with
no browser and the language must be STORED, not read from a request. This
document owns the INTERFACE half and names the seam precisely.

---

## 0. The one-paragraph answer

**The dictionary is already there and it is complete** — 373 portal keys in
Portuguese and 373 in English, zero missing, zero extra. What is missing is
plumbing: `apps/portal/lib/i18n.ts` resolves the locale ONCE, at module load,
to the literal `"pt"`, and 115 files import the resulting frozen object. **The
guest chooses at step 1 with two links that set `?lang=`, and the choice
survives all four steps for a reason that is verified rather than assumed: the
form renders `action=""`, so every post goes to the current URL and carries its
query string with it, with or without JavaScript.** For a signed-in patient
with no language set the portal renders Portuguese and says nothing — and there
is a live defect to fix on the way: the account screen already prints
**"Idioma: Português"** as a hardcoded constant, which becomes a false statement
on somebody's screen the moment English exists.

---

## 1. WHAT THE i18n LAYER ALREADY SUPPORTS. Measured, not assumed.

### 1.1 Two complete dictionaries

```
packages/i18n/src/portal/strings.pt.json   373 keys   (nested: auth.*, booking.*, account.*, guest.*)
packages/i18n/src/portal/strings.en.json   373 keys
```

Counted by flattening both and diffing:

- **missing in EN: 0**
- **extra in EN: 0**
- **identical strings in both: 13**, and every one is correct as-is —
  `common.app_name`, the two clinic names and addresses, `account.field_email`,
  `account.reminders_sms`, `account.reminders_email`, `booking.service_duration`,
  and `account.language_pt` / `account.language_en`, which are the labels
  "Português" and "English" and must not be translated.

**SO THE TRANSLATION WORK IS DONE AND HAS BEEN FOR SOME TIME.** This is worth
stating plainly because it changes the size of the job: nobody is being asked to
translate a product. The staff platform has the same shape at a larger size
(`strings.{pt,en}.json`, 1,560 lines each), and that is not in scope — the
dispatch is patient-facing flows.

### 1.2 The loader, and the one line that blocks everything

```ts
// apps/portal/lib/i18n.ts — all 11 lines of it
export const locale: PortalLocale = "pt";
export const s: Readonly<PortalStrings> = getPortalStrings(locale);
```

**`s` IS A MODULE-LEVEL CONSTANT.** It is computed once when the module is first
imported and shared by every render of every request in that process. **115 files
in `apps/portal` reference it.** Every one does `import { s } from '@/lib/i18n'`
and then `s.guest.title`.

That is the whole obstacle, and it is worth being precise about why it is an
obstacle rather than merely a value to change: **a per-request locale cannot be a
module constant.** Two visitors on one server, one Portuguese and one English,
share the module. There is no seam here to pass a locale through — there is a
frozen object.

### 1.3 What DOES already take a locale

Three seams exist and are unused:

| Seam | Where | Today |
|---|---|---|
| `getPortalStrings(locale)` | `packages/i18n/portal-strings.ts` | called once, with `"pt"` |
| `htmlLang(locale)` → `pt-PT` / `en-GB` | `packages/i18n/strings.ts` | called with no argument in both root layouts |
| `PORTAL_LOCALES = ["pt","en"]` | `packages/i18n/portal-strings.ts` | exported, unused |

`htmlLang`'s own comment already names itself as the seam: *"Seam for per-locale
switching: once a per-request/per-tenant locale exists, pass it in."* And it is
not cosmetic — its comment records that Firefox and Safari derive a native date
picker's format from the document `lang`, which the guest form's date input
depends on. **`en-GB` was chosen deliberately over `en-US` so an English visitor
still gets `dd/mm/yyyy`**, which is the format the clinic's staff read.

---

## 2. HOW THE GUEST CHOOSES AT STEP 1

**Two links at the head of the form, `Português | English`, setting `?lang=`.**

```
/marcacao            → pt   (the default; no parameter, nothing changes for anybody today)
/marcacao?lang=en    → en
```

**LINKS, NOT A `<select>`, AND NOT A FORM CONTROL.** Three reasons, in order of
weight:

1. **A `<select>` needs JavaScript to act on a change**, or it needs its own
   submit button, which puts a second submit in a form whose buttons already
   mean "next" and "back". An `<a href>` needs nothing.
2. A language choice is not part of the booking. Carrying it as one of the
   `GuestValues` hidden fields would make it a step answer, and pressing "back"
   from step 3 would then be able to change the language, which is nonsense.
3. **A link is bookmarkable and shareable.** The clinic can put
   `/marcacao?lang=en` on an English page of the website and the visitor never
   sees a chooser at all — which is the case that actually matters for a clinic
   with foreign patients.

**WHY STEP 1 AND VISIBLE ON EVERY STEP.** The links render in the form's header
beside the step counter, so they are present on all five renders. A chooser that
only exists on step 1 strands somebody who realises at step 3, and the cost of
keeping it visible is two anchors.

**WHAT THEY LOOK LIKE.** The current locale is TEXT, not only a colour or a
weight — the `colour-not-only` rule this project applies everywhere. The inactive
one is a link; the active one is not a link at all, so a screen reader announces
one actionable choice rather than two.

---

## 3. HOW THE CHOICE SURVIVES FOUR STEPS THAT POST WITHOUT JAVASCRIPT

**This is the question the design turns on, and it is ANSWERED BY MEASUREMENT
rather than by reasoning about React.** Fetched from the running portal:

```
<form class="flex flex-col gap-4" action="" encType="multipart/form-data" method="POST">
```

**`action=""` POSTS TO THE CURRENT URL, INCLUDING ITS QUERY STRING.** So:

- **without JavaScript:** the browser posts to `/marcacao?lang=en`, the server
  action runs, Next re-renders the page for that same URL, and
  `searchParams.lang` is still `en`. Four steps, four posts, four renders, one
  parameter that never had to be carried by anything.
- **with JavaScript:** `useActionState` intercepts and posts to the same URL.
  The re-render is still server-side and still sees the same `searchParams`.

**ONE PARAMETER, ZERO HIDDEN FIELDS, ZERO COOKIES, AND NO NEW MECHANISM.** The
existing hidden-field machinery is untouched, which matters because the
no-JavaScript property currently rests on it entirely.

**THE PART THAT DOES NOT COME FOR FREE, AND IT IS THE REAL WORK.** The page is a
Server Component and the form is a Client Component. Today the page reads `s`
from the module constant for its own strings (`metadata`, the catalog-error
screen) and passes three RESOLVED strings down (`rgpdLabel`, `rgpdBody`,
`confirmationCopy`). The client component imports `s` itself for the other ~30.

So a per-request locale needs the client component to stop importing the module
constant and start receiving a dictionary. **That is a real change to
`GuestBookingForm`'s props, and it is ~30 string sites in one file.** It is
mechanical and it is contained: the guest flow is 2 files of the 115.

**THE `metadata` EXPORT IS THE ONE AWKWARD CASE.** `export const metadata = {
title: s.guest.title }` is evaluated at module load and cannot read
`searchParams`. Next's `generateMetadata({ searchParams })` is the replacement
and it is a small, local change.

---

## 4. WHAT THE PORTAL DOES FOR AN EXISTING PATIENT WITH NO LANGUAGE SET

### 4.1 There is no column, and there is a false statement on the screen

**Verified: no `language` or `locale` column exists anywhere in
`packages/db/src/schema.ts`.** That is BLUE's to add, per the dispatch, and the
reason given there is exactly right — a 24h SMS is sent by a background job with
no request and no browser, so the language has to be a stored fact about the
person, not a property of a page view.

**AND THERE IS ALREADY A DEFECT ON A DEPLOYED PATIENT SCREEN:**

```tsx
// apps/portal/app/portal/account/AccountView.tsx:161
<Row label={s.account.field_language} value={s.account.language_pt} />
```

**"Idioma: Português", hardcoded, for everybody.** Today it is merely
uninformative. The day English ships it becomes a screen that tells an English
patient their language is Portuguese while the page around it is in English —
the classic shape of a value that was a constant because there was only one
possibility, kept after there were two.

**THIS IS NOT A LANGUAGE FEATURE, IT IS A CORRECTION**, and it should land with
BLUE's column rather than after it. It is one line and one read.

### 4.2 The answer: Portuguese, silently, and that is deliberate

For a signed-in patient whose language is not set, the portal renders **pt-PT and
shows no prompt.** Reasons:

1. **NULL IS NOT "UNKNOWN LANGUAGE", IT IS "NEVER ASKED".** The clinic is
   Portuguese, in Portugal, and every existing patient was onboarded in
   Portuguese. Portuguese is the correct answer for essentially all of them.
2. **A LANGUAGE PROMPT ON LOGIN IS AN INTERRUPTION FOR ~100% OF PEOPLE TO SERVE
   ~0%.** Every existing patient would meet it once, to answer the question the
   default already answers correctly.
3. **THE CHOICE IS ALREADY IN THE RIGHT PLACE.** `account.field_language` exists,
   the account screen already has a row for it, and the two option labels already
   exist in both dictionaries. Turning that read-only row into a control is the
   whole patient-facing half.

**WHAT MUST NOT HAPPEN, and it is the tempting shortcut: reading
`Accept-Language` and storing it.** Two objections, and the second is decisive:

- a browser's `Accept-Language` describes the DEVICE, not the person — a
  Portuguese patient on a work laptop set to English would be silently switched;
- **a value inferred from a header and then STORED becomes the language the SMS
  is sent in.** BLUE's column feeds a background job. Writing it from a header
  means the clinic texts somebody in a language nobody chose, and nothing on any
  screen would ever say where that came from. `Accept-Language` may inform a
  DEFAULT SELECTION offered to a person; it must never be written on their
  behalf.

### 4.3 The three cases, in full

| Who | What decides the language | Persisted? |
|---|---|---|
| A guest at `/marcacao` | `?lang=` on the URL, default `pt` | **no.** There is no person to persist it to. It dies with the request |
| A guest who converts to a patient | whatever reception sets, or the column default | BLUE's — see the seam below |
| A signed-in patient | their stored language; `pt` when unset | yes, by the account screen |

---

## 5. WHERE THE SEAM IS. Stated as a contract, so BLUE and PURPLE can build in parallel.

```
   PURPLE                                          BLUE
   ------                                          ----
   ?lang= on /marcacao                    ---->    (nothing. A guest has no row)
   the account screen's language control  ---->    the write, and the column
   every portal render                    <----    the stored value, read once per request
                                                   the SMS bodies, read by the job
```

**THE SEAM IS ONE FUNCTION AND IT IS THE ONLY THING WE HAVE TO AGREE ON:**

```ts
// resolved ONCE per request, on the server, in the portal's request context
resolvePortalLocale(): PortalLocale
```

- **for a signed-in patient:** BLUE's stored column, falling back to `pt` when
  null. **The fallback lives in ONE place** — here — and never at a call site,
  because a `?? "pt"` sprinkled through 115 files is how one screen ends up
  disagreeing with another.
- **for an anonymous visitor on `/marcacao`:** `?lang=`, validated against
  `PORTAL_LOCALES`, defaulting to `pt`. **An unknown value falls back to `pt`
  and is not an error** — a query parameter is untrusted input and `?lang=de` is
  a typo, not an incident.
- **the return type is `PortalLocale`, never `string`.** An unvalidated string
  reaching `getPortalStrings` indexes the dictionary map with a key that is not
  there and yields `undefined`, and every `s.x.y` after it throws. The union is
  what makes that unrepresentable.

**WHAT BLUE OWNS AT THE SEAM:** the column, its default, its migration, the
write path from the account screen, and the SMS bodies. **What PURPLE owns:**
`resolvePortalLocale`, the `?lang=` half, threading the dictionary to the
components, `htmlLang`, and the account control's UI.

**THE HANDOFF ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE.** The guest half
depends on NOTHING of BLUE's — a guest has no row — so `?lang=` on `/marcacao`
can ship first, alone, and is independently valuable (it is the flow a foreign
visitor actually meets). The portal half is blocked on the column. **Recommended
sequence: guest first, portal second.**

---

## 6. THE THREE THINGS THAT WILL GO WRONG, NAMED IN ADVANCE

**1. THE MODULE CONSTANT WILL BE LEFT IN PLACE "FOR NOW".** 115 files import
`s`. The tempting increment is to add a per-request locale for the guest flow and
leave everything else on the constant. That works, and it leaves the portal in a
state where two mechanisms coexist and neither is obviously wrong at a call site.
**Mitigation: `apps/portal/lib/i18n.ts` should stop exporting `s` at all once the
first surface is converted**, so a file that has not been converted fails to
compile rather than silently rendering Portuguese inside an English page. A
compile error is the only signal that scales to 115 files.

**2. A HALF-TRANSLATED SCREEN LOOKS FINE TO WHOEVER BUILT IT.** The dictionaries
are complete TODAY. The moment somebody adds a key to `strings.pt.json` and not
to `strings.en.json`, `PortalStrings` is inferred from the PT file, so
`s.new.key` type-checks and renders `undefined` for an English viewer.
**Mitigation: a parity guard in `pnpm test:scripts`** — the same instrument
`scripts/portal-i18n-dead-keys.test.mjs` already uses on the same two files, so
this is one more assertion in a file that already reads them, not a new
mechanism.

**3. THE `<html lang>` WILL BE FORGOTTEN, AND IT IS NOT COSMETIC.** Both layouts
call `htmlLang()` with no argument. An English page served as `lang="pt-PT"` gets
the wrong screen-reader voice, the wrong hyphenation, and — per `htmlLang`'s own
comment — **the wrong native date-picker format in Firefox and Safari**, which
lands squarely on the guest form's date input. **Mitigation: it is one argument,
and it belongs in the same commit as the first translated screen.**

---

## 7. WHAT IS DELIBERATELY NOT IN SCOPE

- **The staff platform.** `apps/web` has its own 1,560-key pair and the same
  module-constant shape. The dispatch says patient-facing; staff is not.
- **The SMS and email bodies.** BLUE's, explicitly, and for the stated reason.
- **The Supabase auth emails.** They are templates in a console the owner pastes,
  not strings in this repo (`LE-supabase-auth-templates-ptpt` is the card that
  established that). An English patient's password-reset mail is a separate
  problem with a separate mechanism, and it should be carded rather than
  quietly assumed to follow.
- **Anything about a third language.** `PORTAL_LOCALES` is a union of two and
  every design above is written so a third is a data change rather than a code
  change, but no third language is being planned for.

---

## 8. THE ONE THING THE OWNER IS BEING ASKED

**Q-LANG-1** — a signed-in patient whose language has never been set: silent
Portuguese, or a one-time prompt? *Recommended: silent Portuguese, with the
choice on the account screen. Every existing patient was onboarded in Portuguese
and a prompt interrupts all of them to serve almost none.*

**STOP. Report only, per the dispatch. Nothing is built.**
