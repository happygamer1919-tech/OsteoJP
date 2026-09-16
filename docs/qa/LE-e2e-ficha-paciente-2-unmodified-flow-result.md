# LE-e2e-ficha-paciente-2: result of the unmodified-flow measurement (PURPLE R3 P-T2)

- **Pre-registration:** `docs/qa/LE-e2e-ficha-paciente-2-unmodified-flow-prereg.md`, commit `22d909f4`.
- **Timing:** committed 17:31:11Z and on GitHub by 17:31:14Z. The first run's seed started at 17:31:34Z.
- **Card:** `LE-e2e-ficha-paciente-2-lands-back-on-agenda`.

## Verdict: DOES NOT HOLD (outcome b)

By the rule fixed in advance, R2's click-timing split is a property of the harness. The card stays open, and it
is not reclassified to a product defect.

- **20 VALID measured runs:** 18 GREEN and 2 RED.
- **M at or above 290 ms:** 3 runs, all 3 GREEN (305, 317, 324).
- **M below 290 ms:** 17 runs.
  - 15 GREEN: 42, 86, 106, 120, 213, 214, 228, 228, 230, 240, 240, 244, 244, 246, 266.
  - 2 RED: 121 and 231.
- **Contradictions:** 15, against an allowance of 1.
- **The secondary metric C** (the click offset: "performing click action" minus the click dispatch) gives the
  same counts. It was reported beside M, never substituted.

## Runs, as registered

- **Executions:** 23 in total.
  - 2 warm-ups, repeat 0 of each invocation. Both GREEN, not counted.
  - 21 measured.
- **1 INVALID:** `b1-r13`. The save was refused before the click, with "Guardar mesmo assim" on screen. This is
  the 09:00 booking conflict the pre-registration anticipated.
- **Invocation 1:** `--repeat-each=21`, 17:31:45-17:33:30Z. It yielded 19 VALID.
- **Invocation 2:** the top-up rule's `--repeat-each=2`, 17:34:03-17:34:16Z. It yielded 1 VALID.
- **Verified by the runner at the start of both invocations:**
  - tree `0f25736f5b7b6d2f62656b857855eeac15fe2fb9`;
  - spec sha256 `05f0e59a570b52a5244ec3cc6c6cd25213f8ba8163cdb2588e7f36a3abbfae95`;
  - no tracked changes under `apps/web`, `packages` or `scripts`.
- **Load:** the 1-minute load average ran 3.21 to 5.79 across the runs. The rc-inventory auth and storage
  containers (another project) were in a restart loop throughout. Nothing else of mine ran.

## What this says

- **R2's no-overlap split needed the harness.**
  - Without the request holds, an early click is the common case: 17 of 20 landed before 290 ms, and 15 of
    those passed.
  - A click performed 39 ms after dispatch passed (`b1-r11`).
  - What the holds change is not measured here.
- **The defect is still real on the unmodified flow.** 2 of 20 VALID runs ended on
  `/agenda?view=day&date=<booked day>`, after the `/patients` navigation GET had been answered 200 (in 164 and
  135 ms). That is the symptom D3 reproduced, at a lower rate here (10%).
- **Not reclassified.** Outcome (a) did not occur. Flake versus product defect stays open, and every run was on
  the dev server.
- **Post hoc, not pre-registered, not a finding.** A drawer server-action POST to `/agenda` starting inside the
  navigation GET was present in both REDs (4 and 1 POSTs). It was also present in 5 of the 18 measured GREENs.
  The window counted was the GET's start to its end.

No fix was written, and #1338 was not touched.

## Data

- **Below:** every execution, generated from `runs.csv` by script, not transcribed.
- **Kept only in the session scratchpad (`r3/out`), which does not survive a restart:**
  - the per-action rows (`actions.csv`, 2,358 rows: trace actions, click log lines and network requests, each
    as an offset from the click dispatch);
  - `runs.csv`;
  - the traces.
- **Timestamp columns:** "real click (UTC)" is the trace's "performing click action" converted through
  `context-options` wall time. "M" is the navigation request start minus the click dispatch.

## Per-run data

