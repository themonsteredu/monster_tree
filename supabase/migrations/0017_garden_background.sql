-- 학생 배경 꾸미기 — me 페이지 + TV 스포트라이트 동기화.
-- 단색 / 패턴 / 풍경 세 종류. 디폴트는 따뜻한 크림.

alter table public.garden_students
  add column if not exists background jsonb not null default jsonb_build_object(
    'kind', 'solid',
    'color', 'cream'
  );
