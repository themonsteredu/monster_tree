-- ===============================================================
-- 0005: garden_students_branch_external_idx 를 partial → 일반 unique 로 교체
--
-- 문제:
--   0003 에서 만든 partial unique 인덱스는 WHERE 절을 갖고 있어,
--   INSERT ... ON CONFLICT (branch_id, external_student_id) 구문이
--   매칭되는 제약을 찾지 못해 실패한다.
--
--   에러: "there is no unique or exclusion constraint matching the
--   ON CONFLICT specification"
--
-- 영향:
--   monster-site 가 학생 계정 발급/리셋 시 monster_tree 의 garden_students
--   에 upsert 하는 sync 가 매번 실패해, 학생이 /tree/me 로 가면 "아직
--   나무가 심어지지 않았어요" 메시지가 떴다.
--
-- 해결:
--   WHERE 절이 없는 일반 unique 인덱스로 교체. 더미 학생들의 (null, null)
--   행은 Postgres 의 NULL distinct 동작으로 그대로 허용된다.
-- ===============================================================

drop index if exists public.garden_students_branch_external_idx;

create unique index garden_students_branch_external_idx
  on public.garden_students (branch_id, external_student_id);
