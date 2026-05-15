-- "나의 한마디" 기분 전광판.
-- 학생이 자유 텍스트로 현재 기분/상태를 입력하면
-- /me 씬 하단, TV 카드, 관리자 그리드에 표시된다.

alter table public.garden_students
  add column if not exists mood_text text not null default '';

alter table public.garden_students
  add column if not exists mood_updated_at timestamptz;
