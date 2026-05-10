-- 적용된 포인트 로그를 되돌리는 RPC.
-- 동작:
--   1) garden_point_logs 에서 해당 행 확인
--   2) 학생 FOR UPDATE 락
--   3) 보상 로그(-points) INSERT 으로 이력 보존
--   4) 학생 total_points / current_stage 갱신
--   원본 로그는 삭제하지 않는다 (감사 흔적 보존).
--
-- 멱등성: 동일 로그를 두 번 undo 하면 둘 다 적용됨 (각각 반대 로그 생성).
-- 호출자가 이미 되돌린 로그를 다시 되돌리지 않도록 UI 에서 제한 필요.

create or replace function public.garden_undo_log(p_log_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_points int;
  v_reason text;
  v_total int;
  v_new_total int;
  v_new_stage int;
begin
  select student_id, points, reason
    into v_student_id, v_points, v_reason
    from garden_point_logs
    where id = p_log_id;

  if v_student_id is null then
    raise exception 'log_not_found' using errcode = 'P0001';
  end if;

  -- 학생 행 락
  select total_points into v_total
    from garden_students
    where id = v_student_id
    for update;
  if v_total is null then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;

  -- 보상 로그 (부호 반전)
  insert into garden_point_logs (student_id, points, reason)
    values (
      v_student_id,
      -v_points,
      '되돌리기: ' || coalesce(v_reason, '')
    );

  -- total_points / stage 갱신
  v_new_total := greatest(0, v_total - v_points);
  v_new_stage := case
    when v_new_total >= 380 then 8
    when v_new_total >= 280 then 7
    when v_new_total >= 200 then 6
    when v_new_total >= 130 then 5
    when v_new_total >=  70 then 4
    when v_new_total >=  30 then 3
    when v_new_total >=  10 then 2
    else 1
  end;
  update garden_students
    set total_points = v_new_total,
        current_stage = v_new_stage
    where id = v_student_id;

  return json_build_object(
    'ok', true,
    'reverted_points', v_points,
    'new_total', v_new_total,
    'new_stage', v_new_stage,
    'student_id', v_student_id
  );
end;
$$;
