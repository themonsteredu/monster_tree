-- 학생 아바타 리셋 기능 — avatar 컬럼을 NULL 로 되돌릴 수 있게 NOT NULL 제거.
-- 기존 데이터는 그대로 유지. 새로 들어오는 NULL = "아바타 미설정" → UI 에서
-- 아바타 안 그림 (MeTreeClient / TVScreen 모두 row.avatar 가 truthy 일 때만 렌더).

alter table public.garden_students
  alter column avatar drop not null;
