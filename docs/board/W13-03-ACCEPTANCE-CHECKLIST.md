# W13-03 acceptance checklist - the patient login screens

**Run this on the deployed production portal.** It is the one WF-03 check that
was SKIPPED at the 2026-08-17 batched sitting, because the checklist was not to
hand. This file exists so it never needs GitHub to be run.

Extracted verbatim from the body of PR **#828** (merged 2026-08-06, `6596d15`),
section "Preview checklist for the owner". Nothing has been reworded; the
formatting is the only change.

**Where:** the patient portal, `osteojp-portal.vercel.app`. Not the staff
platform.

---

## The five steps

**1. Open the portal.**
Expected: "Entrar com o seu telemóvel" and a single phone field.
**No email field, no password field, no "Recuperar acesso" link.**

**2. Type a number and submit.**
Expected: the code screen, with the number shown above the field, and the blue
notice "Se o número estiver registado, enviámos um código por SMS."

**3. On that screen, look below the card.**
Expected: "Não recebeu o código?" followed by three lines - about no mobile on
record, about a landline, and about a shared number - each ending in
"Contacte a clínica".

**4. Type six wrong digits.**
Expected: one red banner, "Não foi possível entrar..." and **never anything
naming which of the six things went wrong**.

**5. Visit `/auth/reset-password`.**
Expected: the portal's not-found page.

---

## What is checkable today, and what is not

**Steps 1, 2, 3 and 5 are checkable right now.** They need no SMS.

**Step 4 needs a real code, so it is NOT checkable today.** It belongs to the
supervised `LAUNCH-01` canary. `OTP_LIVE_SEND` is off and stays off until that
card arms it under supervision, so **no SMS will arrive** at step 2 - the screen
advancing is the pass, not a message on a handset.

Marking step 4 anything other than "not run" is the failure this project has
already paid for twice: an unrun check that reads as a green one.

## Why step 4's wording is the point, not a nicety

The API answers **one** 401 for six distinct failure modes, so the screen cannot
become a patient-list oracle - a caller must not be able to learn from the error
whether a number belongs to a real patient. A banner that named which of the six
went wrong would rebuild that oracle inside the portal. All three degradation
lines in step 3 show together, always, for the same reason.

## If a step fails

Record which step, and what the screen said instead. Do not re-run the others
first: steps 1 to 3 are sequential and a failure at 1 makes 2 and 3 untestable
rather than failing.
