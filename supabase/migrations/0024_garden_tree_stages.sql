-- 사과나무 단계별 이미지 + 미세조정 설정.
-- 관리자가 단계마다 PNG 이미지를 업로드하면 그 이미지를 SVG 대신 표시한다.
-- 이미지가 없는 단계는 기존 SVG fallback 유지.

create table if not exists public.garden_tree_stages (
  stage int primary key check (stage between 1 and 8),
  image_url text,
  scale numeric not null default 1.0 check (scale >= 0.5 and scale <= 1.5),
  offset_x numeric not null default 0 check (offset_x >= -50 and offset_x <= 50),
  offset_y numeric not null default 0 check (offset_y >= -50 and offset_y <= 50),
  updated_at timestamptz not null default now()
);

-- 8개 단계 미리 시드 (image_url 은 NULL → SVG fallback)
insert into public.garden_tree_stages (stage)
values (1), (2), (3), (4), (5), (6), (7), (8)
on conflict (stage) do nothing;

alter table public.garden_tree_stages enable row level security;

drop policy if exists "garden_tree_stages_read" on public.garden_tree_stages;
create policy "garden_tree_stages_read" on public.garden_tree_stages
  for select using (true);

-- Storage 버킷: 단계별 이미지 (관리자가 service_role 로 업로드)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tree-stages',
  'tree-stages',
  true,
  1048576,
  array['image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'tree_stages_public_read'
  ) then
    create policy "tree_stages_public_read" on storage.objects
      for select using (bucket_id = 'tree-stages');
  end if;
end $$;
