-- 학기 시작 시 모든 학생을 초기 상태로 되돌림.
--
-- 동작:
--   1) garden_students.total_points = 0, current_stage = 1, apples_harvested = 0 (활성 학생 모두)
--   2) garden_pending_points 전체 삭제 (이전 학기의 미수령 포인트는 무효화)
--   3) garden_point_logs / garden_harvests 는 보존 (감사 흔적)
--
-- 호출자가 두 번 실행해도 멱등 (이미 0 인 행은 그대로).
-- 모든 변경은 단일 트랜잭션.

create or replace function public.garden_reset_semester()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_count int := 0;
  v_pending_deleted int := 0;
begin
  update garden_students
    set total_points = 0,
        current_stage = 1,
        apples_harvested = 0
    where is_active = true;
  get diagnostics v_student_count = row_count;

  delete from garden_pending_points;
  get diagnostics v_pending_deleted = row_count;

  return json_build_object(
    'ok', true,
    'student_count', v_student_count,
    'pending_deleted', v_pending_deleted
  );
end;
$$;
