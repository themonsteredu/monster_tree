-- ===============================================================
-- 0040: 몬스터마을 상점 — 포인트 대리구매 신청.
--
-- 학생이 쇼핑몰 링크 + 옵션 + 예상가격(원)으로 신청하면, 원장이 승인할 때
-- 사과포인트를 차감하고 대신 결제한다. 배송은 학원으로 와서 직접 전달.
--   포인트 환산: 1pt = 100원 (애플리케이션 상수 POINT_TO_WON).
--
-- 차감/복구는 기존 사과정원 원장(garden_point_logs + garden_students.total_points)에
-- 그대로 연결한다.
--   - 승인 시:  garden_shop_deduct (잔액 부족이면 거부 → 마이너스 방지)
--   - 취소 시:  garden_undo_log(point_log_id) 재사용으로 복구
--
-- 상태: requested(신청됨) → purchased(구매완료) → shipping(배송중) → delivered(전달완료)
--       / canceled(취소됨)
-- ===============================================================

create table if not exists public.shop_requests (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.garden_students(id) on delete cascade,
  branch_id           text not null,
  student_name_snapshot text not null default '',
  product_url         text not null,
  options             text,                 -- 색상/사이즈 등 (선택)
  memo                text,                 -- 학생 메모 (선택)
  estimated_price_won int  not null default 0 check (estimated_price_won >= 0),
  point_cost          int  not null default 0 check (point_cost >= 0),
  status              text not null default 'requested'
                      check (status in ('requested','purchased','shipping','delivered','canceled')),
  point_log_id        uuid,                 -- 차감 시 생성된 garden_point_logs.id (취소 환불용)
  admin_note          text,
  requested_at        timestamptz not null default now(),
  approved_at         timestamptz,
  updated_at          timestamptz not null default now()
);

create index if not exists shop_requests_branch_idx
  on public.shop_requests (branch_id, requested_at desc);
create index if not exists shop_requests_student_idx
  on public.shop_requests (student_id, requested_at desc);

-- RLS: anon 정책 없음 → 모든 읽기/쓰기는 server action(service_role)에서 처리하고
-- 거기서 JWT 의 student_id 와 행 student_id 를 대조해 "자기 신청만" 을 강제한다.
-- (quiz_plays 와 동일한 정책 모델)
alter table public.shop_requests enable row level security;

-- ===============================================================
-- garden_shop_deduct — 상점 승인 시 원자적 포인트 차감.
--   잔액(total_points)이 부족하면 차감하지 않고 ok=false 로 거부(마이너스 방지).
--   성공 시 음수 garden_point_logs 1행 생성 후 그 id 를 반환(취소 환불에 사용).
-- ===============================================================
create or replace function public.garden_shop_deduct(
  p_student_id uuid,
  p_points     int,
  p_reason     text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total     int;
  v_new_total int;
  v_new_stage int;
  v_log_id    uuid;
begin
  if p_points is null or p_points <= 0 then
    raise exception 'invalid_points' using errcode = 'P0001';
  end if;

  -- 학생 행 락 + 잔액 확인
  select total_points into v_total
    from garden_students
    where id = p_student_id
    for update;
  if v_total is null then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;

  if v_total < p_points then
    return json_build_object('ok', false, 'insufficient', true, 'balance', v_total);
  end if;

  v_new_total := v_total - p_points;
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
    values (p_student_id, -p_points, p_reason)
    returning id into v_log_id;

  update garden_students
    set total_points = v_new_total,
        current_stage = v_new_stage
    where id = p_student_id;

  return json_build_object(
    'ok', true,
    'log_id', v_log_id,
    'new_total', v_new_total,
    'new_stage', v_new_stage
  );
end;
$$;
