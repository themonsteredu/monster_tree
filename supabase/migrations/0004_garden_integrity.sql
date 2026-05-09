-- ===============================================================
-- 사과정원 마이그레이션 #4: 데이터 무결성 강화
--
-- 배경
-- - garden_* 테이블의 RLS 는 0001 에서 select 정책만 부여하고 insert/update/
--   delete 정책은 일부러 비워뒀음 (postgres default-deny 로 anon 쓰기 차단).
-- - 하지만 service_role 키로 우회되는 서버 측 코드가 잘못된 값을 넣을 가능성은
--   여전히 있다. 예: total_points 음수, current_stage 9 등.
-- - 이 마이그레이션은 DB 레벨 CHECK 제약을 추가해 그런 잘못된 상태가 저장되는
--   것을 원천 차단한다. 기존 데이터에 위반이 있으면 적용 실패하므로 idempotent
--   하게 작성 (중복 추가 방지).
-- ===============================================================

-- 1) garden_students: 포인트는 0 이상, 단계는 1~8, 사과 수는 0 이상
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'garden_students_total_points_nonneg'
  ) then
    alter table public.garden_students
      add constraint garden_students_total_points_nonneg
      check (total_points >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'garden_students_current_stage_range'
  ) then
    alter table public.garden_students
      add constraint garden_students_current_stage_range
      check (current_stage between 1 and 8);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'garden_students_apples_harvested_nonneg'
  ) then
    alter table public.garden_students
      add constraint garden_students_apples_harvested_nonneg
      check (apples_harvested >= 0);
  end if;
end $$;

-- 2) garden_harvests: 한 번 수확 시 1개 이상이어야 의미가 있음
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'garden_harvests_apples_count_positive'
  ) then
    alter table public.garden_harvests
      add constraint garden_harvests_apples_count_positive
      check (apples_count > 0);
  end if;
end $$;

-- 3) garden_point_logs: points = 0 인 로그는 사용처가 없음 (실수로 빈 적립을
--    저장하는 것을 막음). 음수는 차감으로 의미 있으므로 허용.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'garden_point_logs_points_nonzero'
  ) then
    alter table public.garden_point_logs
      add constraint garden_point_logs_points_nonzero
      check (points <> 0);
  end if;
end $$;

-- 4) 보안 모델 문서화 (psql \d+ 로 보일 때 의도가 명확하도록 코멘트)
comment on table public.garden_students is
  '사과정원 학생. anon 은 select 만, 쓰기는 service_role (Server Action) 전용. '
  'branch_id+external_student_id 로 monster-site 학생 자체 인증과 연결.';

comment on table public.garden_point_logs is
  '포인트 적립/차감 로그. anon 은 select 만, 쓰기는 service_role 전용.';

comment on table public.garden_harvests is
  '8단계 학생을 5단계로 리셋하며 사과 6개 수확. anon 은 select 만, '
  '쓰기는 service_role 전용. realtime publication 에 포함되어 TV 화면 애니메이션 트리거.';
