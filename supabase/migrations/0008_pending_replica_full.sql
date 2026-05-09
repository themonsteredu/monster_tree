-- ===============================================================
-- 0008: garden_pending_points REPLICA IDENTITY FULL
--
-- Postgres 의 기본값(DEFAULT)은 DELETE 시 PK 만 logical replication 으로 보낸다.
-- 이 때문에 Supabase Realtime 의 DELETE 이벤트 필터 (student_id=eq.X) 가
-- 매칭하지 못해 받기 후 클라이언트가 카드 제거 알림을 못 받는 문제가 있었다.
--
-- FULL 로 바꾸면 모든 컬럼이 OLD 레코드로 함께 전송되어 student_id 필터가 동작한다.
-- ===============================================================

alter table public.garden_pending_points replica identity full;
