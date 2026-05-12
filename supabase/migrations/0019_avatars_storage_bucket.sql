-- 학생 아바타 이미지 업로드용 Storage 버킷.
-- public 버킷: 이미지 URL 이 브라우저에서 직접 로드 가능해야 함 (signed URL 회피).
-- 1MB 제한, 일반 이미지 MIME 만 허용.
-- 쓰기는 항상 service_role(서버 액션) 으로만 수행하므로 user-facing RLS 정책은 불필요.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 익명 SELECT 허용 (public bucket 이지만 RLS 정책도 명시적으로 켜둠)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_public_read'
  ) then
    create policy "avatars_public_read" on storage.objects
      for select using (bucket_id = 'avatars');
  end if;
end $$;
