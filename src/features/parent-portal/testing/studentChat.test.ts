import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ════════════════════════════════════════════════════════════════════════════
// TWO-WAY STUDENT CHAT
//
// The bug this guards against is not subtle once seen, and was invisible until
// then: the staff page wrote `student_messages`, the parent page read
// `message_queue`. Both sides worked. Neither could ever see the other.
//
// So the first and most important assertion here is the boring one — that the
// two ends of the conversation name the SAME TABLE. Everything else is detail.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Strip comments, so prose describing the old behaviour cannot satisfy a scan. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The same, for SQL.
 *
 * Needed because the migration DOCUMENTS the tables it deliberately does not
 * read — and a scan asserting "this file never mentions rbac_role_permissions"
 * would otherwise be satisfied only by deleting the explanation of why.
 */
const sqlCode = (text: string) => text.replace(/^\s*--.*$/gm, "");

const SERVICE = "src/features/students/services/communication.service.ts";
const STAFF_PAGE = "src/features/students/pages/StudentChatPage.tsx";
const PARENT_PAGE = "src/features/parent-portal/pages/ParentMessagesPage.tsx";
const PARENT_HOOKS = "src/features/parent-portal/hooks/useChildData.ts";
const MIGRATION = "supabase/migrations/20261008_student_chat_two_way.sql";

