-- ===============================================================
-- 0044: 수업노트(monster-site) → 사과정원 포인트 자동 적립
--
-- monster-site 수업노트에서 일일테스트 점수를 입력하면 monster-site 서버가
-- (service_role 로) garden_award_external RPC 를 호출해 garden_pending_points
-- 에 적립한다. 학생이 /tree/me 의 "받기" 버튼으로 확정하는 기존 흐름은 그대로.
--
-- garden_external_awards: 같은 학생+날짜+시험종류에 1회만 적립되도록 하는
-- 중복 방지 장부. source_key 예: site-note:br_xxx:12:2026-07-02:daily
-- 점수가 정정되면(3점→4점) 차액만큼만 추가 pending 을 만들고 장부를 갱신한다.
-- ===============================================================

create table if not exists public.garden_external_awards (
  id          uuid primary key default gen_random_uuid(),
  source_key  text not null unique,
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  points      int  not null,
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists garden_external_awards_student_idx
  on public.garden_external_awards (student_id, created_at desc);

-- RLS: 정책을 만들지 않음 = anon/authenticated 접근 불가. service_role 전용.
alter table public.garden_external_awards enable row level security;

create or replace function public.garden_award_external(
  p_source_key text,
  p_student_id uuid,
  p_points     int,
  p_reason     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing garden_external_awards%rowtype;
  v_delta int;
begin
  if p_source_key is null or length(trim(p_source_key)) = 0 then
    raise exception 'source_key_required';
  end if;
  if not exists (select 1 from garden_students where id = p_student_id) then
    raise exception 'student_not_found';
  end if;

  select * into v_existing
    from garden_external_awards
   where source_key = p_source_key;

  if not found then
    -- 0점(또는 음수)은 최초 적립 대상이 아님 — 장부에도 남기지 않는다.
    if p_points is null or p_points <= 0 then
      return jsonb_build_object('status', 'unchanged');
    end if;
    begin
      insert into garden_external_awards (source_key, student_id, points, reason)
      values (p_source_key, p_student_id, p_points, p_reason);
    exception when unique_violation then
      -- 동시 호출 경합 — 이미 다른 요청이 적립함
      return jsonb_build_object('status', 'unchanged');
    end;
    insert into garden_pending_points (student_id, points, reason)
    values (p_student_id, p_points, p_reason);
    return jsonb_build_object('status', 'awarded', 'points', p_points);
  end if;

  v_delta := coalesce(p_points, 0) - v_existing.points;
  if v_delta = 0 then
    return jsonb_build_object('status', 'unchanged');
  end if;

  update garden_external_awards
     set points = coalesce(p_points, 0),
         reason = p_reason,
         updated_at = now()
   where source_key = p_source_key;

  insert into garden_pending_points (student_id, points, reason)
  values (p_student_id, v_delta, coalesce(p_reason, '포인트') || ' 정정');
  return jsonb_build_object('status', 'adjusted', 'points', v_delta);
end $$;

revoke all on function public.garden_award_external(text, uuid, int, text) from public, anon, authenticated;
grant execute on function public.garden_award_external(text, uuid, int, text) to service_role;
