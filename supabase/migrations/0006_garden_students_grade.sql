-- ===============================================================
-- 0006: garden_students 에 학년(grade) 컬럼 추가
--
-- monster-site 의 학생 명단(app_data.branch_*.students[].grade) 에
-- 이미 존재하는 학년 값을, 발급/리셋 시 garden_students 에도 함께
-- 저장해 /tree/me 에서 표시할 수 있도록 한다.
-- ===============================================================

alter table public.garden_students
  add column if not exists grade text;
