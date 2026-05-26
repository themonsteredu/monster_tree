-- ===============================================================
-- 0037: 퀴즈센터 — 몬스터마을의 시설 중 하나.
--
-- 학생은 학년별 수학/상식/넌센스 카테고리에서 3문제를 풀고,
-- 모두 맞히면(올클) 사과정원의 사과포인트 1점을 받는다.
-- (실제 지급은 서버 액션이 garden_pending_points 에 행을 추가하는 방식.)
--
-- 본 파일은 스키마/RLS/오늘 풀이 횟수 RPC 만 정의한다.
-- ===============================================================

-- 1) quiz_questions — 문제 DB --------------------------------------------
create table if not exists public.quiz_questions (
  id              uuid primary key default gen_random_uuid(),
  -- 'math' (수학), 'general' (상식), 'nonsense' (넌센스)
  category        text not null check (category in ('math','general','nonsense')),
  -- 수학은 학년별 (예: 'elementary_3' ~ 'middle_3'),
  -- 상식/넌센스는 'all'. 값 집합은 애플리케이션이 관리하므로 enum 으로 묶지 않음.
  grade           text not null,
  question        text not null,
  option_1        text not null,
  option_2        text not null,
  option_3        text not null,
  option_4        text not null,
  correct_answer  int  not null check (correct_answer between 1 and 4),
  explanation     text,
  difficulty      text not null default 'medium'
                  check (difficulty in ('easy','medium','hard')),
  is_approved     boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz
);

-- 출제 쿼리: (category, grade) 로 좁힌 뒤 is_approved + is_active 필터
create index if not exists quiz_questions_pickable_idx
  on public.quiz_questions (category, grade, is_approved, is_active);

-- 2) quiz_plays — 한 회차 풀이 기록 (한 행 = 3문제) -----------------------
create table if not exists public.quiz_plays (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.garden_students(id) on delete cascade,
  branch_id       text not null,
  played_at       timestamptz not null default now(),
  question_ids    uuid[] not null,
  answers         int[]  not null,
  correct_count   int    not null check (correct_count between 0 and 3),
  is_perfect      boolean not null default false,
  point_earned    int    not null default 0
);

create index if not exists quiz_plays_student_played_idx
  on public.quiz_plays (student_id, played_at desc);

create index if not exists quiz_plays_branch_played_idx
  on public.quiz_plays (branch_id, played_at desc);

-- ===============================================================
-- RLS
-- - quiz_questions: anon/authenticated 는 검수 완료(is_approved) + 활성(is_active) 문제만 SELECT.
--                   관리자는 service_role 키로 RLS 우회 → 미검수 문제도 조회/검수 가능.
-- - quiz_plays:     anon/authenticated 에 SELECT/INSERT 정책을 열지 않음.
--                   본 프로젝트의 학생 인증은 Supabase auth 가 아니라 자체 JWT 이므로
--                   auth.uid() 기반 행단위 제어가 불가능. 대신 모든 읽기/쓰기를
--                   server action 에서 service_role 로 처리하고 거기서 JWT 의
--                   student_id 와 행의 student_id 를 대조해 "자기 기록만" 을 강제한다.
-- ===============================================================
alter table public.quiz_questions enable row level security;
alter table public.quiz_plays     enable row level security;

drop policy if exists "quiz_questions_read_approved_active" on public.quiz_questions;
drop policy if exists "quiz_plays_read_all"                 on public.quiz_plays;
drop policy if exists "quiz_plays_insert_all"               on public.quiz_plays;

create policy "quiz_questions_read_approved_active"
  on public.quiz_questions
  for select
  to anon, authenticated
  using (is_approved = true and is_active = true);

-- (quiz_plays 는 anon 정책 없음 → service_role 전용)

-- ===============================================================
-- get_today_quiz_count(student_id) — 학생의 오늘(KST) 퀴즈 풀이 횟수.
-- 데일리 무료 횟수 안내 / "오늘 N회 풀었어요" 표시 등에 사용.
-- ===============================================================
create or replace function public.get_today_quiz_count(p_student_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from quiz_plays
  where student_id = p_student_id
    and (played_at at time zone 'Asia/Seoul')::date
        = (now()      at time zone 'Asia/Seoul')::date;
$$;
