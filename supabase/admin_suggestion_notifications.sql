-- One-time setup in the monster_tree database (tjonmlclhhinjwgllthx).
-- No student rows, points, suggestions, existing subscriptions or VAPID keys are changed.
-- Signing keys are initialized once by the authenticated administrator screen.
begin;

create table if not exists public.garden_admin_push_config (
  id text primary key check (id = 'suggestions'),
  public_key text not null check (length(public_key) between 80 and 100),
  private_key text not null check (length(private_key) between 40 and 50),
  created_at timestamptz not null default now()
);
alter table public.garden_admin_push_config enable row level security;
revoke all on table public.garden_admin_push_config from public, anon, authenticated;
grant select, insert, update, delete on table public.garden_admin_push_config to service_role;

create table if not exists public.garden_admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint like 'https://%'),
  keys jsonb not null check (
    jsonb_typeof(keys) = 'object' and keys ? 'p256dh' and keys ? 'auth'
    and jsonb_typeof(keys->'p256dh') = 'string' and jsonb_typeof(keys->'auth') = 'string'
    and length(keys->>'p256dh') between 80 and 100 and length(keys->>'auth') between 20 and 30
  ),
  owner_fingerprint text not null check (owner_fingerprint ~ '^[0-9a-f]{64}$'),
  vapid_public_key text not null check (length(vapid_public_key) between 80 and 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_tested_at timestamptz
);
create index if not exists garden_admin_push_owner_idx
  on public.garden_admin_push_subscriptions (owner_fingerprint, vapid_public_key, created_at);
alter table public.garden_admin_push_subscriptions enable row level security;
revoke all on table public.garden_admin_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.garden_admin_push_subscriptions to service_role;

commit;

-- Expected: both rows have row_security=true and anon/authenticated access=false.
select relname, relrowsecurity as row_security,
  has_table_privilege('anon', oid, 'SELECT') as anon_can_read,
  has_table_privilege('authenticated', oid, 'SELECT') as authenticated_can_read
from pg_class
where oid in ('public.garden_admin_push_config'::regclass, 'public.garden_admin_push_subscriptions'::regclass);
