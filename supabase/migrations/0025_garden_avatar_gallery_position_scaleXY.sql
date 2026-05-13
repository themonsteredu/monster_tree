-- position 메타데이터 확장 — scale 1개에서 scaleX/scaleY 2개로 분리 + zIndex 추가.
-- 기존 행은 scale 만 있는 형태이므로 그대로 두고 scaleX/scaleY 키만 추가 백필한다.
-- 레거시 scale 키는 보존 — 렌더러가 신규 필드 부재 시 fallback 으로 사용.
--
-- 결과 position 형태 예:
--   { "x": 50, "y": 15, "scale": 45, "scaleX": 45, "scaleY": 45 }
--   (scale 은 호환을 위해 잔존, scaleX/scaleY 가 우선)

-- DEFAULT 갱신 — 신규 row 는 scaleX/scaleY 100 으로.
alter table garden_avatar_gallery
  alter column position set default
    '{"x": 50, "y": 50, "scaleX": 100, "scaleY": 100}'::jsonb;

-- 기존 행 백필: scaleX 없는 행 + scale 있는 행 → scaleX = scaleY = scale.
update garden_avatar_gallery
   set position = position
                  || jsonb_build_object('scaleX', position->'scale')
                  || jsonb_build_object('scaleY', position->'scale')
 where position is not null
   and not (position ? 'scaleX')
   and (position ? 'scale');

-- scale 도 scaleX 도 없는 (이론상) 행 → scaleX = scaleY = 100 으로 안전 기본값.
update garden_avatar_gallery
   set position = position
                  || jsonb_build_object('scaleX', 100, 'scaleY', 100)
 where position is not null
   and not (position ? 'scaleX')
   and not (position ? 'scale');

-- 확인: 모든 active 행이 scaleX/scaleY 를 보유하는지.
-- select count(*) from garden_avatar_gallery where position is not null and not (position ? 'scaleX');
