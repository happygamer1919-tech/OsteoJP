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
/* 1. WHAT IT DOES: TWO NEW TABLES, AND NOTHING ELSE CHANGES              */
/* ====================================================================== */
/* public.pack_instance_agreed_prices, one row per pacote instance at     */
/* most: the TOTAL price agreed with the patient, in cents, typed by       */
/* reception at the sale or at the first payment (owner P2: the catalogue  */
/* price is shown beside the field and never pre-filled). SET ONCE BY ITS  */
/* PRIMARY KEY (pack_instance_id): a second price for the same instance is */
/* a key violation, and there is no UPDATE and no DELETE for any role. No  */
/* row means nobody has stated the price, which is not zero: the screen    */
/* says "Preco por indicar", never a number taken from the catalogue. No   */
/* backfill: every instance running today has no row.                     */
/*                                                                        */
/* WHY A SIDE TABLE AND NOT A COLUMN ON patient_pack_instances (the lead's */
/* decision of 2026-11-05, on review). A column there would sit under      */
/* 0037's tenant-only FOR ALL policy, so every therapist could read the    */
/* price, and setting it once would need the table-level UPDATE on         */
/* instances revoked, a column grant and two restrictive policies, which   */
/* would also bind every future row lock and every future instance write.  */
/* A side table has its own policies (therapists read nothing), makes the  */
/* set-once rule a primary key, and leaves patient_pack_instances' grants  */
/* and policies EXACTLY as they are.                                      */
/*                                                                        */
/* public.pack_instance_payments, one row per movement of money:           */
/*   pagamento   money received,          amount > 0, method required;     */
/*   reembolso   money given back,        amount < 0, method and reason    */
/*               required;                                                */
/*   correcao    an adjustment so the platform matches Stylus,             */
/*               amount <> 0, reason required, method optional.            */
/* received_on is the Lisbon calendar date the money moved, not before     */
/* 2020-01-01 (the application also refuses a date after today). location_ */
/* id is the clinic that took it (Stylus separates sales by posto).        */
/* stylus_ref is the Stylus document reference, copied by hand, optional   */
/* (owner P3: Stylus first, the reference flagged when missing), at most   */
/* 40 characters and never blank. reason is the free text of a refund or a */
/* correction, at most 500 characters; it lives HERE and never in          */
/* audit_log.metadata (0083's precedent and the PII-free contract).        */
/* corrects_id may point at the line a refund or correction answers, and   */
/* only at a line of the SAME instance (a composite key).                  */
/*                                                                        */
/* Derived, never stored: received = sum(amount_cents); due = the agreed   */
/* price + coalesce(switch_amount_cents, 0) (0083).                       */
/*                                                                        */
/* APPEND ONLY, BOTH TABLES. No UPDATE and no DELETE grant for any         */
/* application role. A mistake is answered by a new line.                  */
/*                                                                        */
/* ====================================================================== */
/* 2. WHO READS, WHO WRITES                                               */
/* ====================================================================== */
/* By RLS (ENABLE, not FORCE, as everywhere), one policy per command,      */
/* never FOR ALL, on each table:                                          */
/*   SELECT  owner, admin and reception of the row's tenant. A THERAPIST   */
/*           READS NO ROW OF EITHER TABLE (owner P4: therapists see no     */
/*           amounts).                                                    */
/*   INSERT  owner, admin and reception of the row's tenant; the row names */
/*           its creator (created_by = auth.uid()); the instance is of the */
/*           caller's own tenant; on a payment line the clinic is too, and */
/*           a correcao is owner or admin only.                           */
/*   UPDATE, DELETE, TRUNCATE   nobody (no grant).                         */
/*                                                                        */
/* The table gates follow 0106: REVOKE ALL by name from PUBLIC, anon,      */
/* authenticated, patient and service_role (the platform's default         */
/* privileges hand authenticated and service_role every privilege at       */
/* CREATE TABLE, and a REVOKE from PUBLIC does not touch a role granted by */
/* name), then authenticated SELECT and INSERT, and nothing else.          */
/*                                                                        */
/* NO FUNCTION. This file creates no function, SECURITY DEFINER or other,  */
/* so the definer count does not move. It alters no existing table, no    */
/* existing grant and no existing policy.                                 */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCKS, read from the statements, in order                       */
/* ====================================================================== */
/* Sections A to D touch only the two new tables. Section E adds their    */
/* keys, ONE ALTER PER KEY: each takes SHARE ROW EXCLUSIVE on the table it */
/* references (tenants, patient_pack_instances, locations, users) until    */
/* the COMMIT (writes to them wait, reads do not). Section F is the four   */
/* CREATE POLICY statements, LAST, because each takes the platform locks   */
/* 0106 describes until the COMMIT. This file creates policies, so its     */
/* sitting is closed hours only, never R9.                                */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* A. THE TABLES                                                          */
/* ====================================================================== */
/* The keys to existing tables are added in section E, so nothing here     */
/* locks an existing table.                                               */
CREATE TABLE public.pack_instance_agreed_prices (
  pack_instance_id   uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  agreed_price_cents integer NOT NULL
    CONSTRAINT pack_instance_agreed_prices_amount_range
    CHECK (agreed_price_cents BETWEEN 0 AND 10000000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid
);--> statement-breakpoint

COMMENT ON TABLE public.pack_instance_agreed_prices IS
  'The TOTAL price agreed with the patient for one pacote instance, in cents, '
  'typed by reception at the sale or at the first payment (owner P2, 2026-11-05: '
  'the catalogue price is shown beside the field and never pre-filled). One row '
  'at most per instance (the primary key), never updated, never deleted: set '
  'once. No row means nobody has stated it, which is not zero. Internal record, '
  'not a fiscal document: Stylus stays the fiscal system (S1).';--> statement-breakpoint

/* The self key (id, pack_instance_id) is unique so a line can point at    */
/* another line of the same instance.                                     */
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
  received_on      date NOT NULL
    CONSTRAINT pack_instance_payments_received_on_floor
    CHECK (received_on >= DATE '2020-01-01'),
  method           text
    CONSTRAINT pack_instance_payments_method_known
    CHECK (method IS NULL OR method IN ('numerario', 'mbway', 'multibanco', 'cartao', 'transferencia', 'outro')),
  stylus_ref       text
    CONSTRAINT pack_instance_payments_stylus_ref_shape
    CHECK (stylus_ref IS NULL OR (btrim(stylus_ref) <> '' AND char_length(stylus_ref) <= 40)),
  reason           text
    CONSTRAINT pack_instance_payments_reason_shape
    CHECK (reason IS NULL OR (btrim(reason) <> '' AND char_length(reason) <= 500)),
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
/* B. ROW LEVEL SECURITY ON                                               */
/* ====================================================================== */
/* Until section F runs both tables have RLS on and no policy, which       */
/* admits no application role: the safe side, inside this one transaction. */
ALTER TABLE public.pack_instance_agreed_prices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.pack_instance_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ====================================================================== */
/* C. THE TABLE GATES                                                     */
/* ====================================================================== */
REVOKE ALL ON TABLE public.pack_instance_agreed_prices FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.pack_instance_agreed_prices TO authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE public.pack_instance_payments FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.pack_instance_payments TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* D. (no statement) patient_pack_instances is NOT altered                */
/* ====================================================================== */
/* Its columns, grants and policies stay exactly as on main (0037, 0067,   */
/* 0083). Said here because an earlier draft altered it.                  */

/* ====================================================================== */
/* E. THE KEYS, ONE ALTER PER KEY                                         */
/* ====================================================================== */
/* One ALTER per key, so every reader of this file that walks foreign keys */
/* statement by statement sees each one. TENANT, INSTANCE, CLINIC: NO      */
/* ACTION, as 0106. A price or a line keeps its instance alive: an         */
/* instance with money history cannot be deleted out from under it.        */
/* CREATOR: SET NULL, so deleting a staff account never deletes money      */
/* history. THE SELF KEY is composite, so a refund or a correction can     */
/* only answer a line of its own instance.                                */
ALTER TABLE public.pack_instance_agreed_prices
  ADD CONSTRAINT pack_instance_agreed_prices_pack_instance_id_fkey FOREIGN KEY (pack_instance_id) REFERENCES public.patient_pack_instances(id);--> statement-breakpoint
ALTER TABLE public.pack_instance_agreed_prices
  ADD CONSTRAINT pack_instance_agreed_prices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);--> statement-breakpoint
