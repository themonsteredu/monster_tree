-- ===============================================================
-- 0007: garden_pending_points — 학생이 직접 받기 버튼으로 적용
--
-- 변경 정책: 원장이 /admin 에서 +pt 부과 시 즉시 garden_students.total_points
-- 가 올라가지 않고 이 테이블에만 기록된다. 학생이 /tree/me 의 "받기" 버튼을
-- 누르면 그제서야 garden_point_logs 로 옮겨지고 garden_students 가 갱신된다.
--
-- 효과:
-- - 학생이 자신의 화분이 변화하는 순간을 직접 체험 (분무기 효과 + 카운트업)
-- - TV 화면(/) 은 학생이 받기 누를 때까지 변화하지 않음 (의도된 동작)
-- ===============================================================

create table if not exists public.garden_pending_points (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  points      int  not null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists garden_pending_points_student_idx
  on public.garden_pending_points (student_id, created_at desc);

-- Realtime: 학생 페이지가 새 적립을 즉시 보도록
alter publication supabase_realtime add table public.garden_pending_points;

-- RLS: 읽기는 anon 허용 (학생 클라이언트가 본인 행 조회), 쓰기는 service_role 전용
alter table public.garden_pending_points enable row level security;

drop policy if exists "garden_pending_points_read_all" on public.garden_pending_points;

create policy "garden_pending_points_read_all"
  on public.garden_pending_points
  for select
  to anon, authenticated
  using (true);
