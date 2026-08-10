# AiSensy — Multi-Tenant Template Submission

**Copy-paste ready.** Every field below is exactly what to enter in the AiSensy
template editor. Nothing here requires a judgement call.

---

## Why these are NEW templates, not edits

`send-aisensy` posts `{ campaignName, templateParams }`. **Meta renders its own
approved body** using those positional parameters — the body in this repository
never reaches WhatsApp.

The templates in production today (`ark_attendance_absent`, …) have
"ARK Learning Arena" baked into the approved body at Meta. Every tenant's parents
therefore receive ARK's name. Editing the local body does not change that; only a
new approved template that accepts the organization name as a parameter does.

**Do not edit the existing approved templates.** Meta re-review on an in-use
template can suspend sending. These are additions; the old ones stay live until
each new one is approved and verified.

---

## Cutover rule

```
READY_FOR_SUBMISSION → SUBMITTED → APPROVED → (test send verified) → ACTIVE
```

`resolveCampaign()` returns the **legacy** campaign for every status except
`ACTIVE`. So submitting and approving a template changes nothing in production
until a human edits the status in `providerTemplates.ts`. That is deliberate:
approval is a third-party event this codebase cannot observe.

---

## Template 1 — attendance_absent

| | |
|---|---|
| **Campaign name** | `smartark_attendance_absent` |
| **Category** | UTILITY |
| **Language** | English |
| Replaces (keep live) | `ark_attendance_absent` |
| ERP event | `attendance_absent` |
| Current status | READY_FOR_SUBMISSION |

**Body — paste exactly:**

```
Dear {{1}},

This is to inform you that {{2}} (Class {{3}} - {{4}}) was marked ABSENT on {{5}}.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
{{6}}
```

**Variable mapping:**

| Position | Variable |
|---|---|
| `{{1}}` | `parent_name` |
| `{{2}}` | `student_name` |
| `{{3}}` | `class` |
| `{{4}}` | `section` |
| `{{5}}` | `attendance_date` |
| `{{6}}` | `org_name` |

