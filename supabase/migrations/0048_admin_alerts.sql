-- ============================================================================
-- 0048_admin_alerts.sql — 관리자 알림함: 학생 도감 7종 달성 알림
-- ============================================================================
-- 이 파일이 하는 일(비개발자용):
--   학생이 게임센터에서 몬스터를 키워 도감(진화 완료 몬스터)을 7종 모으면
--   원장님이 볼 관리자 알림을 한 건 쌓는다. 알림은 /admin/collection-alerts
--   화면에서 확인하고 "읽음" 처리할 수 있다.
--
--   · 학생마다 같은 (종류, 기준) 알림은 한 번만 생긴다 — unique 인덱스로 보장.
--   · 알림 종류(type)를 칸으로 둔 이유: 나중에 "도감 10종", "전체 수집" 같은
--     다른 마일스톤도 이 표 하나로 쌓기 위해서다.
--
-- [보안정책(RLS)] 이 저장소 관례: 학생 개인 데이터 표는 RLS 켜고 정책 없음
--   = 서버(service_role)만 접근. 화면 접근 권한은 서버 액션의 ADMIN_KEY 로 검사.
-- ============================================================================

create table if not exists public.garden_admin_alerts (
  id         uuid primary key default gen_random_uuid(),
  branch_id  text not null,
  student_id uuid not null references public.garden_students (id) on delete cascade,
  type       text not null,                  -- 예: 'collection_milestone'
  threshold  int  not null,                  -- 예: 7 (도감 7종)
  payload    jsonb not null default '{}'::jsonb, -- 표시용 부가정보 (학생 이름 등)
  status     text not null default 'unread', -- unread | read
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

-- 같은 학생의 같은 마일스톤 알림은 1회만
create unique index if not exists garden_admin_alerts_once
  on public.garden_admin_alerts (student_id, type, threshold);

create index if not exists garden_admin_alerts_branch
  on public.garden_admin_alerts (branch_id, status, created_at desc);

alter table public.garden_admin_alerts enable row level security;
-- 정책 없음 = service_role 전용 (관례)
