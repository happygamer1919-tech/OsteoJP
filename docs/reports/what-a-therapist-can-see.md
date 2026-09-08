# What a therapist can see, in plain language

**For Ivan. No code, no table names you have to care about.** BLUE, 2026-09-08.
Every sentence here was checked against the running system, not remembered.

> **If "therapist coverage" meant something else** — how much of the therapist's
> screens the automated tests cover, rather than what a therapist can see — say
> so in one line and I will write that instead. This is the reading that matches
> "in plain language", and it is the half that decides whether a patient is
> findable.

---

## The one sentence

**A therapist sees the people they treat, and nobody else's.** Not their clinic's
patients — *their* patients. Two different therapists at the same clinic have two
different lists.

---

## What puts a patient on a therapist's list

Exactly two things, and either one is enough:

1. **They have an appointment with that patient** — past or future, and it counts
   whether they are the main clinician on it or the second one.
2. **They registered that patient themselves.**

The second rule exists so a therapist who signs somebody up before the first
booking can still find them five minutes later. Without it, a patient would
vanish the moment you created them.

**Nothing else puts a patient on the list.** Not working at the same clinic. Not
another therapist's note. Not being on the same day's diary.

---

## Where it is different from reception

| | reception and admin | therapist |
|---|---|---|
| **the question asked** | *is this patient at my clinic?* | *is this patient mine?* |
| **so they see** | everyone at their clinic, including people they have never met | only their own, at any clinic |
| **clinical records** | reception sees **none** | their own patients' |

**A therapist is not restricted by clinic at all**, and that is on purpose. If
you send a therapist to Castelo Branco for a fortnight, their patients travel
with them; nothing has to be reassigned.

---

## The consequence that has bitten us, and is now fixed

A therapist starting a consultation could type a walk-in's name into the box on
the recording screen and create the patient there. Until 2026-09-08 **that
patient was filed at no clinic at all** — and because they had no appointment
yet, they were on **nobody's** list at reception, at either clinic.

**The therapist who created them could still see them**, through rule 2 above.
So the one desk that produced the problem was the one place where nothing looked
wrong. Reception would be told the person did not exist.

That is fixed: the walk-in box now files the patient at the therapist's own
clinic, and asks which one if the therapist works at more than one. **Twenty-six
existing patients are in that state** and getting them onto a list is a data
change, which is yours to authorise — the options are on the board card
`PL-34-patient-created-with-no-clinic`.

---

## Two things worth knowing because they surprise people

**A second clinician on a session gets the patient.** If two therapists run a
session together, both of them have that patient from then on. That is the rule
working as intended.

**But the follow-up list does not agree yet.** A therapist who was the *second*
clinician on a dual session does not get that patient on `/recuperação`, even
though they can see them everywhere else. It is a known gap
(`LE-followup-dual-therapist-secondary`), it is small, and it is not urgent —
but it means "who shows up on my follow-up list" and "whose records can I open"
are not currently the same set of people, and if a therapist ever asks you why,
that is why.

---

## How you could check any of this yourself

Log in as a therapist, open the patient list, and search for somebody you know
is at the clinic but has never been on that therapist's schedule. **They should
not appear.** If they do, that is a real defect and worth telling me about
immediately — the same search as reception is a different question with a
different answer, and the two must not converge.
