# AiSensy / Meta — Credential Template Review

Why `staff_credentials` and `student_credentials` keep being rejected, and what
to submit instead.

Written 2026-08-12. Sources: the template bodies in
`src/features/communication/constants/providerTemplates.ts`, the send path in
`credentialWhatsapp.service.ts` / `parentCredentials.service.ts`, and Meta's
published WhatsApp Business template rules.

---

## 1. What was submitted, and what happened

Both went in as **UTILITY** templates and were **rejected**. The first bodies
were:

```
Dear {{1}}, ... Your {{6}} staff portal account has been created.
Role: {{2}}  Login Email: {{3}}  Temporary Password: {{4}}  Portal: {{5}}
Thank you, {{6}}
```

Parameter sequence as written: **1, 6, 2, 3, 4, 5, 6**.

## 2. Why it was rejected — two hard rule violations, before any content review

These are structural. Meta rejects on them without ever assessing the wording,
which is why rewording and resubmitting kept failing.

| # | Rule | What the body did |
|---|---|---|
| 1 | **A variable may appear only once.** | `{{6}}` appeared **twice** — mid-body and in the sign-off. |
| 2 | **Variables must appear in ascending order with no gaps.** | The order ran `1, 6, 2, …` — `{{6}}` before `{{2}}`. |

There is a third, softer risk that would have applied even with the structure
fixed:

| # | Risk | Why |
|---|---|---|
| 3 | **Content that looks like a security credential inside a UTILITY template.** | Meta increasingly routes password/OTP-shaped content to the **Authentication** category, which has its own strict format. A UTILITY template that reads like an authentication message is a plausible rejection even when well formed. |

## 3. What is now in the repository

Both bodies were rewritten so every parameter appears **exactly once, in
ascending order**, with the organization named **only in the sign-off**:

```
Dear {{1}},

Your staff portal account has been created.

Role: {{2}}
Login Email: {{3}}
Temporary Password: {{4}}
Portal: {{5}}

Please sign in and change your password after the first login.
Keep these details confidential.

Thank you,
{{6}}
```

`params: [staff_name, role, login_email, password, login_url, org_name]`

The student/parent template is the same shape with
`[parent_name, student_name, login_email, password, login_url, org_name]`.

A build gate (`src/test/security/commsAutomation.test.ts` §6) now fails if any
provider template repeats a parameter, skips a number, or puts them out of
order — so violations 1 and 2 cannot be reintroduced by an edit.

**Campaign names carry a `1` suffix** (`smartark_staff_credentials1`,
`smartark_student_credentials1`) because a rejected campaign name cannot be
reused. That suffix is a fresh identifier, not a version number: if this
submission is also rejected, the next attempt needs another new name, not an
edit to this one.

## 4. Recommended category — and the honest uncertainty

**Submit as UTILITY**, with the bodies above.

The argument for UTILITY: the message is triggered by an account-provisioning
action the recipient's institution performed, it contains no promotional
content, and it is not a one-time passcode for a login the user just attempted.

The argument that Meta may still push back: it contains a password. Meta's
**Authentication** category exists for codes used to log in, and its templates
are heavily constrained — fixed structures, a limited set of pre-approved
phrasings, typically a copy-code button, and **no free-form fields for a role,
an email address or a portal URL**. Our message would not fit inside that
format: an Authentication template cannot carry `Role:` and `Login Email:`.

So the two categories pull in opposite directions, and this is the part that
cannot be settled from the repository — only a submission tells you.

## 5. If UTILITY is rejected again — redesign the flow, don't resubmit

The instruction was to solve the rejection rather than keep trying. If a
well-formed UTILITY template is rejected a third time, the template is not the
problem: **sending a password over WhatsApp is**. Change the flow instead.

**Recommended: a set-password link, no password in the message.**

```
Dear {{1}},

Your account at {{2}} is ready.

Set your password using the secure link below. The link expires in 24 hours.

{{3}}
```

`params: [name, org_name, setup_url]`

This is straightforwardly UTILITY — an account-notification with a link, a
shape Meta approves routinely — and it is better security besides:

- no password ever travels over WhatsApp, or sits in a WhatsApp backup;
- the link is single-use and expiring, so an intercepted message ages out;
- the recipient chooses their own password, so there is no temporary password
  to leak or to forget to rotate.

Supabase already provides the primitive (`generateLink` / recovery links), and
the app already has a login route to land on. This is a flow change of
moderate size, not a rewrite.

**Fallback if a link flow is not acceptable:** send the username over WhatsApp
and the password over email, which is what `invite-staff` already does today.
The WhatsApp template then contains no secret at all.

## 6. Password handling — how the secret is treated today

Requirement: the password must never be persisted, logged, or visible in
analytics.

| Surface | State | Where |
|---|---|---|
| Resolver variables | The password is placed on a per-recipient variable bag that is rendered and discarded with the dispatch. Not written anywhere. | `automationResolvers.ts` — "Rendered, then discarded with this object. Never persisted." |
| `message_queue.payload` | **Redacted before the row is written back.** The send path clears secret-bearing keys and replaces `__body` with `"[redacted — credential message]"`. | `send-aisensy/index.ts` ~line 225 |
| `comms_audit` | Receives counts and the event key, not the rendered body. | `commsDispatcher.service.ts` |
| Logs | The redaction applies to the payload the function logs. | same |

**One residual risk, stated rather than glossed:** the row is written to
`message_queue` with the rendered `__body` **before** the provider call, and the
redaction happens on the way out. Between enqueue and drain, a temporary
password exists in the queue table in plaintext. For an immediate credential
send that window is seconds; if the queue backs up, it is longer. The
set-password-link flow in §5 removes this window entirely, which is a second
reason to prefer it.

## 7. Rollout — nothing changes until a human flips it

The lifecycle in `providerTemplates.ts` is `LEGACY → READY_FOR_SUBMISSION →
SUBMITTED → APPROVED → ACTIVE`, and `resolveCampaign()` returns the **new**
campaign only at `ACTIVE`. Both credential templates are at
`READY_FOR_SUBMISSION`, so today they still send through the legacy campaigns
and production behaviour is unchanged. Rollback is one status change.

## 8. Summary

| Question | Answer |
|---|---|
| Why rejected? | Duplicate `{{6}}` and non-ascending parameter order — structural, judged before content |
| Fixed? | Yes, both bodies rewritten; a build gate prevents regression |
| Category to submit | UTILITY |
| Will it pass? | **Unknown.** The structural faults are gone; the password content remains a genuine Authentication-category risk |
| If rejected again | Do not resubmit — switch to the set-password link flow in §5 |
| Password persisted? | Not in audit or analytics; redacted in the queue payload after send. Plaintext in `message_queue` between enqueue and drain — removed entirely by the §5 flow |
