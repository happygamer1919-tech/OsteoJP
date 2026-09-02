# INC-SCHED-11 — the "+ 2.º período" button overwrote the FIRST period

**Opened 2026-09-02 by PURPLE. Introduced by #1117 (`c55cd6f0`), merged
2026-09-02T23:05:26+03:00. Fixed by #1120.**

---

## What it does

In **/admin/staff → Horários** and **/horarios**, pressing **"Adicionar 2.º
período"** writes the *suggested second period* into the **first** period's
fields. A day set to `08:00–13:00` becomes `13:00–19:00`.

`defaultSecondPeriod` returned `{ start, end }`, and the button spread it into
the day's state. `start` and `end` are period one's fields. It type-checked,
because `{ start, end }` is a valid `Partial<DayState>`: the shape was right and
the meaning was wrong.

## The part that can reach the database

**Guardar is disabled straight after the press**, because the second period then
starts before the first one ends. That is where this was found, and it reads
like a screen-only defect.

**It is not.** Three presses save the corruption:

| step | period 1 | period 2 | Guardar |
|---|---|---|---|
| loaded | `08:00–13:00` | off | enabled |
| press **+ 2.º período** | **`13:00–19:00`** | `13:00–19:00` | disabled |
| press **Remover 2.º período** | **`13:00–19:00`** | off | **enabled** |
| press **Guardar** | — | — | **written** |

`errorFor` returns null when `p2On` is false, so removing the second period
clears the block **and leaves period one rewritten**. The save is then accepted
and `availability_template.update` writes `start_time = 13:00`,
`end_time = 19:00` over the real morning.

Reproduced against the merged code, not inferred: the transition table above is
the output of a replay of the shipped state transitions.

## Blast radius

- **Window:** `2026-09-02T23:05:26+03:00` (#1117 merged and deployed) until
  #1120 is deployed.
- **Who:** anyone with `schedule:manage` who pressed **+** and then **Remover**
  on a day, and saved. Pressing **+** and closing the modal writes nothing.
- **What is lost:** the day's real `start_time` / `end_time`. The row is
  UPDATEd in place, and `availability_templates` has **no `updated_at` column**,
  so the row itself carries no trace of when it changed.
- **What it affects downstream:** everything that reads working hours — the
  agenda's free slots, `Agendar lote`, the portal's bookable slots, and the
  availability enforcement on save. A therapist whose morning was rewritten
  stops being bookable in the morning and starts being bookable in the evening.

## How to find out whether it happened

`scripts/inc-sched-11-audit-read.sql` is a **read-only** query listing every
`availability_template.update` audit row in the window, joined to the template's
current times. **The owner runs it; no terminal may touch production (standing
rule 1).**

**The audit row records that an update happened and not what it changed** — there
is no before/after in `audit_log` for this action — so the output is a shortlist
to eyeball, not a verdict. An empty result IS a verdict: nothing was saved.

## Why the tests did not catch it

The suggestion was unit-tested (pure). The loader was unit-tested (pure). The
only thing that touched the **button** was a `renderToStaticMarkup` test, and
that renderer never clicks. All twelve tests passed through the defect.

The **e2e round trip** caught it — `working-hours.spec.ts:105`, the W13-A
split-shift test, whose own header says it exists for exactly this: *"save-then-
vanish is the failure this feature can produce that looks like success once."*

It surfaced on **PACK-01's** CI (#1118) rather than on #1117's, because #1117
was branched before #1115 and #1116 and never rebased, so its own run never
combined with them. **A green CI on an un-rebased branch is a green CI on a
world that no longer exists.**

## The fix

`defaultSecondPeriod` returns `{ p2Start, p2End }`, and `secondPeriodPatch`
builds the whole patch, so a patch built from it cannot name period one's fields
by accident. The regression test is **negative** — the patch must carry exactly
`p2On`/`p2Start`/`p2End` and must **not have** a `start` or an `end` — because a
positive test would have passed before.
