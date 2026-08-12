# AiSensy Multi-Tenant Template Catalog

The submission package for the organization-neutral WhatsApp templates.

**Status as of 2026-08-12: 5 templates are `READY_FOR_SUBMISSION`. None has been
submitted, approved or activated.** Until a template reaches `ACTIVE`,
`resolveCampaign()` returns the legacy ARK-branded campaign, so production
behaviour is unchanged — see §"Rollout" at the end.

---

## Why this file exists — the part that is easy to get wrong

`send-aisensy` posts `{ campaignName, templateParams }`. **Meta renders its own
approved body** from those positional parameters. The template body in this
repository never reaches WhatsApp; it is used for email, the queue payload and
previews.

So `ark_attendance_absent` — whose approved Meta body ends
*"Thank you, ARK Learning Arena"* — sends that text to **every** tenant's
parents, no matter what our local template says. Adding `{{org_name}}` to the
local body fixed email and previews and changed nothing about the WhatsApp
message. The only real fix is a new approved template that takes the
organization name **as a parameter**.

**Naming:** `smartark_` prefix — the template is owned by the platform and
shared by every organization. `ark_` would repeat the original mistake.

**Parameter ordering rule:** `org_name` is appended as the **last** parameter of
each template, so the legacy positional order is preserved verbatim and only a
trailing parameter is added. Inserting it in the middle would silently shift
every later parameter and send a date where a name belongs.

A build gate (`src/test/security/commsAutomation.test.ts` §6) enforces: each
parameter appears exactly once, numbering runs `1..n` with no gaps, order is
ascending, and `org_name` is last.

---

## 1. `smartark_attendance_absent`

| Field | Value |
|---|---|
| **Event** | Student marked absent |
| **Internal key** | `attendance_absent` |
| **Legacy campaign** | `ark_attendance_absent` |
| **Category** | UTILITY |
| **Language** | en |
| **Recipient** | Parent |
| **Trigger** | Submit Attendance, synchronously |
| **Timing** | Immediate |
| **Quiet hours** | Deferred to `quiet_end`, never dropped |
| **Status** | READY_FOR_SUBMISSION |

**Body**
```
Dear {{1}},

This is to inform you that {{2}} (Class {{3}} - {{4}}) was marked ABSENT on {{5}}.

If your child was present or if this attendance was marked incorrectly, please contact the school office.

Thank you,
{{6}}
```

| # | Variable | Meaning | Sample |
|---|---|---|---|
| 1 | `parent_name` | Parent's name | Rekha S |
| 2 | `student_name` | Student's name | Arjun S |
| 3 | `class` | Standard | 7 |
| 4 | `section` | Section | B |
| 5 | `attendance_date` | Date marked | 2026-08-12 |
| 6 | `org_name` | Institution | *(tenant-resolved)* |

**ARK preview** — sign-off reads `ARK Learning Arena`
**ABC preview** — identical body, sign-off reads `ABC Academi`

**Utility justification:** triggered by a specific event affecting the
recipient's own child; informational; no promotion; the parent has an existing
relationship with the institution.
**Rejection risks:** low. Closest concern is that "please contact the school
office" reads as a call to action — it is a support instruction, not marketing.

---

## 2. `smartark_attendance_corrected`

| Field | Value |
|---|---|
| **Event** | Attendance corrected | **Internal key** `attendance_corrected` |
| **Legacy campaign** | `ark_attendance_corrected` |
| **Category** | UTILITY · **Language** en · **Recipient** Parent |
| **Trigger** | An already-notified absence is changed to PRESENT |
| **Timing** | Immediate · **Status** READY_FOR_SUBMISSION |

**Body**
```
Dear {{1}},

This is to inform you that the attendance for {{2}} on {{3}} has been corrected to PRESENT.

Thank you.

{{4}}
```

| # | Variable | Sample |
|---|---|---|
| 1 | `parent_name` | Rekha S |
| 2 | `student_name` | Arjun S |
| 3 | `attendance_date` | 2026-08-12 |
| 4 | `org_name` | *(tenant-resolved)* |

**Utility justification:** a correction to a previous factual notification —
close to the archetypal utility message.
**Rejection risks:** very low.

---

## 3. `smartark_staff_credentials1`