| run id | role | validity | pass/fail | M ms | click offset C ms | real click (UTC) | drawer visible to click ms | not-stable retries | nav | /agenda action POSTs in nav | final URL |
|---|---|---|---|---|---|---|---|---|---|---|---|
| b1-r0 | WARMUP | VALID | pass | 276 | 271 | 2026-09-15T17:31:53.533Z | 282 | 3 | 200 in 650 ms | 4 | /patients/Maria |
| b1-r1 | MEASURED | VALID | fail | 121 | 118 | 2026-09-15T17:31:57.143Z | 124 | 2 | 200 in 164 ms | 4 | /agenda?view=day&date=2027-09-20 |
| b1-r2 | MEASURED | VALID | pass | 246 | 244 | 2026-09-15T17:32:11.973Z | 251 | 3 | 200 in 127 ms | 0 | /patients/Maria |
| b1-r3 | MEASURED | VALID | pass | 240 | 235 | 2026-09-15T17:32:14.910Z | 245 | 3 | 200 in 207 ms | 4 | /patients/Maria |
| b1-r4 | MEASURED | VALID | pass | 214 | 211 | 2026-09-15T17:32:17.791Z | 216 | 3 | 200 in 118 ms | 0 | /patients/Maria |
| b1-r5 | MEASURED | VALID | pass | 244 | 242 | 2026-09-15T17:32:20.499Z | 247 | 3 | 200 in 103 ms | 0 | /patients/Maria |
| b1-r6 | MEASURED | VALID | pass | 266 | 264 | 2026-09-15T17:32:23.282Z | 271 | 3 | 200 in 117 ms | 0 | /patients/Maria |
| b1-r7 | MEASURED | VALID | pass | 230 | 227 | 2026-09-15T17:32:26.216Z | 233 | 3 | 200 in 135 ms | 0 | /patients/Maria |
| b1-r8 | MEASURED | VALID | pass | 120 | 117 | 2026-09-15T17:32:29.009Z | 122 | 2 | 200 in 160 ms | 3 | /patients/Maria |
| b1-r9 | MEASURED | VALID | pass | 86 | 84 | 2026-09-15T17:32:31.520Z | 90 | 2 | 200 in 308 ms | 4 | /patients/Maria |
| b1-r10 | MEASURED | VALID | fail | 231 | 229 | 2026-09-15T17:32:34.964Z | 234 | 3 | 200 in 135 ms | 1 | /agenda?view=day&date=2027-02-19 |
| b1-r11 | MEASURED | VALID | pass | 42 | 39 | 2026-09-15T17:32:49.749Z | 44 | 1 | 200 in 187 ms | 5 | /patients/Maria |
| b1-r12 | MEASURED | VALID | pass | 324 | 322 | 2026-09-15T17:32:53.568Z | 327 | 4 | 200 in 106 ms | 0 | /patients/Maria |
| b1-r13 | MEASURED | INVALID (the Ficha do paciente click was never dispatched) | fail |  |  |  |  |  |  |  |  |
| b1-r14 | MEASURED | VALID | pass | 244 | 242 | 2026-09-15T17:33:11.098Z | 247 | 3 | 200 in 124 ms | 0 | /patients/Maria |
| b1-r15 | MEASURED | VALID | pass | 228 | 226 | 2026-09-15T17:33:14.225Z | 232 | 3 | 200 in 136 ms | 0 | /patients/Maria |
| b1-r16 | MEASURED | VALID | pass | 317 | 314 | 2026-09-15T17:33:17.344Z | 319 | 4 | 200 in 247 ms | 0 | /patients/Maria |
| b1-r17 | MEASURED | VALID | pass | 228 | 225 | 2026-09-15T17:33:20.873Z | 230 | 3 | 200 in 112 ms | 0 | /patients/Maria |
| b1-r18 | MEASURED | VALID | pass | 106 | 104 | 2026-09-15T17:33:23.690Z | 109 | 2 | 200 in 151 ms | 3 | /patients/Maria |
| b1-r19 | MEASURED | VALID | pass | 305 | 303 | 2026-09-15T17:33:26.636Z | 308 | 4 | 200 in 109 ms | 0 | /patients/Maria |
| b1-r20 | MEASURED | VALID | pass | 240 | 237 | 2026-09-15T17:33:29.777Z | 242 | 3 | 200 in 114 ms | 0 | /patients/Maria |
| b2-r0 | WARMUP | VALID | pass | 355 | 353 | 2026-09-15T17:34:12.364Z | 359 | 4 | 200 in 595 ms | 0 | /patients/Maria |
| b2-r1 | MEASURED | VALID | pass | 213 | 210 | 2026-09-15T17:34:16.044Z | 216 | 2 | 200 in 111 ms | 0 | /patients/Maria |
