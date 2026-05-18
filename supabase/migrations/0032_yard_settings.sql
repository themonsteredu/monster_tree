-- 마이룸 마당 글로벌 배경 — 관리자가 업로드한 단일 배경을 모든 학생이 공유.
-- garden_students.background (학생 본인 설정) 컬럼은 그대로 두지만, /me 페이지가
-- yard_settings.background_image 가 있으면 그걸 우선해서 표시.

create table if not exists public.yard_settings (
  id uuid primary key default gen_random_uuid(),
  background_image text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 단일 활성 행만 유지 — 첫 행 자동 생성
insert into public.yard_settings (background_image, is_active)
select null, true
where not exists (select 1 from public.yard_settings);

alter table public.yard_settings enable row level security;
drop policy if exists "yard_settings_read" on public.yard_settings;
create policy "yard_settings_read" on public.yard_settings
  for select using (true);

-- Storage 버킷 — 마당 배경 이미지
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'yard',
  'yard',
  true,
  4194304, -- 4MB (배경이라 마을·소품보다 크게 허용)
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'yard_public_read'
  ) then
    create policy "yard_public_read" on storage.objects
      for select using (bucket_id = 'yard');
  end if;
end $$;
