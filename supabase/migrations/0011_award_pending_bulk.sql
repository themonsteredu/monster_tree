-- 여러 학생에게 동일 포인트를 한 트랜잭션에 pending 등록.
-- service_role 에서만 호출.
--
-- 동작: garden_pending_points 에 N개 행을 한 번에 INSERT.
--   - p_student_ids 가 빈 배열이면 0 리턴.
--   - p_reason 은 양쪽 trim, 빈 문자열은 NULL 으로 저장.
--   - returns: 입력된 행 수.

create or replace function public.garden_award_pending_bulk(
  p_student_ids uuid[],
  p_points int,
  p_reason text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_reason text;
begin
  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return 0;
  end if;
  if p_points is null then
    raise exception 'points_required' using errcode = 'P0001';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  insert into garden_pending_points (student_id, points, reason)
  select s, p_points, v_reason
    from unnest(p_student_ids) as s;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
