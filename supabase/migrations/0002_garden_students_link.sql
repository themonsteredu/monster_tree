-- monster-site 학생 자체 인증과 garden_students 를 연결하기 위한 컬럼 추가.
-- branch_id (text, monster-site 의 'br_<timestamp>') + external_student_id (int, app_data JSON 내부 students[].id)
-- (branch_id, external_student_id) 로 upsert 할 수 있도록 unique 제약 추가.

alter table public.garden_students
  add column if not exists branch_id text;

alter table public.garden_students
  add column if not exists external_student_id integer;

create unique index if not exists garden_students_branch_external_idx
  on public.garden_students (branch_id, external_student_id)
  where branch_id is not null and external_student_id is not null;