ALTER TABLE public.pack_instance_agreed_prices
  ADD CONSTRAINT pack_instance_agreed_prices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE public.pack_instance_payments
  ADD CONSTRAINT pack_instance_payments_pack_instance_id_fkey FOREIGN KEY (pack_instance_id) REFERENCES public.patient_pack_instances(id);--> statement-breakpoint
ALTER TABLE public.pack_instance_payments
  ADD CONSTRAINT pack_instance_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);--> statement-breakpoint
ALTER TABLE public.pack_instance_payments
  ADD CONSTRAINT pack_instance_payments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);--> statement-breakpoint
ALTER TABLE public.pack_instance_payments
  ADD CONSTRAINT pack_instance_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE public.pack_instance_payments
  ADD CONSTRAINT pack_instance_payments_corrects_fkey FOREIGN KEY (corrects_id, pack_instance_id) REFERENCES public.pack_instance_payments(id, pack_instance_id);--> statement-breakpoint

/* ====================================================================== */
/* F. WHO READS AND WHO WRITES: THE LAST FOUR STATEMENTS                  */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE. Each PERMISSIVE, TO authenticated, keyed on the  */
/* JWT tenant first. Every helper call is wrapped as (SELECT ...), so it   */
/* is evaluated once per statement (0071, 0073).                          */
CREATE POLICY pack_instance_agreed_prices_staff_select ON public.pack_instance_agreed_prices
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
  );--> statement-breakpoint

CREATE POLICY pack_instance_agreed_prices_staff_insert ON public.pack_instance_agreed_prices
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
    AND created_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.patient_pack_instances i WHERE i.id = pack_instance_agreed_prices.pack_instance_id AND i.tenant_id = (SELECT public.jwt_tenant_id()))
  );--> statement-breakpoint

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
