/* ====================================================================== */
/* PENDING, AND IT FOLLOWS 0114. Pack payments: the agreed price of a     */
/* pacote and an append-only list of the money received for it.           */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. Packs em uso shows a PAGAMENTO column with empty    */
/* cells, because nothing in the platform records what a patient agreed   */
/* to pay for a pacote or what was received. The design note of            */
/* 2026-11-03 (U4 b) proposed option C, and the owner answered "yes to all */
/* recommendations" on 2026-11-05: a price agreed per pacote instance,     */
/* typed by reception, and a list of payment lines per instance, never     */
/* edited and never deleted. Strategy ruled the item on 2026-11-05 (B4):   */
/* "Pack payments must reconcile with Stylus ruling S2 and never touch an  */
/* invoices table."                                                        */
/*                                                                        */
/* THIS IS NOT INVOICING. Stylus stays the fiscal system (S1). The         */
/* platform numbers nothing, issues nothing and posts nothing. A line here */
/* is an internal record that money moved, with the Stylus document's      */
/* reference COPIED by hand when there is one. S2 excludes pacote sales    */
/* and pacote sessions from any automatic posting; this file touches no    */
/* invoices row, no invoices column and no function that reads invoices.   */
/*                                                                        */
/* NO NUMBER YET, BY CONSTRUCTION. Strategy numbered this item 0115, after */
/* the clinic closures item 0114, which is authored on its own branch      */
/* (db/LOC-CLOSED-0114-clinic-closures). This file depends on NOTHING in   */
/* 0114: it names no object 0114 creates. It must follow 0114 only        */
/* because strategy ruled that order and because the journal order must    */
/* equal the file order. It takes 0115 at its promotion, after 0114 is     */
/* applied and merged.                                                    */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/*   - patient_pack_instances.agreed_price_cents integer NULL, >= 0, NO    */
/*     DEFAULT. The TOTAL price agreed with the patient for this pacote,   */
/*     in cents. NULL means nobody has stated it, which is NOT zero (the   */
/*     NULL contract of 0083's switch_amount_cents). No backfill: every    */
/*     instance that exists today reads NULL and the screen says "Preco    */
/*     por indicar" for it, never a number taken from today's catalogue.   */
/*   - public.pack_instance_payments, one row per movement of money:       */
/*       pagamento   money received,          amount > 0, method required; */
/*       reembolso   money given back,        amount < 0, method and       */
/*                   reason required;                                     */
/*       correcao    an adjustment so the platform matches Stylus,         */
/*                   amount <> 0, reason required, method optional.        */
/*     received_on is the Lisbon calendar date the money moved. location_ */
/*     id is the clinic that took it (Stylus separates sales by posto).    */
/*     stylus_ref is the Stylus document reference, copied by hand,        */
/*     optional (owner P3: Stylus first, the reference flagged when it is  */
/*     missing), at most 40 characters and never blank. reason is the     */
/*     free text of a refund or a correction; it lives HERE and never in   */
/*     audit_log.metadata (0083's precedent and the PII-free contract).    */
/*     corrects_id may point at the line a refund or correction answers,   */
/*     and only at a line of the SAME instance (a composite key).          */
/*   - Derived, never stored: received = sum(amount_cents); due =          */
/*     agreed_price_cents + coalesce(switch_amount_cents, 0).              */
/*                                                                        */
/* APPEND ONLY. There is no UPDATE and no DELETE grant on the new table    */
/* for any application role. A mistake is answered by a new line.         */
/*                                                                        */
/* ====================================================================== */
/* 2. WHO READS, WHO WRITES                                               */
/* ====================================================================== */
/* pack_instance_payments, by RLS (ENABLE, not FORCE, as everywhere), one  */
/* policy per command, never FOR ALL:                                     */
/*   SELECT  owner, admin and reception of the row's tenant. A THERAPIST   */
/*           READS NO LINE (owner P4: therapists see no amounts).          */
/*   INSERT  owner, admin and reception of the row's tenant; the row names */
/*           its creator (created_by = auth.uid()); a correcao by owner or */
/*           admin only; the instance and the clinic are of the caller's   */
/*           own tenant.                                                  */
/*   UPDATE, DELETE, TRUNCATE   nobody (no grant).                         */
/*                                                                        */
/* patient_pack_instances.agreed_price_cents, SET ONCE:                    */
/*   Today `authenticated` holds a TABLE-level UPDATE on the instances     */
/*   (0037) under a FOR ALL policy keyed on the tenant only, although no   */
/*   application code updates the table (RB-02). A column grant beside a  */
/*   table grant would restrict nothing. So section E takes the table      */
/*   UPDATE away from every role by name and grants back exactly two      */
/*   columns: agreed_price_cents and updated_at (the bookkeeping stamp the */
/*   same statement sets).                                                */
/*   THE ORDER IS THE POINT: a table-level REVOKE of UPDATE also drops     */
/*   every COLUMN-level UPDATE grant on the table, so the column GRANT     */
/*   comes after the REVOKE. A later migration that revokes UPDATE on this */
/*   table must restate this column list, or it silently ends the price    */
/*   write.                                                               */
/*   One RESTRICTIVE policy FOR UPDATE then narrows every update of an     */
/*   instance: the row must have no agreed price yet (USING, the OLD row), */
/*   the new row must have one (WITH CHECK), and the caller must be owner, */
/*   admin or reception. So the price goes from NULL to a value exactly    */
/*   once, and never changes or goes back to NULL. A restrictive policy is */
/*   ANDed with 0037's permissive FOR ALL policy, which this file leaves   */
/*   untouched, so the tenant wall still applies.                         */
/*   A ROW LOCK IS BOUND BY IT TOO: Postgres applies an UPDATE policy's    */
/*   USING to SELECT ... FOR UPDATE / FOR SHARE, so after this file such a */
/*   lock on an instance by a therapist, or on a priced instance, finds no */
/*   row. Read on 2026-11-05: nothing in apps/ or packages/ locks an       */
/*   instance row (the booking path counts linked visits, and 0108's       */
/*   function runs as its owner). A future lock on this table must know.   */
/*   One RESTRICTIVE policy FOR INSERT: an instance may be created WITH a  */
/*   price only by owner, admin or reception ("Vender pack"). A booking    */
/*   that opens an instance writes no price and is unaffected.            */
/*   WHAT THIS TAKES AWAY, said plainly: after this file no application    */
/*   role can UPDATE any other column of an instance. Nothing does today.  */
/*   The future pacote switch (PACK-06's screen, 0083's two columns) will  */
/*   need its own grant and its own policy, in its own migration.         */
/*                                                                        */
/* The table gates follow 0106: REVOKE ALL by name from PUBLIC, anon,      */
/* authenticated, patient and service_role (the platform's default         */
/* privileges hand authenticated and service_role every privilege at       */
/* CREATE TABLE, and a REVOKE from PUBLIC does not touch a role granted by */
/* name), then authenticated SELECT and INSERT, and nothing else.          */
/*                                                                        */
/* NO FUNCTION. This file creates no function, SECURITY DEFINER or other,  */
/* so the definer count does not move.                                    */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCKS, read from the statements, in order                       */
/* ====================================================================== */
/* Section A is an ADD COLUMN with no default and an inline CHECK on an    */
/* existing table: ACCESS EXCLUSIVE on patient_pack_instances for a        */
/* catalogue change, no rewrite and no scan (every value is NULL). Bookings */
/* that open or read an instance wait for it; lock_timeout bounds the wait. */
/* Sections B to D touch only the new table. Section E changes grants on   */
/* patient_pack_instances (catalogue only). Section F adds the new table's */
/* keys: SHARE ROW EXCLUSIVE on tenants, patient_pack_instances, locations */
/* and users until the COMMIT (writes to them wait, reads do not). Section */
/* G is the CREATE POLICY statements, LAST, because each takes the         */
/* platform locks 0106 describes until the COMMIT. This file creates       */
/* policies and alters an existing table, so its sitting is closed hours   */
/* only, never R9.                                                        */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* A. THE AGREED PRICE ON THE INSTANCE                                    */
/* ====================================================================== */
/* No IF NOT EXISTS, for the reason 0081 and 0083 give: it would accept    */
/* somebody else's column of the same name. A bare ADD COLUMN raises 42701 */
/* and stops.                                                             */
ALTER TABLE public.patient_pack_instances
  ADD COLUMN agreed_price_cents integer
  CONSTRAINT patient_pack_instances_agreed_price_nonneg
  CHECK (agreed_price_cents IS NULL OR agreed_price_cents >= 0);--> statement-breakpoint

