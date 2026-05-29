-- ===============================================================
-- 0043: 퀴즈 포인트 부정 적립 방지 (H-7)
--
-- 문제: submitQuizAnswersAction 에 하루 제한 검사가 없어, 정답을 아는 채로
--       제출을 반복하면 "퀴즈센터 올클" 포인트(+1)를 하루에 여러 번 받을 수 있었다.
--       start 단계 검사만으로는 동시 제출(race) 도 막지 못한다.
--
-- 해결: "학생 × KST 날짜" 당 포인트 적립(point_earned > 0)을 DB 가 1건으로 강제하는
--       부분 unique 인덱스를 둔다. 앱 코드(actions.ts)도 적립 전 당일 적립 여부를
--       확인하지만, 이 인덱스가 race 까지 막는 최종 백스톱이다.
--
-- play_day 컬럼은 트리거가 played_at(KST 날짜)로 자동 채우므로 앱은 신경쓸 필요 없다.
-- ===============================================================

-- 1) KST 날짜 컬럼 + 자동 채움 트리거
alter table public.quiz_plays add column if not exists play_day date;

create or replace function public.quiz_plays_set_play_day()
returns trigger
language plpgsql
as $$
begin
  new.play_day := ((new.played_at at time zone 'UTC') + interval '9 hours')::date;
  return new;
end$$;

drop trigger if exists trg_quiz_plays_play_day on public.quiz_plays;
create trigger trg_quiz_plays_play_day
  before insert or update on public.quiz_plays
  for each row execute function public.quiz_plays_set_play_day();

-- 2) 과거 행 backfill (트리거가 동일하게 재계산)
update public.quiz_plays set play_day = play_day;

-- 3) 과거에 같은 날 포인트가 2건 이상 쌓인 경우, 가장 이른 1건만 남기고 나머지는
--    point_earned = 0 으로 정리(안 하면 아래 unique 인덱스 생성이 실패한다).
with ranked as (
  select id,
         row_number() over (
           partition by student_id, play_day order by played_at asc, id asc
         ) as rn
  from public.quiz_plays
  where point_earned > 0
)
update public.quiz_plays q
  set point_earned = 0
  from ranked r
  where q.id = r.id and r.rn > 1;

-- 4) 학생 × KST날짜 당 포인트 적립 1건만 (race-safe 백스톱)
create unique index if not exists quiz_plays_one_point_per_day
  on public.quiz_plays (student_id, play_day)
  where point_earned > 0;
