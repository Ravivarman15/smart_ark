-- Settings module (Phase 4) — per-user and global app settings.
--
-- Scope decisions:
--   - `settings_sms_automations` and `settings_whatsapp_config` are GLOBAL
--     (one row per automation key / one config row) — these are app-wide
--     defaults set by management. Per-campus overrides are out of scope for
--     this phase and can be added as a campus_id column later.
--   - `settings_notification_preferences` is per-USER (one row per
--     user × channel × category combo).
--   - `settings_referrals` is per-USER (referral code + reward tally).
--   - `settings_audit` is the append-only change log.
--
-- Token storage:
--   - `settings_whatsapp_config.api_token_ciphertext` is intended to be
--     written ONLY by an edge function with the service role. The RLS
--     policies below block client writes to that column path. The catalog
--     UI shows masked hints, never the raw token.
--
-- Backwards-compat:
--   - Doesn't touch existing `profiles`, `staff_rights`, or any prior
--     RBAC/staff table. The profile-update flow stays on `profiles`.

-- ── 1. SMS automation toggles + templates (global) ──────────────────────────
create table if not exists public.settings_sms_automations (
  id           uuid primary key default gen_random_uuid(),
  -- Stable key: e.g. "fee_due", "attendance", "exam_reminder", "birthday",
  -- "enquiry_followup", or a custom UI-defined slug.
  automation_key  text not null unique,
  label           text not null,
  enabled         boolean not null default false,
  template        text not null default '',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);

create index if not exists settings_sms_automations_key_idx
  on public.settings_sms_automations (automation_key);

alter table public.settings_sms_automations enable row level security;

-- DROP-then-CREATE pattern: Postgres has no `create policy if not exists`,
-- so re-running this migration would fail with "policy already exists".
-- Dropping first makes it idempotent and rerunnable.
drop policy if exists "sms_automations: read for authenticated" on public.settings_sms_automations;
create policy "sms_automations: read for authenticated"
  on public.settings_sms_automations
  for select using (auth.uid() is not null);

drop policy if exists "sms_automations: write for management/admin" on public.settings_sms_automations;
create policy "sms_automations: write for management/admin"
  on public.settings_sms_automations
  for all
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  );

-- ── 2. Per-user notification preferences ────────────────────────────────────
create table if not exists public.settings_notification_preferences (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  -- Channel: "email", "in_app", "push" (future).
  channel         text not null,
  -- Category: "reminder", "approval", "attendance", "exam", "system".
  category        text not null,
  enabled         boolean not null default true,
  updated_at      timestamptz not null default now(),
  constraint settings_notification_prefs_unique
    unique (profile_id, channel, category)
);

create index if not exists settings_notification_prefs_profile_idx
  on public.settings_notification_preferences (profile_id);

alter table public.settings_notification_preferences enable row level security;

-- Users see + edit their own prefs. Management can audit any.
drop policy if exists "notif_prefs: self read/write" on public.settings_notification_preferences;
create policy "notif_prefs: self read/write"
  on public.settings_notification_preferences
  for all
  using (
    exists (select 1 from public.profiles p
            where p.id = settings_notification_preferences.profile_id
              and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = settings_notification_preferences.profile_id
              and p.user_id = auth.uid())
  );

drop policy if exists "notif_prefs: management read" on public.settings_notification_preferences;
create policy "notif_prefs: management read"
  on public.settings_notification_preferences
  for select
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role = 'management')
  );

-- ── 3. WhatsApp config (global singleton) ───────────────────────────────────
create table if not exists public.settings_whatsapp_config (
  id                     uuid primary key default gen_random_uuid(),
  enabled                boolean not null default false,
  provider               text not null default 'aisensy',
  -- Encrypted at the application layer; written via edge function only.
  api_token_ciphertext   text,
  -- Last 4 chars of the raw token — safe to show in the catalog UI.
  api_token_hint         text,
  webhook_secret_hint    text,
  templates              jsonb not null default '{}'::jsonb,
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles(id) on delete set null
);