| Field | Value |
|---|---|
| **Event** | Staff credentials · **Internal key** `staff_credentials` |
| **Legacy campaign** | `staff_credentials` |
| **Category** | UTILITY · **Recipient** Staff member |
| **Trigger** | Staff account created / welcome resent / password reset |
| **Timing** | Immediate · **Status** READY_FOR_SUBMISSION |
| **Previously** | **REJECTED** — see `AISENSY_CREDENTIAL_TEMPLATE_REVIEW.md` |

**Body**
```
Dear {{1}},

Your staff portal account has been created.

Role: {{2}}
Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
{{6}}
```

| # | Variable | Sample |
|---|---|---|
| 1 | `staff_name` | Priya M |
| 2 | `role` | Teacher |
| 3 | `login_email` | priya@example.com |
| 4 | `password` | *(ephemeral — never persisted)* |
| 5 | `login_url` | https://…/login |
| 6 | `org_name` | *(tenant-resolved)* |

**Why the original was rejected:** `{{6}}` appeared twice and the parameters ran
`1, 6, 2, 3, 4, 5, 6` — not ascending. Both are structural violations judged
before any content review, which is why rewording alone never helped.
**Known rejection risk (real):** it contains a password. Meta may insist this
belongs in the **Authentication** category, whose fixed format cannot carry
`Role:` or `Login Email:`. If rejected again, switch to the set-password-link
flow rather than resubmitting — full argument in the credential review doc.
**Note:** the campaign name carries a `1` suffix because a rejected name cannot
be reused. It is a fresh identifier, not a version.

---

## 4. `smartark_student_credentials1`

Same structure, shape and risks as §3, for the Parent Portal.

**Body**
```
Dear {{1}},

The Parent Portal account for {{2}} has been created.

Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login. Keep these details confidential.

Thank you,
{{6}}
```

| # | Variable | Sample |
|---|---|---|
| 1 | `parent_name` | Rekha S |
| 2 | `student_name` | Arjun S |
| 3 | `login_email` | rekha@example.com |
| 4 | `password` | *(ephemeral)* |
| 5 | `login_url` | https://…/login |
| 6 | `org_name` | *(tenant-resolved)* |

---

## 5. `smartark_fee_receipt`

| Field | Value |
|---|---|
| **Event** | Fee paid receipt · **Internal key** `fee_receipt` / event `fee_paid` |
| **Legacy campaign** | `fee_receipt` |
| **Category** | UTILITY · **Recipient** Parent |
| **Trigger** | Payment collected · **Timing** Immediate |
| **Status** | READY_FOR_SUBMISSION |

**Body**
```
Dear {{1}}, we have received a fee payment for {{2}} (Class {{3}}).
Receipt No: {{4}}
Amount Paid: ₹{{5}}
Pending Balance: ₹{{6}}
Thank you. — {{7}}
```

| # | Variable | Sample |
|---|---|---|
| 1 | `parent_name` | Rekha S |
| 2 | `student_name` | Arjun S |
| 3 | `class` | 7 |
| 4 | `receipt_no` | RCP-2026-0412 |
| 5 | `amount_paid` | 12000 |
| 6 | `pending_balance` | 3000 |
| 7 | `org_name` | *(tenant-resolved)* |

**Utility justification:** a transaction receipt — the least ambiguous utility
case there is.
**Important:** `fee_paid` executes through `feeReceiptDelivery.service`, a
legacy working flow deliberately **not** migrated. This entry exists so the
campaign can be approved ahead of any future migration. **Activating it does not
change the fee receipt execution path.**

---

## Coverage — stated honestly

**5 provider templates for 32 events.** The other 27 events send through
whatever `providerName` their canonical template already carries, which for
several is still an `ark_`-prefixed campaign. Those are not multi-tenant yet.

`isBrandingLeaked(templateKey)` returns true for every template that is not
`ACTIVE` — which today is **all of them** — so the leak is queryable in code
rather than something to remember.

The 11 Academics templates added in this phase are staff-facing and currently
have **no provider entry at all**; they render locally for email and preview.
Before any of them sends WhatsApp to a non-ARK tenant, each needs a
`smartark_*` campaign here, approved.

## Rollout

```
READY_FOR_SUBMISSION → SUBMITTED → APPROVED → (test send verified) → ACTIVE
```

`resolveCampaign()` returns the new campaign **only** at `ACTIVE`. Every other
state falls back to the legacy campaign, so ARK's live communication is
untouched by this file until somebody deliberately flips a status. Rollback is
one status change.

**Do not mark anything ACTIVE before Meta approves it and a test send is
verified.** `SENDABLE_STATUS` is the single constant that decides.
