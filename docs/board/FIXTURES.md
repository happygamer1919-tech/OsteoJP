# Test fixtures — the accounts and records every sweep uses

**This file exists because nothing of consequence may live only in chat or in a
handoff document.** Until 2026-08-12 the fixtures for this project lived in
neither the repo nor a seed: `docs/acceptance-session-wave-13.md:266` states it
plainly, *"the repo has no designated test patient (checked: no seed row, no
fixture)."* Every sitting therefore re-derived them from memory, and a sitting
that re-derives its own fixtures cannot be repeated by anyone else.

**It is deliberately NOT a seed script.** These records live in a real database
that only the owner touches; a seed would be a production write. This is the
written-down answer to "which record did we use", which is the part that kept
getting lost.

---

## Rules that bind every entry below

1. **Never a real staff account and never a real patient.** Not for a read-only
   step, not "just to look". The habit is the protection.
2. **Test records are `ZZ`-prefixed** so they sort to the bottom of every list
   and are unmistakable in a screenshot.
3. **One test patient, not two.** A second record carrying the same mobile locks
   **both** out of the portal permanently, because patient linkage refuses on
   anything but exactly one phone match (WF-07).
4. **Never record a terms acceptance on a real patient.**
   `patient_terms_acceptances` is append-only by ruling: no UPDATE policy, no
   DELETE policy, grants revoked. It would be a permanent legal record
   attributed to you, about a person who accepted nothing, and **nothing in the
   product can remove it.**
5. **Ids, not names, are the identity.** Every name here is cosmetic; no code
   reads it.

---

## Environments

| What | Value |
|---|---|
| Portal URL | **`https://osteojp-portal.vercel.app`** — see the warning below |
| Staff platform URL | **`https://app.osteojp.pt`** |
| Supabase project (prod) | `dfotoodqvmjhbdcxyaxf` |

> ### THE PORTAL IS NOT ON ITS CUSTOM DOMAIN. DO NOT TYPE `patient.osteojp.pt`.
>
> **`patient.osteojp.pt` DOES NOT RESOLVE.** `docs/dns-records-pending.md:27`
> lists it as **PENDING**, and `:89` still has it in "Still pending", against a
> live `dig` on 2026-08-02. The CNAME was added on the Vercel side, so the
> project shows *"Invalid Configuration"* until the DNS record exists.
>
> **The live portal is the Vercel default host.** `docs/SPEC.md:55`:
> *"project `osteojp-portal`, Node 22.x, analytics off, env vars set, **live at
> `osteojp-portal.vercel.app`**. Custom domain `patient.osteojp.pt` deferred to
> go-live."*
>
> **`apps/portal/.env.example` says `NEXT_PUBLIC_APP_URL=https://patient.osteojp.pt`
> and that is the GO-LIVE TARGET, not the current deployment.** Taking that file
> at face value sends you to a dead hostname. It is the single most likely way to
> lose the first ten minutes of a sitting.
>
> **Confirm the exact host once against the Vercel dashboard** (project
> `osteojp-portal`) before a sitting. A Vercel default host is stable, but the
> repo's newest statement about it is dated 2026-06-10 and only the dashboard is
> authoritative today.
>
> **The staff platform is different and IS on its custom domain.**
> `app.osteojp.pt` is **LIVE** on `cname.vercel-dns.com`
> (`docs/dns-records-pending.md:25`, `docs/supabase-auth-redirect-urls.md:49`).
> So do not assume the two hosts follow the same pattern; they do not.

---

## Accounts

| Role | Identifier | Id | Notes |
|---|---|---|---|
| **Test patient** | `ZZ Teste …` | `____________________` | Carries **the owner's own mobile**. It is the canary for every OTP step and the subject of the terms items. |
| **Test therapist** | `ZZ TESTE THERAPIST` | `8ac3b349…` | The practitioner on both rows of the INC-08 double booking. Already exists. |
| **Reception / admin** | `____________________` | `____________________` | The account used for staff-side observation. |
| **Second therapist** | `____________________` | `____________________` | Needed **only** for the negative arm of the therapist queue check, where a **non-assigned** therapist must be refused. |

---

## Numbers

| Purpose | Value | Why this one |
|---|---|---|
| **Canary** — receives real OTP sends | the owner's own mobile | The only number on the platform. This is what makes a live send safe. |
| **No patient record** | `+351900000000` | Passes the validator `/^[29]\d{8}$/` (`phone.ts:19`), which deliberately does not enforce prefix assignment, so it reaches the code screen. **`90` is not an assigned Portuguese mobile block** (mobiles are 91/92/93/96), so **no handset can receive it** even with live sending armed. |
| **Synthetic NIF**, if one is ever needed | `212345672` | The repo's own canonical synthetic individual NIF (`lib/patients/nif.test.ts:14`). A made-up nine digits is **rejected**: `checkNif` enforces a prefix rule and a mod-11 control digit. |

---

## Rate limits that constrain any sitting

Read from `apps/api/lib/rate-limit/limiter.ts`, not from memory.

| Limit | Keyed on | Threshold |
|---|---|---|
| OTP **request** | your **IP** | **3 per hour** |
| OTP **request** | the **phone** (hashed) | **3 per hour** |
| OTP **verify** | your **IP** | **10 per hour** |
| Wrong codes | the code row | **5 attempts** |

**Both keys apply to a single request.** The binding one is the IP: three
requests per hour in total, whatever number you use. Plan a sitting around that
number before you start, not after you have spent it.

---

## Used by

- `docs/board/OBSERVE-SWEEP.md` — the observation sweep.
- `docs/acceptance-session-wave-13.md` — the Wave 13 acceptance plan.

**Fill a blank once and it stays filled.** If a value changes, change it here and
nowhere else.
