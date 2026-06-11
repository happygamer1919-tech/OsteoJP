# Twilio — PT Alphanumeric Sender ID Registration

**Status:** Pending submission  
**Action owner:** Max  
**Why it matters:** Until this is approved, SMS reminders go out from a random US number (+1 xxx), not "OsteoJP". Twilio says PT approval takes 3–10 business days. Start now.

---

## Where to submit

Twilio Console → Messaging → Sender Pool → Add Sender → Alphanumeric Sender ID → Country: Portugal

Direct URL: https://console.twilio.com/us1/develop/sms/senders/alpha-senders

---

## Form fields — paste these exactly

**Alphanumeric Sender ID**
```
OsteoJP
```
(11 chars max, no spaces. This is what appears on the patient's phone instead of a number.)

**Country**
```
Portugal
```

**Business Name**
```
OsteoJP
```

**Business Registration Number / NIF**
```
510200427
```
(No dots — some forms reject punctuation in this field.)

**Business Address**
```
Rua Fernando Namora, n.º 6
6000-140 Castelo Branco
Portugal
```

**Business Website**
```
https://osteojp.pt
```

**Use Case Category**
Select: `Notifications / Alerts` or `Healthcare` if available.

**Use Case Description** (paste verbatim)
```
OsteoJP is a licensed osteopathy and physiotherapy clinic operating two
locations in Portugal (Linda-a-Velha and Castelo Branco). We send
appointment reminder SMS messages to registered patients 24–48 hours
before their scheduled consultation. Messages are sent only to patients
who have explicitly registered with the clinic and provided their mobile
number. Each message identifies the clinic by name, includes the
appointment date and time, and provides a contact number for
cancellations. We do not send marketing messages. Message volume is low
(under 50 per day across both locations). All patient data is stored in
the EU (Supabase Frankfurt) in compliance with GDPR.
```

**Sample Message 1**
```
OsteoJP: Lembrete — tem consulta de Osteopatia amanhã, 16 Jun às 10h00,
em Linda-a-Velha. Para cancelar ligue 214 191 988.
```

**Sample Message 2**
```
OsteoJP: Lembrete — tem consulta de Fisioterapia em 2 dias, 18 Jun às
14h30, em Castelo Branco. Para cancelar ligue 272 328 221.
```

---

## After submission

- Note the submission reference number here once confirmed.
- Ping Ivan with the reference so he can add it to the Twilio account notes.
- Expected approval: 3–10 business days.
- Once approved, Ivan updates `TWILIO_SENDER_ID` env var in Vercel from the
  test number to `OsteoJP`.

---

## Submission log

| Date | Action | Reference |
|---|---|---|
| — | Not yet submitted | — |
