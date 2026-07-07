-- 0047: shop_settings — 상점(포인트 대리구매) 오픈 기간 설정 (지점별).
--
-- 원장이 /admin/shop 에서 지점별로 상점을 열고 닫는다:
--   mode='always' : 항상 열림 (기존 동작 — 행이 없어도 동일)
--   mode='window' : open_from ~ open_until 사이에만 신청 가능
--   mode='closed' : 닫힘
-- 학생 /shop 은 닫힘 상태면 신청 폼을 잠그고 안내 배너를 보여주며,
-- 서버 액션(submitShopRequestAction)에서도 재검증해 우회를 막는다.
-- 오픈 공지 푸시는 garden_push_subscriptions(0046) 를 재사용.

create table if not exists public.shop_settings (
  branch_id  text primary key,
  mode       text not null default 'always'
             check (mode in ('always', 'window', 'closed')),
  open_from  timestamptz,
  open_until timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS: 정책 없음 = anon/authenticated 접근 불가. 조회/저장 모두 서버(service-role).
alter table public.shop_settings enable row level security;
