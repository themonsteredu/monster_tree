-- ===============================================================
-- 0042: 게임센터 — game_plays / game_rankings / 오늘 플레이 횟수 RPC
--
-- ⚠️ 이 테이블들은 그동안 마이그레이션 파일 없이 Supabase SQL Editor 에서
--    수동으로만 만들어져 있었다(HANDOFF.md §3-1). 그래서 저장소만으로는 DB 를
--    재현할 수 없었다(H-6). 이 파일이 그 공백을 메운다.
--    이미 운영 DB 에 테이블이 있으면 create table if not exists 라서 안전하게 건너뛴다.
--
-- 컬럼/RLS 는 src/app/me/game-center/actions.ts 의 실제 사용과
-- 기존 0037_quiz_center.sql 패턴에 맞춰 작성.
-- ===============================================================

-- 1) game_plays — 한 판 플레이 기록 ------------------------------------------
create table if not exists public.game_plays (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  branch_id   text not null,
  game_type   text not null default 'infinite_stairs',
  score       int  not null default 0 check (score >= 0),
  exp_earned  int  not null default 0 check (exp_earned >= 0),
  played_at   timestamptz not null default now()
);

create index if not exists game_plays_student_played_idx
  on public.game_plays (student_id, played_at desc);
create index if not exists game_plays_student_game_played_idx
  on public.game_plays (student_id, game_type, played_at desc);

-- 2) game_rankings — 학생 × 게임 × 월(KST) 베스트 점수 ----------------------
create table if not exists public.game_rankings (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  branch_id   text not null,
  game_type   text not null default 'infinite_stairs',
  best_score  int  not null default 0 check (best_score >= 0),
  month       text not null,                       -- 'YYYY-MM' (KST)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, game_type, month)
);

create index if not exists game_rankings_branch_month_idx
  on public.game_rankings (branch_id, game_type, month, best_score desc);

-- 3) get_today_play_count(student, game_type) — 오늘(KST) 플레이 횟수 --------
-- 기존에 매개변수 기본값을 가진 함수가 수동 적용돼 있을 수 있어, create or replace 가
-- "cannot remove parameter defaults" (42P13) 로 막힌다. 먼저 drop 후 재생성한다.
-- (앱은 항상 두 인자를 모두 넘기므로 기본값 제거해도 안전)
drop function if exists public.get_today_play_count(uuid, text);
create or replace function public.get_today_play_count(p_student_id uuid, p_game_type text)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from game_plays
  where student_id = p_student_id
    and game_type = p_game_type
    and (played_at at time zone 'Asia/Seoul')::date
        = (now()      at time zone 'Asia/Seoul')::date;
$$;

-- 4) RLS ---------------------------------------------------------------------
--   game_plays:    원시 기록 → anon 정책 없음 = service_role(서버) 전용.
--   game_rankings: 월간 리더보드 → 읽기 공개(기존 garden 보드 관례와 동일). 쓰기는 서버.
alter table public.game_plays    enable row level security;
alter table public.game_rankings enable row level security;

drop policy if exists "game_rankings_read_all" on public.game_rankings;
create policy "game_rankings_read_all"
  on public.game_rankings
  for select
  to anon, authenticated
  using (true);

-- 5) 마을 시설 링크 — 게임센터 진입 (수동 적용분 재현) -----------------------
update public.village_buildings
  set link = '/me/game-center', is_ready = true
  where building_key = 'game';

-- 참고: 몬스터 진화 임계 EXP / 단계 이미지 시드(monster_stage_images 의 행)는
--       이 파일 범위가 아니다. 별도로 시드돼 있어야 한다(0034_monsters_system.sql 의
--       테이블은 있으나 시드 데이터는 환경마다 별도 적용). 필요 시 별도 시드 파일로 관리 권장.
