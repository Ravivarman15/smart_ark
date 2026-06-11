// ──────────────────────────────────────────────────────────────────────────────
// Notification seam (architecture only — no Phase-1 senders).
//
// task_activity + task_watchers are the event/recipient backbone. Phase 3 will
// attach WhatsApp / email / in-app channels behind this interface WITHOUT
// touching the task services. For now `notify()` is a no-op that logs in dev.
// ──────────────────────────────────────────────────────────────────────────────

export type TaskNotificationEvent =
  | "task_assigned"
  | "task_updated"
  | "task_due_soon"
  | "task_overdue"
  | "task_completed"
  | "task_rejected"
  | "task_commented";

export interface TaskNotification {
  event: TaskNotificationEvent;
  taskId: string;
  recipients: string[]; // profile ids
  meta?: Record<string, unknown>;
}

export interface TaskNotificationChannel {
  send(n: TaskNotification): Promise<void>;
}

class TaskNotificationsService {
  private channels: TaskNotificationChannel[] = [];

  /** Phase 2/3: register WhatsApp/email/in-app channels here. */
  register(channel: TaskNotificationChannel): void {
    this.channels.push(channel);
  }

  async notify(n: TaskNotification): Promise<void> {
    if (this.channels.length === 0) {
      if (import.meta.env.DEV) {
        console.debug("[tasks] notification (no channel registered):", n.event, n.taskId);
      }
      return;
    }
    await Promise.allSettled(this.channels.map((c) => c.send(n)));
  }
}

export const taskNotificationsService = new TaskNotificationsService();
