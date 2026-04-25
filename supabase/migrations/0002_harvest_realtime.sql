-- ===============================================================
-- 사과정원 마이그레이션 #2: 수확 사이클 지원
--
-- 목적
-- - garden_harvests 의 Realtime 활성화 (TV 화면에서 사과 비행 애니메이션 트리거)
--
-- 안전성
-- - 0001 마이그레이션은 그대로 두고, 이 파일은 idempotent 하게 작성됨.
-- - publication 에 이미 추가되어 있는 경우를 대비해 dynamic SQL 로 안전 추가.
-- ===============================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'garden_harvests'
  ) then
    execute 'alter publication supabase_realtime add table public.garden_harvests';
  end if;
end $$;
