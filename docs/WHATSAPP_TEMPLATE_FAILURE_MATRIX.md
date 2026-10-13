# Smart ARK — WhatsApp Automation Failure Matrix & Recovery Guide

## 1. Failure Categories & System Handling

| Failure Class | Trigger Scenario | System Defense / Mitigation | Operator Visibility |
|---|---|---|---|
| **Automation Switched Off** | User toggles campaign off in Automation Center or Fee Settings | Early return: `skipped: true`, `reason: "automation_disabled"`. Pre-drain cancellation in `send-aisensy`. | Audited in `comms_audit` with `action: "skip"`. UI shows skipped. |
| **Missing Phone Number** | Student profile lacks parent/guardian contact | Validation gate `noPhone` skips record without breaking batch. | Listed in `batch.summary.invalidList`. |
| **Missing Required Variable** | Record lacks critical field (e.g. amount or due date) | Validation gate `missingVars` skips invalid row. Aliases attempt automatic fallback. | Logged in audit trail with exact missing field name. |
| **Dead / Rejected Campaign** | Send requested for `smartark_staff_credentials1` | Intercepted by `DEAD_CAMPAIGNS` set. Provider dispatch blocked with HTTP 400. | Logged in `message_queue.last_error`. |
| **Provider HTTP 400 / 401** | AiSensy API key invalid or provider error | Exponential retry with backoff (1m, 5m, 15m, 30m) up to `MAX_RETRIES`. | Surfaced in Delivery Dashboard. |
| **Quiet Hours Active** | Automated send triggered between quiet start/end hours | `scheduledAt` deferred to quiet window end timestamp. Never dropped. | Scheduled status in `message_queue`. |
| **Duplicate Delivery** | Duplicate receipt or reminder triggered on same calendar day | Deduplicated by `queuedTodaySet` / `alreadySent(receiptNo)`. Returns `duplicate`. | Audited with `action: "duplicate"`. |

---

## 2. Recovery Procedures

1. **Automation Disabled**: If an event was skipped due to being turned off, navigate to **Communication Center** or **Fee Management > Smart Reminder Engine**, toggle the switch ON, and re-trigger or resend.
2. **Missing Phone Number**: Navigate to the student profile, populate `parent_contact` or `guardian_contact`, and use the "Resend" action.
3. **Provider Backlog / Unreachable**: Verify AiSensy API key in Supabase Edge Secrets (`AISENSY_API_KEY`). Nudge the drainer via the Communication Center Health tool.
