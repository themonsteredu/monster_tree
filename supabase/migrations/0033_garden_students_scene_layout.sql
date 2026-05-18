-- 마이룸 씬 레이아웃 — 학생별 나무 / 아바타 위치·크기 저장.
-- null 이면 기본 위치(코드 상 DEFAULT_SCENE_LAYOUT) 적용.
-- 형식: { "tree": {"x": n, "y": n, "width": n}, "avatar": {"x": n, "y": n, "width": n} }
--   * x, y: 컨테이너 너비/높이 대비 % (0~100)
--   * width: cqmin (짧은 변) 대비 % (3~80)

alter table public.garden_students
  add column if not exists scene_layout jsonb;
