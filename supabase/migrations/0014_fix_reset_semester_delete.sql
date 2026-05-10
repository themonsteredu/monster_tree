-- 0013 의 garden_reset_semester 가 Supabase "DELETE without WHERE" 안전 가드에
-- 차단되는 이슈 수정. WHERE TRUE 로 명시.

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

  delete from garden_pending_points where true;
  get diagnostics v_pending_deleted = row_count;

  return json_build_object(
    'ok', true,
    'student_count', v_student_count,
    'pending_deleted', v_pending_deleted
  );
end;
$$;
