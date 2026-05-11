-- 학생 아바타 꾸미기 — me 페이지(개인 사과정원) + TV 화면 동기화용.
-- 자유 구조 보존 위해 jsonb. 디폴트는 갈색 머리 후드 남학생.
-- kind 가 "human" 이면 part 슬롯 (skin/hair/face/top/bottom/shoes) 을 사용.
-- kind 가 "animal" 또는 "fantasy" 면 variant 한 개로 단일 프리셋.

alter table public.garden_students
  add column if not exists avatar jsonb not null default jsonb_build_object(
    'kind', 'human',
    'body', 'boy',
    'skin', 'light',
    'hair', 'short_brown',
    'face', 'smile',
    'top', 'hoodie_white',
    'bottom', 'shorts_green',
    'shoes', 'sneakers_brown'
  );

-- 진단용 인덱스는 두지 않음 (학생 조회는 항상 id/branch_id 로 함).
