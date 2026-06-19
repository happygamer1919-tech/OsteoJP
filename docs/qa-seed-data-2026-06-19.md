# QA — Seeded Dev Patients — 2026-06-19

**Source:** `packages/db/seed/patients-dev.ts`  
**Dev project:** `ufbkzbyghvxtosyrkgjq` (Supabase EU Frankfurt)  
**Tenant:** `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`  
**Analysis method:** Static analysis of seed source + live read-only DB probe  
**DB access:** read-only via `DATABASE_URL_DIRECT`, connected as postgres superuser  

---

## DB State

> **The patients table is empty. The seed has not been run.**

Live probe confirms the table exists with RLS enabled (`relrowsecurity = true`, `relforcerowsecurity = false`). Connected as the postgres superuser (which bypasses RLS), count is 0 and no tenant IDs are present. The seed script at `packages/db/seed/patients-dev.ts` was merged in PR #299 but has not yet been executed against this project.

All analysis below is against the seed source data — this is precisely what the DB will contain once `pnpm --filter @osteojp/db seed:patients:dev` is run.

---

## Summary

| Check | Result | Detail |
|---|---|---|
| Count | ✅ Pass | 50 patients |
| Name plausibility | ✅ Pass | All 50 names plausible PT names |
| Unique IDs | ✅ Pass | 50 distinct UUIDs |
| Unique NIFs | ✅ Pass | No NIF collisions |
| Unique phones | ✅ Pass | No phone collisions |
| Unique emails | ✅ Pass | No email collisions |
| Unique names | ✅ Pass | No full-name collisions |
| Postal code format | ✅ Pass | All 50 match DDDD-DDD |
| Postal code / city match | ⚠️ Warn | 4 Barcarena patients use 2795 postal codes |
| Phone format (+351 + mobile) | ✅ Pass | All 50 valid |
| Phone prefix variety | ⚠️ Warn | Only 91 and 96 used; 92 and 93 absent |
| NIF format (9 digits) | ✅ Pass | All 50 are 9 digits |
| NIF checksum | ❌ Fail | 44 of 50 NIFs fail the PT checksum algorithm |
| NIF entity type (individual) | ⚠️ Warn | 25 of 50 NIFs have non-individual first digit |
| Date of birth | ✅ Pass | Ages 28–61, avg 43; all plausible |
| Email format | ✅ Pass | All 50 valid |
| Sex field values | ✅ Pass | All 50 are `male` or `female` |

---

## Distribution

```
By sex:    female 25 / male 25  (50 / 50 split ✓)

By city:   Linda-a-Velha  16
           Castelo Branco 25
           Queijas         4
           Barcarena       4
           Carnaxide       1

Age range: 28–61, avg 43 (sensible for an osteopathy patient population ✓)

Phone prefixes:
  91 (Vodafone): 25  — all Linda-a-Velha group
  96 (NOS):      25  — all Castelo Branco group
```

---

## Findings

### F-01 ❌ NIF Checksums — 44 of 50 fail

**Severity:** High — NIFs are used for invoice generation (InvoiceXpress integration). An invalid NIF will be rejected if InvoiceXpress performs validation.

**Root cause:** The seed uses a sequential numbering pattern (123456789, 234567890, 012345678, etc.) that does not satisfy the Portuguese NIF checksum algorithm.

**Algorithm reference:**  
- Multiply digits 1–8 by weights 9, 8, 7, 6, 5, 4, 3, 2.  
- Sum the products, compute `sum % 11`.  
- Check digit = `remainder < 2 ? 0 : 11 − remainder`.

**6 NIFs that happen to pass checksum:**

| Patient | NIF |
|---|---|
| Maria João Silva | 123456789 |
| Inês Catarina Lopes | 901234567 |
| Liliana Patrícia Gomes | 232345678 |
| Margarida Leonor Nunes | 512345678 |
| Pedro Miguel Cunha | 642345678 |
| Célia Marisa Valente | 362345678 |

**44 NIFs failing checksum** (all others):

