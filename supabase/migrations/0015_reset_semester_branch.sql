-- garden_reset_semester 을 지점-스코프로 변경.
-- 이제 branch_id 를 필수로 받고, 해당 지점의 학생/pending 만 초기화.

create or replace function public.garden_reset_semester(
  p_branch_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_count int := 0;
  v_pending_deleted int := 0;
begin
  if p_branch_id is null or trim(p_branch_id) = '' then
    raise exception 'branch_id_required' using errcode = 'P0001';
  end if;

  update garden_students
    set total_points = 0,
        current_stage = 1,
        apples_harvested = 0
    where is_active = true and branch_id = p_branch_id;
  get diagnostics v_student_count = row_count;

  delete from garden_pending_points
    where student_id in (
      select id from garden_students where branch_id = p_branch_id
    );
  get diagnostics v_pending_deleted = row_count;

  return json_build_object(
    'ok', true,
    'student_count', v_student_count,
    'pending_deleted', v_pending_deleted
  );
end;
$$;
