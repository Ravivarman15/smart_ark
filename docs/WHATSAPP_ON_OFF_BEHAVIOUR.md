# Smart ARK — WhatsApp Automation ON/OFF Behavior & Control Audit

## 1. Executive Summary & Root-Cause Resolution

This document details the investigation, root-cause diagnosis, and architectural repair of the campaign ON/OFF suppression behavior in Smart ARK, specifically addressing the incident:
> **"i turn off the fee receipt compaign but it sent"**

### Root Causes Identified
Prior to this repair, turning off the Fee Receipt automation in the Communication Center or Fee Settings did not suppress receipt delivery due to three distinct gaps:
1. **Deliberate Code Bypass in `feeReceiptDelivery.service.ts`**:
   At line 284, the delivery method contained:
   ```typescript
   // NOTE: the fee_paid toggle only chooses channels (both vs whatsapp vs email);
   // it NEVER blocks delivery. Every collected payment MUST get a receipt.
   ```
   The service read the setting but explicitly ignored `setting.enabled`, proceeding to render and enqueue the WhatsApp receipt regardless of whether the toggle was ON or OFF.
2. **Unconditional Queueing in `feeMessaging.service.ts`**:
   `feeMessagingService.enqueueReceipt` (called by `installments.service.ts`) inserted directly into `message_queue` with `context_type: "fee_receipt"` without consulting `commsAutomationSettingsService` at all.
3. **Queue Drainer Key Mismatch in `send-aisensy`**:
   The edge function's pre-drain recheck checked the exact `row.context_type` against `comms_automation_settings.event_key`. Rows queued under `fee_receipt` or `smartark_fee_receipt` were not resolved to the canonical setting key `fee_paid`, so the edge function drainer failed to match the disabled setting.

---

## 2. Complete Architectural Fix Implemented

### Layer 1: Client-Side Pre-Enqueue Guard (`feeReceiptDelivery.service.ts`)
When `deliverReceipt` is called:
```typescript
const setting = await commsAutomationSettingsService.get("fee_paid");
if (!setting.enabled && !input.force) {
  await commsAuditService.log({
    entityType: "automation",
    entityId: "fee_paid",
    action: "skip",
    actorId: input.actorId,
    payload: {
      reason: "automation_disabled",
      receiptNo: input.receiptNo,
      studentFeeId: input.studentFeeId,
    },
  });
  return {
    skipped: true,
    reason: "automation_disabled",
    whatsapp: "skipped",
    email: "skipped",
    receiptUrl: undefined,
  };
}
```
If `setting.channel` does not include `"whatsapp"`, WhatsApp dispatch is skipped (`result.whatsapp = "skipped"`).

### Layer 2: Direct Installment Guard (`feeMessaging.service.ts`)
In `feeMessagingService.enqueueReceipt`:
```typescript
const { commsAutomationSettingsService } = await import(
  "@/features/communication/services/commsAutomationSettings.service"
);
const setting = await commsAutomationSettingsService.get("fee_paid");
if (!setting.enabled) {
  return { queued: 0, skipped: true };
}
if (setting.channel === "email") {
  return { queued: 0, skipped: true };
}
```

### Layer 3: Bidirectional Alias Resolution (`commsAutomationSettings.service.ts`)
`commsAutomationSettingsService.get(eventKey)` now checks candidate aliases:
- `fee_paid` ↔ `fee_receipt` ↔ `smartark_fee_receipt`
- `fee_due` ↔ `fee_due_reminder` ↔ `smartark_fee_due_reminder`
- `attendance_absent` ↔ `smartark_attendance_absent`
- `attendance_corrected` ↔ `smartark_attendance_corrected`

If **ANY** alias in `comms_automation_settings` has `enabled: false`, `get()` returns `enabled: false`, ensuring that whether an operator toggles the setting via the template name or the event key, suppression is guaranteed.

### Layer 4: Server-Side Drainer Cancellation Guard (`supabase/functions/send-aisensy/index.ts`)
Before dispatching any row from `message_queue`:
1. Pre-fetches all `comms_automation_settings` rows across organizations and global fallbacks.
2. Resolves `context_type`, `template_key`, and `template` against `EVENT_KEY_ALIASES`.
3. If the resolved event key is disabled (`enabled === false`), the row is immediately **cancelled** without calling AiSensy:
   ```typescript
   if (matchedKey && orgSettings.get(matchedKey) === false) {
     const reason = `event_disabled_after_enqueue: Automation for '${matchedKey}' is disabled for this organization`;
     await supabase
       .from("message_queue")
       .update({ status: "cancelled", last_error: reason })
       .eq("id", row.id);
     await updateLeadLog(supabase, row, { status: "cancelled", error: reason });
     await audit(supabase, row, "skip", { reason: "event_disabled_after_enqueue", eventKey: matchedKey });
     continue;
   }
   ```

---

## 3. Verification & Test Evidence

| Layer | Test Coverage | Result |
|---|---|---|
| Frontend Hook / UI | `feeReceiptDelivery.service.ts` early return when `enabled: false` | Verified: `skipped: true`, `reason: "automation_disabled"` |
| Backend Direct | `feeMessaging.service.ts` suppresses queue insertion when disabled | Verified: `queued: 0`, `skipped: true` |
| Edge Worker Drain | `send-aisensy` queue drain cancels rows if event is switched off | Verified: Row status becomes `cancelled`, no HTTP POST to AiSensy |
| Audit Trail | Audit row logged in `comms_audit` with `action: "skip"` | Verified |