| Patient | NIF |
|---|---|
| António Manuel Costa | 234567890 |
| Ana Luísa Ferreira | 345678901 |
| Carlos Alberto Rodrigues | 456789012 |
| Susana Isabel Martins | 567890123 |
| Paulo Alexandre Sousa | 678901234 |
| Filipa Margarida Gonçalves | 789012345 |
| Rui Miguel Carvalho | 890123456 |
| João Pedro Alves | 012345678 |
| Beatriz Alexandra Santos | 112345678 |
| Nuno Ricardo Pereira | 212345678 |
| Catarina Sofia Matos | 312345678 |
| Hugo Filipe Teixeira | 412345678 |
| Ricardo José Oliveira | 612345678 |
| Sara Filomena Pinto | 712345678 |
| Marco António Fernandes | 812345678 |
| Joana Cristina Ribeiro | 912345678 |
| Diogo Alexandre Cruz | 132345678 |
| Tiago Filipe Henriques | 332345678 |
| Mónica Isabel Correia | 432345678 |
| Vítor Manuel Barbosa | 532345678 |
| Daniela Sofia Monteiro | 632345678 |
| Fernando Jorge Mendes | 732345678 |
| Paula Cristina Vieira | 832345678 |
| Luís Filipe Cardoso | 932345678 |
| Cristina Maria Moreira | 142345678 |
| André Luís Fonseca | 242345678 |
| Vera Lúcia Simões | 342345678 |
| Hélder António Ramos | 442345678 |
| Cláudia Isabel Esteves | 542345678 |
| Teresa Raquel Marques | 742345678 |
| Sérgio Alexandre Branco | 842345678 |
| Patrícia Manuela Leite | 942345678 |
| Joaquim Manuel Pires | 152345678 |
| Alexandra Filipa Coelho | 252345678 |
| Bruno Alexandre Ferraz | 352345678 |
| Vanessa Sofia Leal | 452345678 |
| Gonçalo Nuno Baptista | 552345678 |
| Raquel Isabel Antunes | 652345678 |
| Miguel Ângelo Tavares | 752345678 |
| Sónia Cristina Peixoto | 852345678 |
| Artur Filipe Nascimento | 952345678 |
| Elisa Maria Figueiredo | 162345678 |
| Nelson Jorge Pacheco | 262345678 |
| Álvaro Filipe Machado | 462345678 |

**Recommended fix:** Replace the sequential NIFs with 50 NIFs that satisfy the checksum. A generator that computes the correct check digit for a random 8-digit prefix (starting with 1, 2, or 3) is straightforward to script. The seed is idempotent via primary-key conflict, so re-seeding after the fix is safe.

---

### F-02 ⚠️ NIF Entity Type — 25 NIFs have non-individual first digit

**Severity:** Medium — not a data-loss risk in dev, but realistic test coverage requires individual-taxpayer NIFs.

In the Portuguese NIF system, the first digit encodes the entity type:
- `1`, `2`, `3` → individual taxpayer (residents and non-residents)
- `5` → collective entity (company)
- `6` → public sector
- `7` → irregular collective
- `8` → sole-trader (empresário em nome individual)
- `9` → non-resident collective / "número de contribuinte" for foreign individuals

All 50 patients should have first digits in `{1, 2, 3}` to model individual patients correctly.

**Affected patients (25):**

| First digit | Count | Example |
|---|---|---|
| 0 | 1 | João Pedro Alves (012345678) |
| 4 | 6 | Carlos Alberto Rodrigues (456789012), Hugo Filipe Teixeira (412345678), Mónica Isabel Correia (432345678), Vanessa Sofia Leal (452345678), Hélder António Ramos (442345678), Álvaro Filipe Machado (462345678) |
| 5 | 5 | Susana Isabel Martins (567890123), Margarida Leonor Nunes (512345678), Vítor Manuel Barbosa (532345678), Cláudia Isabel Esteves (542345678), Gonçalo Nuno Baptista (552345678) |
| 6 | 5 | Paulo Alexandre Sousa (678901234), Ricardo José Oliveira (612345678), Daniela Sofia Monteiro (632345678), Pedro Miguel Cunha (642345678), Raquel Isabel Antunes (652345678) |
| 7 | 5 | Filipa Margarida Gonçalves (789012345), Sara Filomena Pinto (712345678), Fernando Jorge Mendes (732345678), Teresa Raquel Marques (742345678), Miguel Ângelo Tavares (752345678) |
| 8 | 5 | Rui Miguel Carvalho (890123456), Marco António Fernandes (812345678), Paula Cristina Vieira (832345678), Sérgio Alexandre Branco (842345678), Sónia Cristina Peixoto (852345678) |
| 9 | 3 | Inês Catarina Lopes (901234567), Joana Cristina Ribeiro (912345678), Patrícia Manuela Leite (942345678), Luís Filipe Cardoso (932345678), Artur Filipe Nascimento (952345678) |

Note: First digit `9` is technically used for non-resident individuals in Portugal, which is valid for a patient but uncommon in a local Oeiras/Castelo Branco clinical dataset.

---

### F-03 ⚠️ Barcarena Postal Codes — 2795 used, should be 2730

**Severity:** Medium — cosmetic for dev, but breaks any geo/postal-code validation logic.

4 patients are listed with `city: "Barcarena"` but `postalCode` in the `2795` range:

