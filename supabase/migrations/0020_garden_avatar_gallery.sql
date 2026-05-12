-- 아바타 꾸미기용 관리자 업로드 갤러리.
-- 카테고리별 이미지를 관리자가 미리 업로드해두면 학생들이 카테고리마다 1개씩 골라서
-- 합성된 아바타를 사용한다.
-- 카테고리: base(베이스 캐릭터), outfit(의상), hat(모자), accessory(액세서리)

create table if not exists garden_avatar_gallery (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('base', 'outfit', 'hat', 'accessory')),
  label text,
  image_url text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists garden_avatar_gallery_active_cat
  on garden_avatar_gallery(category, sort_order)
  where active = true;

alter table garden_avatar_gallery enable row level security;

-- public read of active items (anon 도 학생 picker 에서 조회할 수 있게)
drop policy if exists "garden_avatar_gallery_read" on garden_avatar_gallery;
create policy "garden_avatar_gallery_read" on garden_avatar_gallery
  for select using (active = true);

-- 쓰기는 service_role 만 (관리자 server action 에서 수행). RLS 우회되므로 추가 정책 불필요.
