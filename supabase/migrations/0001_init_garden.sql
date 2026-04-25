-- ===============================================================
-- 사과정원 (Apple Garden) 초기 마이그레이션
--
-- 주의: 기존 themonster.kr 테이블은 절대 건드리지 않습니다.
--      모든 새 테이블은 garden_ 접두사를 사용합니다.
-- 실행: Supabase 대시보드 → SQL Editor 에 통째로 붙여넣어 실행
-- ===============================================================

-- 1) garden_students : 학생 명단
create table if not exists public.garden_students (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  class_name        text,                       -- 예: "중2 A반"
  total_points      int  not null default 0,    -- 누적 포인트 (캐시값)
  current_stage     int  not null default 1,    -- 현재 단계 (1~8)
  apples_harvested  int  not null default 0,    -- 수확한 사과 수 (마켓데이용)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists garden_students_active_idx
  on public.garden_students (is_active, total_points desc);

-- 2) garden_point_logs : 포인트 적립 기록 (음수 가능 = 차감)
create table if not exists public.garden_point_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  points      int  not null,
  reason      text,                              -- "출석" / "숙제완료" / "테스트 90점" 등
  logged_at   timestamptz not null default now()
);

create index if not exists garden_point_logs_student_idx
  on public.garden_point_logs (student_id, logged_at desc);

-- 3) garden_harvests : 수확 기록 (Phase 2 에서 본격 사용)
create table if not exists public.garden_harvests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.garden_students(id) on delete cascade,
  apples_count  int  not null,
  harvested_at  timestamptz not null default now()
);

-- ===============================================================
-- Realtime 활성화
-- TV 화면이 즉시 갱신되려면 students 와 point_logs 의 변경을 구독해야 합니다.
-- ===============================================================
alter publication supabase_realtime add table public.garden_students;
alter publication supabase_realtime add table public.garden_point_logs;

-- ===============================================================
-- RLS (Row Level Security)
-- - 익명(anon)은 모든 garden_* 테이블을 "읽기"만 가능 (TV 화면용)
-- - "쓰기"는 서버에서 service_role 키로만 수행 (Next.js 서버 컴포넌트/액션)
--   따라서 anon 정책에는 insert/update/delete 를 열어두지 않습니다.
-- ===============================================================
alter table public.garden_students    enable row level security;
alter table public.garden_point_logs  enable row level security;
alter table public.garden_harvests    enable row level security;

drop policy if exists "garden_students_read_all"   on public.garden_students;
drop policy if exists "garden_point_logs_read_all" on public.garden_point_logs;
drop policy if exists "garden_harvests_read_all"   on public.garden_harvests;

create policy "garden_students_read_all"
  on public.garden_students
  for select
  to anon, authenticated
  using (true);

create policy "garden_point_logs_read_all"
  on public.garden_point_logs
  for select
  to anon, authenticated
  using (true);

create policy "garden_harvests_read_all"
  on public.garden_harvests
  for select
  to anon, authenticated
  using (true);

-- ===============================================================
-- 더미 학생 10명 (이미 같은 이름이 있으면 재삽입하지 않음)
-- ===============================================================
insert into public.garden_students (name, class_name, total_points, current_stage)
select v.name, v.class_name, v.total_points,
       case
         when v.total_points >= 380 then 8
         when v.total_points >= 280 then 7
         when v.total_points >= 200 then 6
         when v.total_points >= 130 then 5
         when v.total_points >=  70 then 4
         when v.total_points >=  30 then 3
         when v.total_points >=  10 then 2
         else 1
       end as current_stage
from (values
  ('김민지', '중2 A반', 130),
  ('박서준', '중2 A반', 380),
  ('이지우', '중2 A반', 45),
  ('최예준', '중2 B반', 215),
  ('강도윤', '중2 B반', 290),
  ('윤서아', '중2 B반', 85),
  ('임시현', '중1 A반', 15),
  ('정하은', '중1 A반', 5),
  ('한지호', '중1 A반', 140),
  ('송채원', '중1 B반', 50)
) as v(name, class_name, total_points)
where not exists (
  select 1 from public.garden_students s where s.name = v.name
);