COMMENT ON COLUMN public.patient_pack_instances.agreed_price_cents IS
  'The TOTAL price agreed with the patient for this pacote, in cents, typed by '
  'reception at the sale or at the first payment (owner P2, 2026-11-05: the '
  'catalogue price is shown beside the field and never pre-filled). NULL means '
  'nobody has stated it, which is not zero. Set once: an update may only move it '
  'from NULL to a value (the restrictive update policy). Internal record, not a '
  'fiscal document: Stylus stays the fiscal system (S1).';--> statement-breakpoint

/* ====================================================================== */
/* B. THE PAYMENT LINES                                                   */
/* ====================================================================== */
/* The keys to existing tables are added in section F, so nothing here     */
/* locks an existing table. The self key (id, pack_instance_id) is unique  */
/* so a line can point at another line of the same instance.               */
CREATE TABLE public.pack_instance_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  pack_instance_id uuid NOT NULL,
  location_id      uuid NOT NULL,
  kind             text NOT NULL
    CONSTRAINT pack_instance_payments_kind_known
    CHECK (kind IN ('pagamento', 'reembolso', 'correcao')),
  amount_cents     integer NOT NULL
    CONSTRAINT pack_instance_payments_amount_bounded
    CHECK (amount_cents BETWEEN -10000000 AND 10000000),
  received_on      date NOT NULL,
  method           text
    CONSTRAINT pack_instance_payments_method_known
    CHECK (method IS NULL OR method IN ('numerario', 'mbway', 'multibanco', 'cartao', 'transferencia', 'outro')),
  stylus_ref       text
    CONSTRAINT pack_instance_payments_stylus_ref_shape
    CHECK (stylus_ref IS NULL OR (btrim(stylus_ref) <> '' AND char_length(stylus_ref) <= 40)),
  reason           text
    CONSTRAINT pack_instance_payments_reason_nonblank
    CHECK (reason IS NULL OR btrim(reason) <> ''),
  corrects_id      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  CONSTRAINT pack_instance_payments_amount_sign CHECK (
    (kind = 'pagamento' AND amount_cents > 0)
    OR (kind = 'reembolso' AND amount_cents < 0)
    OR (kind = 'correcao' AND amount_cents <> 0)
  ),
  CONSTRAINT pack_instance_payments_method_required CHECK (kind = 'correcao' OR method IS NOT NULL),
  CONSTRAINT pack_instance_payments_reason_required CHECK (kind = 'pagamento' OR reason IS NOT NULL),
  CONSTRAINT pack_instance_payments_payment_answers_nothing CHECK (kind <> 'pagamento' OR corrects_id IS NULL),
  CONSTRAINT pack_instance_payments_not_self CHECK (corrects_id IS NULL OR corrects_id <> id),
  CONSTRAINT pack_instance_payments_id_instance_uq UNIQUE (id, pack_instance_id)
);--> statement-breakpoint

