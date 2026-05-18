-- 마이룸 마당 꾸미기 시스템 — Phase 1: 소품 마스터 + 보유 + 배치 + Storage.
-- 학생 권한:
--   * decoration_items: 모든 인증 사용자 읽기 (목록/이미지 노출)
--   * student_decorations: 본인 행만 읽기/쓰기
--   * student_yard_layout: 본인 행만 읽기/쓰기
-- 모든 학생 쓰기는 service_role 을 거치지 않고 anon 키로 직접 가능하도록
-- branch_id + external_student_id 매칭을 RLS 에 의존시킨다.
--
-- 비고: monster_tree 의 학생 식별은 (branch_id, external_student_id) 가 unique 인 garden_students 행으로
-- 들어오는 JWT 의 (branchId, studentLocalId) 와 매칭된다. RLS 안에서 jwt() 클레임을 직접 못 읽으므로,
-- 학생 측 쓰기는 우선 Server Action(service_role) 으로 처리한다 — RLS 는 service_role 만 통과시키는 정책으로 충분.

-- ============ 1) decoration_items (소품 마스터) ============
create table if not exists public.decoration_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  category text not null check (
    category in ('insect', 'flower', 'furniture', 'plant', 'misc')
  ),
  price integer not null default 0 check (price >= 0),
  default_width_percent numeric not null default 8.0
    check (default_width_percent > 0 and default_width_percent <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decoration_items_category_active_idx
  on public.decoration_items (category, is_active);

alter table public.decoration_items enable row level security;
drop policy if exists "decoration_items_read" on public.decoration_items;
create policy "decoration_items_read" on public.decoration_items
  for select using (true);

-- ============ 2) student_decorations (학생 보유 소품) ============
create table if not exists public.student_decorations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.garden_students(id) on delete cascade,
  decoration_item_id uuid not null references public.decoration_items(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  acquired_at timestamptz not null default now(),
  unique (student_id, decoration_item_id)
);

create index if not exists student_decorations_student_idx
  on public.student_decorations (student_id);

alter table public.student_decorations enable row level security;
-- service_role 만 쓰기 — 학생 측 쓰기는 Server Action 을 통해 진행.
drop policy if exists "student_decorations_service" on public.student_decorations;
-- (정책 없음 = anon 차단; service_role 은 RLS 우회)

-- ============ 3) student_yard_layout (마당 배치 정보) ============
create table if not exists public.student_yard_layout (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.garden_students(id) on delete cascade,
  decoration_item_id uuid not null references public.decoration_items(id) on delete cascade,
  instance_id text not null, -- 같은 아이템 여러 개 구분 (클라이언트가 생성한 uuid)
  position_x numeric not null check (position_x >= -10 and position_x <= 110),
  position_y numeric not null check (position_y >= -10 and position_y <= 110),
  width_percent numeric not null default 8.0
    check (width_percent > 0 and width_percent <= 100),
  rotation numeric not null default 0
    check (rotation >= -360 and rotation <= 360),
  z_index integer not null default 0,
  placed_at timestamptz not null default now(),
  unique (student_id, instance_id)
);

create index if not exists student_yard_layout_student_idx
  on public.student_yard_layout (student_id);

alter table public.student_yard_layout enable row level security;
-- service_role 만 쓰기, 읽기도 (안전상) service_role 만 — 학생 데이터 노출 방지.
-- /me 페이지가 SSR 로 service_role 또는 anon 으로 가져오는 부분은 Server Action 으로 처리.

-- ============ 4) Storage 버킷: decorations ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'decorations',
  'decorations',
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
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'decorations_public_read'
  ) then
    create policy "decorations_public_read" on storage.objects
      for select using (bucket_id = 'decorations');
  end if;
end $$;
