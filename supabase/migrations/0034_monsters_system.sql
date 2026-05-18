-- 몬스터 키우기 시스템 — Phase 1 스키마.
-- 알 선택 → EXP 누적 → 단계별 진화 흐름.
-- 관리자가 이미지를 점진적으로 업로드할 수 있게 (NULL 허용).

-- ============ 1) monster_species (종 마스터) ============
create table if not exists public.monster_species (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  -- 알 선택 화면에서 이름 가릴지 (true 면 "??? 비밀의 알" 로 표시)
  hide_name boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monster_species_active_idx
  on public.monster_species (is_active, display_order);

alter table public.monster_species enable row level security;
drop policy if exists "monster_species_read" on public.monster_species;
create policy "monster_species_read" on public.monster_species
  for select using (true);

-- ============ 2) monster_stage_images (종별 단계 1~5 이미지) ============
create table if not exists public.monster_stage_images (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.monster_species(id) on delete cascade,
  stage integer not null check (stage between 1 and 5),
  image_url text,
  stage_name text not null,
  required_exp integer not null default 0 check (required_exp >= 0),
  updated_at timestamptz not null default now(),
  unique (species_id, stage)
);

create index if not exists monster_stage_images_species_idx
  on public.monster_stage_images (species_id);

alter table public.monster_stage_images enable row level security;
drop policy if exists "monster_stage_images_read" on public.monster_stage_images;
create policy "monster_stage_images_read" on public.monster_stage_images
  for select using (true);

-- ============ 3) student_monsters (학생이 키우는 몬스터) ============
create table if not exists public.student_monsters (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.garden_students(id) on delete cascade,
  species_id uuid not null references public.monster_species(id) on delete restrict,
  nickname text not null check (char_length(nickname) between 1 and 10),
  current_exp integer not null default 0 check (current_exp >= 0),
  current_stage integer not null default 1 check (current_stage between 1 and 5),
  is_evolved boolean not null default false,
  selected_at timestamptz not null default now(),
  evolved_at timestamptz
);

-- 학생당 미진화 몬스터는 최대 1마리만 허용 (부분 unique index).
create unique index if not exists student_monsters_one_active_idx
  on public.student_monsters (student_id)
  where is_evolved = false;

create index if not exists student_monsters_student_idx
  on public.student_monsters (student_id);
create index if not exists student_monsters_evolved_idx
  on public.student_monsters (student_id, is_evolved);

alter table public.student_monsters enable row level security;
-- 학생 데이터: service_role 만 쓰기 — 학생 액션을 통해 진행 (RLS 정책 추가 안 함).

-- ============ 4) Storage 버킷: monsters ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'monsters',
  'monsters',
  true,
  1048576, -- 1MB
  array['image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'monsters_public_read'
  ) then
    create policy "monsters_public_read" on storage.objects
      for select using (bucket_id = 'monsters');
  end if;
end $$;
