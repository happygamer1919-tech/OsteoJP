# PDF Templates — Phase 4

Design templates for all patient-facing printed documents. Built with reportlab, branded with OsteoJP logo, teal `#45B9A7` and magenta `#8B1863`.

All placeholders use `{{double_brace}}` convention, matching the email/SMS template standard.

## Files

| File | Purpose | Placeholders |
|---|---|---|
| `osteojp-invoice-template.pdf` | Fatura-recibo (fiscal invoice) | invoice_number, issue_date, due_date, status, patient_name, patient_nif, patient_address, service_description, service_date, unit_price, subtotal, total, payment_method, payment_reference, notes |
| `osteojp-clinical-report-template.pdf` | Locked clinical record printout | patient_name, patient_dob, patient_nif, episode_id, consultation_date, practitioner_name, practitioner_title, consultation_reason, background, main_complaints, diagnosis, treatment_goals, treatment_plan, observations, signature_date |
| `osteojp-declarations-template.pdf` | Two declarations: presence (p.1) + treatment (p.2) | patient_name, patient_nif, appointment_date, appointment_time, service_name, practitioner_name, treatment_start_date, treatment_end_date, session_count, diagnosis_or_reason, signature_date |

## Notes

- VAT: invoices use 0% IVA, exempt under art. 9.º n.º 1 CIVA (health services exemption)
- Clinic email placeholder left blank — pending confirmation from João Pedro (BUG-13)
- Second clinic location (Montemor-o-Novo) not yet in footer — add once opening date confirmed
- These are layout/content templates. Ivan to wire into InvoiceXpress (invoices) and the locked-record print flow (clinical report + declarations)
