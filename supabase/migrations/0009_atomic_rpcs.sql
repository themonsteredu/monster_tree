-- 사과정원 핵심 액션을 원자 트랜잭션으로 묶는 RPC.
-- service_role 키로만 호출 (SECURITY DEFINER).
--
-- 단계 임계값은 src/lib/garden.ts:STAGE_TABLE 과 동기화 유지 필요.
-- 1단계 범위에선 하드코딩, 3단계의 garden_settings 도입 시 동적화 예정.

-- (1) 받기 — pending 행을 atomic 하게 소비.
-- 동일 pending 두 번 호출 시 second 는 graceful no-op (already_claimed=true).
create or replace function public.garden_claim_pending(
  p_pending_id uuid,
  p_branch_id text,
  p_external_id integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_total int;
  v_pending_points int;
  v_pending_reason text;
  v_new_total int;
  v_new_stage int;
begin
  -- 본인 학생 조회
  select id into v_student_id
    from garden_students
    where branch_id = p_branch_id and external_student_id = p_external_id;
  if v_student_id is null then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;

  -- DELETE...RETURNING 으로 atomic 소비
  delete from garden_pending_points
    where id = p_pending_id and student_id = v_student_id
    returning points, reason
    into v_pending_points, v_pending_reason;

  if v_pending_points is null then
    -- 이미 다른 클라이언트가 처리했거나 본인 소유 아님 — graceful
    return json_build_object('ok', true, 'already_claimed', true);
  end if;

  -- 학생 행 락 + 누적/단계 갱신
  select total_points into v_total
    from garden_students
    where id = v_student_id
    for update;

  v_new_total := greatest(0, v_total + v_pending_points);
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

  insert into garden_point_logs (student_id, points, reason)
    values (v_student_id, v_pending_points, v_pending_reason);

  update garden_students
    set total_points = v_new_total,
        current_stage = v_new_stage
    where id = v_student_id;

  return json_build_object(
    'ok', true,
    'new_total', v_new_total,
    'new_stage', v_new_stage,
    'points', v_pending_points
  );
end;
$$;

-- (2) 수확 — 8단계 학생을 atomic 하게 수확 처리.
-- apples_harvested 는 PR #2 의 garden_harvests 트리거가 자동 반영하므로 여기선
-- total_points / current_stage 만 리셋한다. (트리거 도입 전엔 PR #2 가 백필도 수행.)
create or replace function public.garden_harvest_student(
  p_student_id uuid,
  p_apples int default 6,
  p_reset_points int default 130
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_new_stage int;
begin
  select total_points into v_total
    from garden_students
    where id = p_student_id
    for update;

  if v_total is null then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  if v_total < 380 then
    raise exception 'not_yet_harvest_stage' using errcode = 'P0001';
  end if;

  insert into garden_harvests (student_id, apples_count)
    values (p_student_id, p_apples);

  v_new_stage := case
    when p_reset_points >= 380 then 8
    when p_reset_points >= 280 then 7
    when p_reset_points >= 200 then 6
    when p_reset_points >= 130 then 5
    when p_reset_points >=  70 then 4
    when p_reset_points >=  30 then 3
    when p_reset_points >=  10 then 2
    else 1
  end;

  update garden_students
    set total_points = p_reset_points,
        current_stage = v_new_stage
    where id = p_student_id;

  return json_build_object(
    'ok', true,
    'apples', p_apples,
    'new_total', p_reset_points,
    'new_stage', v_new_stage
  );
end;
$$;
