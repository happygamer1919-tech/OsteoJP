# JP Decision Bundle — 2026-06-17

Eight open items, all gated on JP input. Ivan, please forward this to João Pedro
as-is. We need one clear answer per item before we can build or activate the
corresponding part of the system.

---

**1. NESA intake form — clinical fields**

The patient intake questionnaire for NESA sessions has been partially built, but we
do not have a confirmed list of the clinical information it must collect from the
patient. The form cannot be finalised until JP provides the complete list of fields
required before a NESA session.

---

**2. Booking — therapist preference**

The online booking flow lets patients choose a service, a clinic, and a time slot;
the prior confirmed policy is that reception assigns the therapist, not the patient.
We need JP to confirm whether the booking form should include an optional
free-text field where the patient can name a preferred therapist — and if so, what
label or instruction to display — so we know whether to add it or leave it out.

---

**3. Late-cancellation and no-show fee**

When a patient cancels an appointment through the portal, a confirmation screen is
shown; notification messages sent for no-shows are currently worded without any
mention of a fee. JP must confirm whether a late-cancellation or no-show fee
applies, and if so, the fee amount and how many hours before the appointment the
cut-off falls, so that the correct wording appears in both the cancellation screen
and the no-show notification.

---

**4. Patient documents — which are downloadable at launch**

The portal's Documents section will list records the patient can download, such as
presence declarations and treatment declarations, but the scope has not been defined.
JP needs to confirm which document types will be available to patients from day one,
and whether a completed and signed clinical record must exist before any document is
made accessible.

---

**5. Montemor-o-Novo — visible or hidden in booking**

Montemor-o-Novo is configured in the system as a third clinic but is not yet open
for appointments. The booking flow cannot be finalised until JP confirms whether
Montemor-o-Novo should appear in the clinic list with a "Coming soon" notice, or
be hidden entirely until the clinic is ready to accept bookings.

---

**6. NESA and epilepsy — absolute or relative contraindication**

The NESA intake form includes a contraindications screening and epilepsy is one of
the items listed; if epilepsy is an absolute contraindication the system will
automatically prevent the patient from completing a NESA booking, and if it is
relative the system will flag it for the therapist to decide. The contraindications
logic cannot be shipped until JP provides a formal clinical ruling on which
classification applies.

---

**7. Phase 4 invoicing — three items**

The invoicing system is built and ready to test, but cannot go live without JP
confirming three things: (a) the VAT rate to apply — our current assumption is
23%; (b) the exact rules for protocol-patient discounts, meaning which patients
qualify and by how much; and (c) the exact label text to display to patients for
the discounted protocol rate (for example "Protocol rate" or similar). None of the
invoicing flows can be switched on until all three are confirmed.

---

**8. Brand logo — original vector file**

The colour palette used throughout the OsteoJP product was built by sampling the
logo from a PDF export, and there is a small risk that the exact colour values do
not perfectly match the original artwork. Providing the original logo file in
vector format (SVG, EPS, or AI) would let us verify the exact brand colours and
close this uncertainty permanently.