describe("Both ends of the conversation use the same table", () => {
  it("the staff page and the parent portal share ONE service", () => {
    // Not "both mention student_messages" — both must go through the same
    // service, or the two ends drift into different row shapes and `direction`
    // ends up meaning opposite things at each end.
    expect(code(read(STAFF_PAGE))).toMatch(/useStudentChat/);
    expect(code(read(PARENT_HOOKS))).toMatch(
      /communicationService.*from "@\/features\/students\/services\/communication\.service"/s,
    );
  });

  it("the parent portal actually reads the chat table", () => {
    const hooks = code(read(PARENT_HOOKS));
    expect(hooks).toMatch(/useChildChat/);
    expect(hooks).toMatch(/communicationService\.list\(/);
  });

  it("the parent portal can WRITE a reply", () => {
    const hooks = code(read(PARENT_HOOKS));
    expect(hooks).toMatch(/useSendChildReply/);
    expect(hooks).toMatch(/communicationService\.reply\(/);
  });

  it("DETECTS a regression to the old message_queue-only page", () => {
    // Mutation check: the parent page must render the chat thread, not just the
    // outbound delivery log it used to.
    const page = code(read(PARENT_PAGE));
    expect(page).toMatch(/ChatTab/);
    expect(page).toMatch(/useChildChat/);
    // And the notice that told parents replies were impossible must be gone.
    expect(page).not.toMatch(/replies are not received here/i);
  });

  it("keeps the notification log as its own tab rather than merging it", () => {
    // message_queue is a DELIVERY log. Interleaving fee receipts with a
    // teacher's reply makes the conversation unreadable, and there is nothing
    // to attach a reply to.
    const page = code(read(PARENT_PAGE));
    expect(page).toMatch(/useChildMessages/);
    expect(page).toMatch(/notifications/);
  });
});

describe("A parent cannot forge a message", () => {
  const service = code(read(SERVICE));

  it("a reply is inbound, unattributed and in-app", () => {
    const reply = service.slice(service.indexOf("async reply("), service.indexOf("async markRead("));
    expect(reply).toMatch(/direction:\s*"in"/);
    // `profiles` is the STAFF table. A parent supplying one would attribute
    // their message to a member of staff.
    expect(reply).toMatch(/sender_profile_id:\s*null/);
    // A row with channel 'whatsapp' is what an outbound dispatcher picks up.
    // Without this pin, the reply box is a route into the messaging provider.
    expect(reply).toMatch(/channel:\s*"app"/);
  });

  it("staff sends are outbound", () => {
    const send = service.slice(service.indexOf("async send("), service.indexOf("async reply("));
    expect(send).toMatch(/direction:\s*"out"/);
  });

  it("the database enforces all of it, not just the client", () => {
    const sql = read(MIGRATION);
    const parentSend = sql.slice(
      sql.indexOf('create policy "student_messages_parent_send"'),
      sql.indexOf('create policy "student_messages_staff_send"'),
    );
    expect(parentSend).toMatch(/is_parent_of\(student_id\)/);
    expect(parentSend).toMatch(/direction = 'in'/);
    expect(parentSend).toMatch(/sender_profile_id is null/);
    expect(parentSend).toMatch(/channel = 'app'/);
    expect(parentSend).toMatch(/organization_id = public\.current_org_id\(\)/);
  });
});

describe("Tenant and family isolation", () => {
  const sql = read(MIGRATION);

  it("every new policy is bounded to the current organization", () => {
    const policies = sql.match(/create policy "student_messages_[a-z_]+"[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(5);
    for (const p of policies) {
      expect(p, `policy without a tenant bound:\n${p.slice(0, 120)}`).toMatch(
        /organization_id = public\.current_org_id\(\)/,
      );
    }
  });

  it("parent policies are scoped by is_parent_of, never by student_id alone", () => {
    for (const name of ["parent_read", "parent_send", "parent_mark_read"]) {
      const start = sql.indexOf(`create policy "student_messages_${name}"`);
      expect(start, `${name} policy missing`).toBeGreaterThan(-1);
      const body = sql.slice(start, sql.indexOf(";", start));
      expect(body).toMatch(/is_parent_of\(student_id\)/);
    }
  });

  it("each side may only mark the OTHER side's messages read", () => {
    const staff = sql.slice(
      sql.indexOf('create policy "student_messages_staff_mark_read"'),
      sql.indexOf('create policy "student_messages_parent_mark_read"'),
    );
    const parent = sql.slice(
      sql.indexOf('create policy "student_messages_parent_mark_read"'),
      sql.indexOf("create or replace function public.student_messages_guard_receipt"),
    );
    expect(staff).toMatch(/direction = 'in'/);
    expect(parent).toMatch(/direction = 'out'/);
  });

  it("an UPDATE cannot be used to rewrite a message", () => {
    // An UPDATE policy grants the whole ROW. Without the trigger, a parent
    // marking a message read could rewrite its body in the same statement and
    // the policy would allow it — direction and organization_id are unchanged.
    expect(sql).toMatch(/create trigger student_messages_receipt_guard/);
    const fn = sql.slice(
      sql.indexOf("function public.student_messages_guard_receipt"),
      sql.indexOf("drop trigger if exists student_messages_receipt_guard"),
    );
    for (const col of ["body", "direction", "student_id", "sender_profile_id", "channel"]) {
      expect(fn, `trigger does not protect ${col}`).toMatch(
        new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`),
      );
    }
  });
});

describe("Who is allowed to chat", () => {
  const sql = read(MIGRATION);

  it("any staff member may SEND, not just three roles", () => {
    // The page is granted per-role through RBAC (`student.chat`); before this,
    // a teacher could open it and then silently fail to send.
    const staffSend = sql.slice(
      sql.indexOf('create policy "student_messages_staff_send"'),
      sql.indexOf('create policy "student_messages_staff_mark_read"'),
    );
    expect(staffSend).toMatch(/public\.is_staff\(\)/);
    expect(staffSend).toMatch(/for insert/);
    expect(staffSend).not.toMatch(/management|coordinator/);
  });

  it("widening send does NOT widen delete or edit", () => {
    // The existing management-only ALL policy is untouched, so nobody gains
    // the ability to erase a conversation.
    expect(sql).not.toMatch(/drop policy if exists "student_messages_write"/);
  });

  it("the page stays behind its RBAC submodule", () => {
    const routes = read("src/core/routing/sharedRoutes.tsx");
    expect(routes).toMatch(/submodule:\s*"student\.chat"/);
  });

  it("RLS does not try to re-implement RBAC", () => {
    // rbac_role_permissions is documented as fail-OPEN and merged on the
    // client. A policy reading it would be a second resolver AND would fail
    // closed for any org that never opened the permission screen.
    expect(sqlCode(sql)).not.toMatch(/rbac_role_permissions|rbac_user_permission_overrides/);
  });
});

describe("The migration is safe to apply to production", () => {
  const sql = read(MIGRATION);

  it("writes no data", () => {
    expect(sql).not.toMatch(/^\s*(insert into|update |delete from)/im);
  });

  it("removes no existing policy or column", () => {
    expect(sql).not.toMatch(/drop column|drop table|alter column/i);
    // `drop policy if exists` immediately before `create policy` of the SAME
    // name is re-creation, not removal — that is what makes it idempotent.
    const drops = [...sql.matchAll(/drop policy if exists "([a-z_]+)"/g)].map((m) => m[1]);
    for (const name of drops) {
      expect(sql, `${name} dropped but not recreated`).toMatch(
        new RegExp(`create policy "${name}"`),
      );
    }
  });

  it("is idempotent", () => {
    expect(sql).toMatch(/create index if not exists/);
    expect(sql).toMatch(/create or replace function/);
    expect(sql).toMatch(/drop trigger if exists/);
  });

  it("fails loudly if it did not take effect", () => {
    expect(sql).toMatch(/raise exception 'expected at least 7 policies/);
  });

  it("is registered for deployment", () => {
    expect(read("scripts/deploy-migrations.mjs")).toMatch(/20261008_student_chat_two_way\.sql/);
  });
});

describe("Replies do not vanish into a table nobody reads", () => {
  it("staff get an inbox with unread counts", () => {
    // Without this, the only route to a thread was a dropdown of every active
    // student — so a reply was undiscoverable short of guessing.
    const page = code(read(STAFF_PAGE));
    expect(page).toMatch(/useChatConversations/);
    expect(page).toMatch(/unread/);
    expect(page).toMatch(/Conversations/);
  });

  it("unread conversations sort above the rest", () => {
    expect(code(read(STAFF_PAGE))).toMatch(/Number\(b\.unread > 0\) - Number\(a\.unread > 0\)/);
  });

  it("opening a thread marks it read", () => {
    expect(code(read(STAFF_PAGE))).toMatch(/useMarkMessagesRead/);
    expect(code(read(PARENT_HOOKS))).toMatch(/useMarkChatRead/);
  });

  it("the read receipt verifies the write actually landed", () => {
    // An RLS-filtered UPDATE returns 204 with error:null — a silent no-op that
    // is indistinguishable from success without .select().
    const service = code(read(SERVICE));
    const markRead = service.slice(
      service.indexOf("async markRead("),
      service.indexOf("async conversations("),
    );
    expect(markRead).toMatch(/\.select\("id"\)/);
  });

  it("both sides poll, so a reply appears without a reload", () => {
    expect(code(read("src/features/students/hooks/useStudentChat.ts"))).toMatch(
      /refetchInterval/,
    );
    expect(code(read(PARENT_HOOKS))).toMatch(/refetchInterval/);
  });
});
