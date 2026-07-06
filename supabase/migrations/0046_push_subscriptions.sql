-- 0046: garden_push_subscriptions — 웹 푸시 구독 (미수령 포인트 리마인더)
--
-- 학생이 /me 에서 "🔔 알림 켜기" 를 누르면 브라우저 PushSubscription 이
-- 이 테이블에 저장된다. 발송은 서버(web-push + VAPID)에서만:
--   1) /admin "미수령 알림 보내기" 버튼 (지점 스코프)
--   2) (선택) Vercel Cron → /api/push-pending
-- 만료된 구독(엔드포인트 410/404 응답)은 발송 시 자동 삭제된다.
--
-- endpoint 는 브라우저가 발급하는 고유 URL 이라 unique 키로 사용.
-- 같은 학생이 여러 기기에서 켜면 기기 수만큼 행이 생긴다 (정상).

create table if not exists public.garden_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists garden_push_subscriptions_student_idx
  on public.garden_push_subscriptions (student_id);

-- RLS: 정책 없음 = anon/authenticated 접근 불가. 서버(service-role) 전용.
alter table public.garden_push_subscriptions enable row level security;
