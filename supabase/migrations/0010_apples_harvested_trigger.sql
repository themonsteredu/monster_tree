-- garden_students.apples_harvested 를 garden_harvests 의 합과 항상 일치시키는 트리거.
--
-- 직접 SQL 수정, 향후 추가 RPC, 데이터 보정 시에도 캐시 drift 가 일어나지 않도록
-- 단일 진실원(SUM(garden_harvests.apples_count))을 자동으로 미러링한다.

create or replace function public.garden_recalc_apples_harvested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_total int;
begin
  v_student_id := coalesce(new.student_id, old.student_id);
  select coalesce(sum(apples_count), 0) into v_total
    from garden_harvests
    where student_id = v_student_id;
  update garden_students
    set apples_harvested = v_total
    where id = v_student_id;
  return null;
end;
$$;

drop trigger if exists garden_harvests_recalc_ins on garden_harvests;
drop trigger if exists garden_harvests_recalc_upd on garden_harvests;
drop trigger if exists garden_harvests_recalc_del on garden_harvests;

create trigger garden_harvests_recalc_ins
  after insert on garden_harvests
  for each row execute function garden_recalc_apples_harvested();

create trigger garden_harvests_recalc_upd
  after update on garden_harvests
  for each row execute function garden_recalc_apples_harvested();

create trigger garden_harvests_recalc_del
  after delete on garden_harvests
  for each row execute function garden_recalc_apples_harvested();

-- 백필: 모든 학생의 apples_harvested 를 현재 합과 동기화.
update garden_students s
  set apples_harvested = coalesce((
    select sum(h.apples_count) from garden_harvests h where h.student_id = s.id
  ), 0);
