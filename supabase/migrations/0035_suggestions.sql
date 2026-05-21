-- 건의함 (Suggestion Mailbox)
-- 학생이 /me/suggest 에서 카테고리(칭찬/건의/불편/기타)별 글을 남기고,
-- 관리자가 /admin/suggest 에서 답변/상태변경/삭제를 한다.
-- 욕설/악플을 반복하는 학생은 garden_suggestion_blocks 로 일시/영구 제한.

-- 1) garden_suggestions ---------------------------------------------------
create table if not exists public.garden_suggestions (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null,
  student_id uuid references public.garden_students(id) on delete cascade,
  student_name_snapshot text not null,
  is_anonymous boolean not null default false,
  category text not null check (category in ('praise','suggestion','complaint','etc')),
  title text not null,
  body text not null,
  status text not null default 'received'
    check (status in ('received','reviewing','done')),
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists garden_suggestions_branch_created_idx
  on public.garden_suggestions (branch_id, created_at desc);
create index if not exists garden_suggestions_student_idx
  on public.garden_suggestions (student_id, created_at desc);

alter table public.garden_suggestions enable row level security;
drop policy if exists "garden_suggestions_read" on public.garden_suggestions;
create policy "garden_suggestions_read" on public.garden_suggestions
  for select using (true);

-- 2) garden_suggestion_blocks --------------------------------------------
create table if not exists public.garden_suggestion_blocks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique
    references public.garden_students(id) on delete cascade,
  branch_id text not null,
  reason text,
  blocked_at timestamptz not null default now(),
  blocked_until timestamptz,
  blocked_by text
);

create index if not exists garden_suggestion_blocks_branch_idx
  on public.garden_suggestion_blocks (branch_id);

alter table public.garden_suggestion_blocks enable row level security;
drop policy if exists "garden_suggestion_blocks_read" on public.garden_suggestion_blocks;
create policy "garden_suggestion_blocks_read" on public.garden_suggestion_blocks
  for select using (true);

-- 3) updated_at 자동 갱신 트리거 (suggestions) ---------------------------
create or replace function public.garden_suggestions_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists garden_suggestions_set_updated_at on public.garden_suggestions;
create trigger garden_suggestions_set_updated_at
  before update on public.garden_suggestions
  for each row execute function public.garden_suggestions_touch_updated_at();

-- 4) 우체통 건물 활성화 ---------------------------------------------------
update public.village_buildings
   set is_ready = true,
       link = '/me/suggest',
       updated_at = now()
 where building_key = 'mailbox';
