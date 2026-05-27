-- ===============================================================
-- 0039: village 스토리지 버킷 공개 설정 재확정 (재발 방지).
--
-- 배경/건물 이미지가 한꺼번에 안 보이는(마을 전체 검정) 사고가 있었음.
-- 원인은 파일 삭제가 아니라 'village' 버킷의 public 설정/공개 읽기 정책이
-- 꺼진 것. 0026 에서 한 번 설정했지만 대시보드에서 토글되면 다시 깨진다.
--
-- 이 마이그레이션은 버킷을 다시 public 으로 만들고 공개 read 정책을
-- 재생성한다. 전부 idempotent — 여러 번 실행해도 안전하고 파일은 건드리지 않음.
-- ===============================================================

-- 1) village 버킷을 public 으로 (없으면 생성)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'village',
  'village',
  true,
  2097152, -- 2MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) 공개 read 정책 재생성 (anon 이 village 객체를 읽을 수 있게)
drop policy if exists "village_public_read" on storage.objects;
create policy "village_public_read" on storage.objects
  for select using (bucket_id = 'village');