/* Every reader asks by (tenant, instance); the monthly total and the     */
/* reconciliation list ask by (tenant, date).                              */
CREATE INDEX pack_instance_payments_tenant_instance_idx
  ON public.pack_instance_payments (tenant_id, pack_instance_id);--> statement-breakpoint
CREATE INDEX pack_instance_payments_tenant_received_idx
  ON public.pack_instance_payments (tenant_id, received_on);--> statement-breakpoint

COMMENT ON TABLE public.pack_instance_payments IS
  'Pack payments (owner answers of 2026-11-05 to the U4 b design note, option C): '
  'an append-only internal record of the money received for one pacote instance. '
  'pagamento > 0, reembolso < 0, correcao <> 0 with a reason. Not a fiscal '
  'document: Stylus stays the fiscal system (S1), pacote sales are never posted '
  'automatically (S2), and nothing here is read by the invoices, Faturacao or '
  'Painel figures. stylus_ref is copied by hand, never generated. No update and '
  'no delete for any application role.';--> statement-breakpoint

/* ====================================================================== */
/* C. ROW LEVEL SECURITY ON                                               */
/* ====================================================================== */
/* Until section G runs the table has RLS on and no policy, which admits   */
/* no application role: the safe side, inside this one transaction.        */
ALTER TABLE public.pack_instance_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ====================================================================== */
/* D. THE NEW TABLE'S GATES                                               */
/* ====================================================================== */
REVOKE ALL ON TABLE public.pack_instance_payments FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.pack_instance_payments TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* E. THE INSTANCE'S UPDATE GATE: TWO COLUMNS, AFTER THE TABLE REVOKE     */
/* ====================================================================== */
REVOKE UPDATE ON TABLE public.patient_pack_instances FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT UPDATE (agreed_price_cents, updated_at) ON TABLE public.patient_pack_instances TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* F. THE KEYS TO TABLES THAT EXISTED BEFORE THIS FILE, AND THE SELF KEY  */
/* ====================================================================== */
/* TENANT, INSTANCE, CLINIC: NO ACTION, as 0106. A line keeps its          */
/* instance alive: an instance with money history cannot be deleted out   */
/* from under it. CREATOR: SET NULL, so deleting a staff account never     */
/* deletes money history. THE SELF KEY is composite, so a refund or a      */
/* correction can only answer a line of its own instance.                  */
ALTER TABLE public.pack_instance_payments
  ADD CONSTRAINT pack_instance_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT pack_instance_payments_pack_instance_id_fkey FOREIGN KEY (pack_instance_id) REFERENCES public.patient_pack_instances(id),
  ADD CONSTRAINT pack_instance_payments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),
  ADD CONSTRAINT pack_instance_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT pack_instance_payments_corrects_fkey FOREIGN KEY (corrects_id, pack_instance_id) REFERENCES public.pack_instance_payments(id, pack_instance_id);--> statement-breakpoint