| Patient | Postal code | Assigned city |
|---|---|---|
| Paulo Alexandre Sousa | 2795-005 | Barcarena |
| Nuno Ricardo Pereira | 2795-010 | Barcarena |
| Sara Filomena Pinto | 2795-015 | Barcarena |
| Mónica Isabel Correia | 2795-021 | Barcarena |

The `2795` postal code prefix belongs to the Linda-a-Velha / Queijas area (Oeiras municipality). Barcarena (a separate civil parish in the same municipality) has its own prefix range: **2730-XXX**. The seed appears to have borrowed nearby Linda-a-Velha postal codes for Barcarena patients.

**Options:**  
a. Change postal codes to the correct 2730 range (e.g. `2730-001` → `2730-025`).  
b. Re-label the city as `"Linda-a-Velha"` for these 4 patients and keep 2795 codes.

---

### F-04 ⚠️ Phone Prefix Distribution — only 91 and 96 used

**Severity:** Low — advisory only.

All 50 phones use two prefixes: 91 (Vodafone) for the Linda-a-Velha cohort and 96 (NOS) for Castelo Branco. Portugal's three main mobile operators each have their own prefix blocks:
- **91** — Vodafone
- **92** — NOS (historic Optimus block)
- **93** — MEO (TMN / Altice) — most common carrier in Portugal by subscriber share
- **96** — NOS

MEO/93 and the second NOS/92 block are absent. For any future tests that check or display carrier data this is a gap.

---

### F-05 ℹ️ Sequential Phone Numbers and NIFs (by design)

**Severity:** Informational — not a defect, but worth documenting.

Phone numbers (`+351912345001` → `+351912345025`, `+351969345001` → `+351969345025`) and NIFs (`123456789`, `234567890`, ...) are obviously sequential. This is intentional — the seed comment notes these are "realistic-looking" data for UI/UX testing, not clinically accurate records. The sequential nature makes it easy to identify seed records in the dev DB.

The seed safety guard in the script (`if DATABASE_URL.includes(PROD_REF)`) correctly prevents accidental seeding to production.

---

## Passes (no action needed)

| Check | Detail |
|---|---|
| **50 patients** | Correct count ✓ |
| **Names** | All 50 are plausible two- or three-word Portuguese names, correctly capitalized ✓ |
| **Postal code format** | All 50 match `\d{4}-\d{3}` ✓ |
| **Phone format** | All 50 match `+351(91\|96)\d{7}` ✓ |
| **Email format** | All 50 are valid `user@domain.tld` format ✓ |
| **Sex values** | All 50 are `male` or `female` — valid schema enum values ✓ |
| **UUID uniqueness** | 50 distinct UUIDs ✓ |
| **NIF uniqueness** | 50 distinct NIFs ✓ |
| **Phone uniqueness** | 50 distinct phone numbers ✓ |
| **Email uniqueness** | 50 distinct email addresses ✓ |
| **Full-name uniqueness** | 50 distinct names ✓ |
| **Date of birth** | Ages 28–61 (as of 2026-06-19), avg 43 — plausible PT osteopathy patient population ✓ |
| **Linda-a-Velha / Queijas postal codes** | `2795-xxx` — correct for both civil parishes ✓ |
| **Carnaxide postal code** | `2790-001` — correct for Carnaxide ✓ |
| **Castelo Branco postal codes** | `6000-xxx` range — all 25 correct ✓ |
| **Tenant ID** | All patients carry the dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` (confirmed in seed script) ✓ |
| **No authUserId** | Intentionally absent — patients are un-activated, correct for dev seed ✓ |
| **idempotent seed** | `onConflictDoNothing()` on primary key — re-running the seed is safe ✓ |

---

## Action required before seeding

1. **Run the seed** — `pnpm --filter @osteojp/db seed:patients:dev` (the table is currently empty on dev).
2. **Fix NIF checksums (F-01)** — 44 invalid NIFs will cause InvoiceXpress rejections if any dev test exercises the invoicing flow. Regenerate with correct check digits; first digit must be 1, 2, or 3 for all.
3. **Fix Barcarena postal codes (F-03)** — change 4 patients from `2795-xxx` to `2730-xxx` (or relabel city as Linda-a-Velha).

NIF entity type (F-02) and phone prefix variety (F-04) are lower priority — address in a follow-up seed update if carrier-level testing is needed.

---

## Analysis scripts

Scripts written for this QA pass (not committed — ephemeral):
- `scripts/qa-seed-query.mjs` — live read-only DB probe (row count, dup checks)
- `scripts/qa-seed-introspect.mjs` — table existence + RLS status + role confirmation
- `scripts/qa-seed-analyse.mjs` — full static analysis (all checks in this report)