**Sample values (for AiSensy's preview fields):**

- `{{1}}` — Mr. Kumar
- `{{2}}` — Arjun
- `{{3}}` — 9th Standard
- `{{4}}` — A
- `{{5}}` — 10 Aug 2026
- `{{6}}` — ARK Learning Arena

**Renders as:**

```
Dear Mr. Kumar,

This is to inform you that Arjun (Class 9th Standard - A) was marked ABSENT on 10 Aug 2026.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
ARK Learning Arena
```

**Same template, second organization:**

```
Dear Mr. Kumar,

This is to inform you that Arjun (Class 9th Standard - A) was marked ABSENT on 10 Aug 2026.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
ABC Academy
```

---

## Template 2 — attendance_corrected

| | |
|---|---|
| **Campaign name** | `smartark_attendance_corrected` |
| **Category** | UTILITY |
| **Language** | English |
| Replaces (keep live) | `ark_attendance_corrected` |
| ERP event | `attendance_corrected` |
| Current status | READY_FOR_SUBMISSION |

**Body — paste exactly:**

```
Dear {{1}},

This is to inform you that the attendance for {{2}} on {{3}} has been corrected to PRESENT.

Thank you.

{{4}}
```

**Variable mapping:**

| Position | Variable |
|---|---|
| `{{1}}` | `parent_name` |
| `{{2}}` | `student_name` |
| `{{3}}` | `attendance_date` |
| `{{4}}` | `org_name` |

**Sample values (for AiSensy's preview fields):**

- `{{1}}` — Mr. Kumar
- `{{2}}` — Arjun
- `{{3}}` — 10 Aug 2026
- `{{4}}` — ARK Learning Arena

**Renders as:**

```
Dear Mr. Kumar,

This is to inform you that the attendance for Arjun on 10 Aug 2026 has been corrected to PRESENT.

Thank you.

ARK Learning Arena
```

**Same template, second organization:**

```
Dear Mr. Kumar,

This is to inform you that the attendance for Arjun on 10 Aug 2026 has been corrected to PRESENT.

Thank you.

ABC Academy
```

---

## Template 3 — staff_credentials

| | |
|---|---|
| **Campaign name** | `smartark_staff_credentials` |
| **Category** | UTILITY |
| **Language** | English |
| Replaces (keep live) | `staff_credentials` |
| ERP event | `staff_credentials` |
| Current status | READY_FOR_SUBMISSION |

**Body — paste exactly:**

```
Dear {{1}},

Your {{6}} staff portal account has been created.

Role: {{2}}
Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
{{6}}
```

**Variable mapping:**

| Position | Variable |
|---|---|
| `{{1}}` | `staff_name` |
| `{{2}}` | `role` |
| `{{3}}` | `login_email` |
| `{{4}}` | `password` |
| `{{5}}` | `login_url` |
| `{{6}}` | `org_name` |

**Sample values (for AiSensy's preview fields):**

- `{{1}}` — Priya S
- `{{2}}` — Teacher
- `{{3}}` — priya@example.com
- `{{4}}` — Tmp#4821
- `{{5}}` — https://smart-ark-main.vercel.app/login
- `{{6}}` — ARK Learning Arena

**Renders as:**

```
Dear Priya S,

Your ARK Learning Arena staff portal account has been created.

Role: Teacher
Login Email: priya@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark-main.vercel.app/login

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ARK Learning Arena
```

**Same template, second organization:**

```
Dear Priya S,

Your ABC Academy staff portal account has been created.

Role: Teacher
Login Email: priya@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark-main.vercel.app/login

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ABC Academy
```

---

## Template 4 — student_credentials

| | |
|---|---|
| **Campaign name** | `smartark_student_credentials` |
| **Category** | UTILITY |
| **Language** | English |
| Replaces (keep live) | `parent_credentials` |
| ERP event | `student_credentials` |
| Current status | READY_FOR_SUBMISSION |

**Body — paste exactly:**

```
Dear {{1}},

The {{6}} Parent Portal account for {{2}} has been created.

Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
{{6}}
```

**Variable mapping:**

| Position | Variable |
|---|---|
| `{{1}}` | `parent_name` |
| `{{2}}` | `student_name` |
| `{{3}}` | `login_email` |
| `{{4}}` | `password` |
| `{{5}}` | `login_url` |
| `{{6}}` | `org_name` |

**Sample values (for AiSensy's preview fields):**

- `{{1}}` — Mr. Kumar
- `{{2}}` — Arjun
- `{{3}}` — priya@example.com
- `{{4}}` — Tmp#4821
- `{{5}}` — https://smart-ark-main.vercel.app/login
- `{{6}}` — ARK Learning Arena

**Renders as:**

```
Dear Mr. Kumar,

The ARK Learning Arena Parent Portal account for Arjun has been created.

Login Email: priya@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark-main.vercel.app/login

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ARK Learning Arena
```

**Same template, second organization:**

```
Dear Mr. Kumar,

The ABC Academy Parent Portal account for Arjun has been created.

Login Email: priya@example.com
Temporary Password: Tmp#4821
Portal: https://smart-ark-main.vercel.app/login

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
ABC Academy
```

---

## Template 5 — fee_receipt

| | |
|---|---|
| **Campaign name** | `smartark_fee_receipt` |
| **Category** | UTILITY |
| **Language** | English |
| Replaces (keep live) | `fee_receipt` |
| ERP event | `fee_paid` |
| Current status | READY_FOR_SUBMISSION |

**Body — paste exactly:**

```
Dear {{1}}, we have received a fee payment for {{2}} (Class {{3}}).
Receipt No: {{4}}
Amount Paid: ₹{{5}}
Pending Balance: ₹{{6}}
Thank you. — {{7}}
```

**Variable mapping:**

| Position | Variable |
|---|---|
| `{{1}}` | `parent_name` |
| `{{2}}` | `student_name` |
| `{{3}}` | `class` |
| `{{4}}` | `receipt_no` |
| `{{5}}` | `amount_paid` |
| `{{6}}` | `pending_balance` |
| `{{7}}` | `org_name` |

**Sample values (for AiSensy's preview fields):**

- `{{1}}` — Mr. Kumar
- `{{2}}` — Arjun
- `{{3}}` — 9th Standard
- `{{4}}` — RCP-2026-0417
- `{{5}}` — 12,400
- `{{6}}` — 3,600
- `{{7}}` — ARK Learning Arena

**Renders as:**

```
Dear Mr. Kumar, we have received a fee payment for Arjun (Class 9th Standard).
Receipt No: RCP-2026-0417
Amount Paid: ₹12,400
Pending Balance: ₹3,600
Thank you. — ARK Learning Arena
```

**Same template, second organization:**

```
Dear Mr. Kumar, we have received a fee payment for Arjun (Class 9th Standard).
Receipt No: RCP-2026-0417
Amount Paid: ₹12,400
Pending Balance: ₹3,600
Thank you. — ABC Academy
```

---

## Migration tracker

| Legacy campaign | New campaign | Status | In production today |
|---|---|---|---|
| `ark_attendance_absent` | `smartark_attendance_absent` | READY_FOR_SUBMISSION | **LEGACY** |
| `ark_attendance_corrected` | `smartark_attendance_corrected` | READY_FOR_SUBMISSION | **LEGACY** |
| `staff_credentials` | `smartark_staff_credentials` | READY_FOR_SUBMISSION | **LEGACY** |
| `parent_credentials` | `smartark_student_credentials` | READY_FOR_SUBMISSION | **LEGACY** |
| `fee_receipt` | `smartark_fee_receipt` | READY_FOR_SUBMISSION | **LEGACY** |

---

## Submission procedure

1. AiSensy → Templates → **Create new**. Do not edit an existing one.
2. Paste the campaign name, category and body verbatim from above.
3. Fill the sample values — Meta rejects templates with empty preview params.
4. Submit. Set the entry's `status` to `SUBMITTED` in
   `src/features/communication/constants/providerTemplates.ts`.
5. On approval, set `status: "APPROVED"`. **Still not live.**
6. Send a test through Communication Center and read the received message.
7. Only then set `status: "ACTIVE"` and deploy. That single edit is the cutover.

## Rollback

Set the status back to `APPROVED` and deploy. `resolveCampaign()` immediately
returns the legacy campaign again. No data change, no migration, no Meta action.

## Not in this batch

Templates that fall back to sending the whole rendered body as `{{1}}`
(`exam_reminder`, `birthday_wish`, `fee_due_reminder`, `exam_result`, …) already
carry whatever body this repository renders, so `{{org_name}}` reaches the parent
through the existing approved single-parameter template. They need no
re-approval — which is why they are absent here.
