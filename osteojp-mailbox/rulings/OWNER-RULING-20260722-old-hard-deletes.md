# OWNER RULING - 2026-07-22 - OLD project hard deletes (W11-03 gate)

Author: Ivan, owner. Committed directly to main by the owner account. This commit is the signature.

1. Identity: actor 48a34faa is MY owner account (in***@a-and-i-automation.com). Any prior file labeling 48a34faa as staff (incl. GREEN-ESCALATION-W10-02) is stale and superseded by this ruling.
2. The 2026-07-22 writes on OLD (jaxmkwoxjcgzkwxgbayx) were DELIBERATE manual cleanup by me in the Supabase dashboard:
   - 12:23-12:26Z: patient #123 create/update, appointment update/reschedule (mine)
   - 20:20:58Z patient.hard_delete patientNumber=123
   - 20:21:14Z appointment.hard_delete id=3d82fe24
   - 20:21:27Z appointment.hard_delete id=883e8eef
   - 20:22:11Z patient.hard_delete patientNumber=122
   - 20:22:20Z patient.hard_delete patientNumber=120
3. Override: the committed "NO cloud deletions, nothing is destroyed" ruling is overridden for EXACTLY these five deleted rows and nothing else. The immutability island (patients 94, 108, 109, 118, five signed records) is untouched. The immutability trigger was never defeated.
4. Freeze: I ceased ALL writes to OLD at 20:22:20Z and will not touch it again before W11-04. Staff freeze re-confirmed with Rodica, zero staff writes all day.
5. New quiescence anchor: 2026-07-22T20:22:20Z. Any write on OLD after this anchor HALTs.
6. MIGRACAO plan v1 is SUPERSEDED and must never be authorized. Exclusion set v2 = patients {94, 108, 109, 118, 119, 121}. GREEN is authorized to verify live state against this ruling, re-run pre-flight, and author plan v2 plus the DECISIONS entry citing this file, one OWNER-MERGE PR.
