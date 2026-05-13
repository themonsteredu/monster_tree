-- 갤러리 항목 position 컬럼에 DEFAULT 부여 + 기존 NULL 행 백필.
-- 0023 마이그레이션은 nullable 컬럼만 추가했음. 이번 마이그레이션은:
--   1) 신규 insert 가 자동으로 합리적 기본값을 갖도록 DEFAULT 지정.
--   2) 이미 존재하는 NULL 행에 카테고리별 기본값을 채워 학생 화면이 즉시
--      깨지지 않게 함.
--
-- DB 기본값은 캔버스 중앙, 100% 크기 — 카테고리 무관. 카테고리별 합리적
-- 시작점(예: 모자는 상단)은 클라이언트의 DEFAULT_ITEM_POSITION 에서 별도
-- 적용한다.

alter table garden_avatar_gallery
  alter column position set default '{"x": 50, "y": 50, "scale": 100}'::jsonb;

-- 카테고리별 기본 위치로 NULL 백필.
update garden_avatar_gallery
   set position = '{"x": 50, "y": 15, "scale": 45}'::jsonb
 where position is null and category = 'hat';

update garden_avatar_gallery
   set position = '{"x": 50, "y": 20, "scale": 50}'::jsonb
 where position is null and category = 'hair';

update garden_avatar_gallery
   set position = '{"x": 50, "y": 33, "scale": 35}'::jsonb
 where position is null and category = 'face';

update garden_avatar_gallery
   set position = '{"x": 50, "y": 33, "scale": 35}'::jsonb
 where position is null and category = 'accessory';

update garden_avatar_gallery
   set position = '{"x": 50, "y": 52, "scale": 50}'::jsonb
 where position is null and category = 'outfit';

update garden_avatar_gallery
   set position = '{"x": 50, "y": 70, "scale": 45}'::jsonb
 where position is null and category = 'bottom';

update garden_avatar_gallery
   set position = '{"x": 50, "y": 88, "scale": 35}'::jsonb
 where position is null and category = 'shoes';

-- base 는 항상 전체. 명시적 100% 로 백필 (렌더러는 base 의 position 을 무시
-- 하지만 데이터 일관성 위해).
update garden_avatar_gallery
   set position = '{"x": 50, "y": 50, "scale": 100}'::jsonb
 where position is null and category = 'base';