-- Singleton enforcement: only one row is meaningful.
create unique index if not exists settings_whatsapp_singleton
  on public.settings_whatsapp_config ((true));

alter table public.settings_whatsapp_config enable row level security;

drop policy if exists "wa_config: read for authenticated" on public.settings_whatsapp_config;
create policy "wa_config: read for authenticated"
  on public.settings_whatsapp_config
  for select using (auth.uid() is not null);

-- Writes restricted to management/admin AND token fields excluded
-- (UI-driven writes use Postgres column-level grants below; raw token
--  writes go through an edge function with the service role).
drop policy if exists "wa_config: write toggles for management/admin" on public.settings_whatsapp_config;
create policy "wa_config: write toggles for management/admin"
  on public.settings_whatsapp_config
  for update
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  );

drop policy if exists "wa_config: insert for management/admin" on public.settings_whatsapp_config;
create policy "wa_config: insert for management/admin"
  on public.settings_whatsapp_config
  for insert
  with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role in ('management', 'admin'))
  );

-- Block direct client writes to the raw ciphertext column. The edge
-- function bypasses this with service role.
revoke update (api_token_ciphertext) on public.settings_whatsapp_config
  from anon, authenticated;

-- ── 4. Referrals (per-user) ─────────────────────────────────────────────────
create table if not exists public.settings_referrals (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles(id) on delete cascade,
  referral_code     text not null unique,
  total_referrals   integer not null default 0,
  total_rewards     numeric(12, 2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.settings_referral_events (
  id                  uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid not null references public.profiles(id) on delete cascade,
  referred_profile_id uuid references public.profiles(id) on delete set null,
  reward_amount       numeric(12, 2) not null default 0,
  status              text not null default 'pending',
  -- "pending" | "credited" | "reversed"
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists settings_referral_events_referrer_idx
  on public.settings_referral_events (referrer_profile_id);

alter table public.settings_referrals enable row level security;
alter table public.settings_referral_events enable row level security;

drop policy if exists "referrals: self read" on public.settings_referrals;
create policy "referrals: self read"
  on public.settings_referrals
  for select
  using (
    exists (select 1 from public.profiles p
            where p.id = settings_referrals.profile_id
              and p.user_id = auth.uid())
  );

drop policy if exists "referrals: self insert" on public.settings_referrals;
create policy "referrals: self insert"
  on public.settings_referrals
  for insert
  with check (
    exists (select 1 from public.profiles p
            where p.id = settings_referrals.profile_id
              and p.user_id = auth.uid())
  );

drop policy if exists "referral_events: own as referrer" on public.settings_referral_events;
create policy "referral_events: own as referrer"
  on public.settings_referral_events
  for select
  using (
    exists (select 1 from public.profiles p
            where p.id = settings_referral_events.referrer_profile_id
              and p.user_id = auth.uid())
  );

-- ── 5. Settings audit log ───────────────────────────────────────────────────
create table if not exists public.settings_audit (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  -- Area: "sms_automation", "notification_pref", "whatsapp_config",
  -- "profile", "password" (auth changes — actor only, never the password).
  area        text not null,
  change_key  text,
  prev_value  jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists settings_audit_area_idx
  on public.settings_audit (area, created_at desc);

alter table public.settings_audit enable row level security;

drop policy if exists "settings_audit: read for management" on public.settings_audit;
create policy "settings_audit: read for management"
  on public.settings_audit
  for select
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid()
            and p.role = 'management')
  );

drop policy if exists "settings_audit: insert for authenticated" on public.settings_audit;
create policy "settings_audit: insert for authenticated"
  on public.settings_audit
  for insert
  with check (auth.uid() is not null);

-- Reload PostgREST schema cache so new tables / policies are visible to
-- the API immediately. Without this, the next browser query against an
-- added column trips PGRST204 until the cache TTL expires.
notify pgrst, 'reload schema';
