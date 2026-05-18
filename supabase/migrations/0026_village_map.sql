-- 몬스터 마을 맵 — 학생 로그인 후 진입하는 허브 화면.
-- 관리자가 배경 이미지 + 건물 5개(이미지/위치/오픈여부)를 갤러리 방식으로 업로드/관리.
-- 학생 화면(/me/village)은 village_settings + village_buildings 만 SSR 로 읽어 합성.

-- 1) village_settings — 전역 1행 (배경/시즌)
create table if not exists public.village_settings (
  id uuid primary key default gen_random_uuid(),
  background_image text,
  season text not null default '기본',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 단일 활성 행만 유지 — 첫 행 자동 생성
insert into public.village_settings (season, is_active)
select '기본', true
where not exists (select 1 from public.village_settings);

-- 2) village_buildings — 건물 메타 (이미지 / 위치 / 오픈여부)
create table if not exists public.village_buildings (
  id uuid primary key default gen_random_uuid(),
  building_key text not null unique,
  name text not null,
  image_url text,
  link text not null default '#',
  position_top text not null default '50%',
  position_left text,
  position_right text,
  size text not null default '25%',
  display_order int not null default 0,
  is_ready boolean not null default false,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기본 건물 5개 시드 (이미 있으면 건드리지 않음)
insert into public.village_buildings
  (building_key, name, link, position_top, position_left, position_right, size, display_order, is_ready, is_visible)
values
  ('garden',  '사과정원',     '/me',       '15%', '35%', null,  '28%', 1, true,  true),
  ('quiz',    '퀴즈 오두막',  '/quiz',     '35%', '5%',  null,  '25%', 2, false, true),
  ('shop',    '몬스터 상점',  '/shop',     '38%', null,  '5%',  '25%', 3, false, true),
  ('mailbox', '건의 우체통',  '/suggest',  '62%', '12%', null,  '20%', 4, false, true),
  ('game',    '게임센터',     '/game',     '65%', null,  '8%',  '25%', 5, false, true)
on conflict (building_key) do nothing;

create index if not exists village_buildings_order_idx
  on public.village_buildings (display_order);

-- RLS — 읽기는 모두 허용, 쓰기는 service_role 만 (관리자 액션이 service_role 사용)
alter table public.village_settings enable row level security;
drop policy if exists "village_settings_read" on public.village_settings;
create policy "village_settings_read" on public.village_settings
  for select using (true);

alter table public.village_buildings enable row level security;
drop policy if exists "village_buildings_read" on public.village_buildings;
create policy "village_buildings_read" on public.village_buildings
  for select using (true);

-- 3) Storage 버킷 — 배경 이미지 + 건물 이미지
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'village',
  'village',
  true,
  2097152, -- 2MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'village_public_read'
  ) then
    create policy "village_public_read" on storage.objects
      for select using (bucket_id = 'village');
  end if;
end $$;