/* ====================================================================== */
/* G. WHO READS AND WHO WRITES: THE LAST FOUR STATEMENTS                  */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE. Each TO authenticated, each keyed on the JWT     */
/* tenant first where it is permissive. Every helper call is wrapped as    */
/* (SELECT ...), so it is evaluated once per statement (0071, 0073).       */
CREATE POLICY pack_instance_payments_staff_select ON public.pack_instance_payments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint

CREATE POLICY pack_instance_payments_staff_insert ON public.pack_instance_payments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
    AND created_by = (SELECT auth.uid())
    AND (kind <> 'correcao' OR (SELECT public.jwt_role()) IN ('owner', 'admin'))
    AND EXISTS (SELECT 1 FROM public.patient_pack_instances i WHERE i.id = pack_instance_payments.pack_instance_id AND i.tenant_id = (SELECT public.jwt_tenant_id()))
    AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id = pack_instance_payments.location_id AND l.tenant_id = (SELECT public.jwt_tenant_id()))
  );--> statement-breakpoint

CREATE POLICY patient_pack_instances_agreed_price_set_once ON public.patient_pack_instances
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    agreed_price_cents IS NULL
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  )
  WITH CHECK (
    agreed_price_cents IS NOT NULL
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint

CREATE POLICY patient_pack_instances_agreed_price_on_insert ON public.patient_pack_instances
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    agreed_price_cents IS NULL
    OR (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint
