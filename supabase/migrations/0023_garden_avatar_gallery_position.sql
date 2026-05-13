-- 갤러리 항목별 위치 메타데이터.
-- 관리자가 미세조정한 {x, y, scale} 을 보관해 학생 화면 렌더링이 카테고리 기본값
-- 대신 항목별 위치/크기로 레이어를 배치할 수 있게 한다.
--
-- 형태: { "x": 50, "y": 33, "scale": 60 }
--   x:     가로 중심 (%, 0~100, 50=가운데)
--   y:     세로 중심 (%, 0~100)
--   scale: 크기 (%, 30~200, 100=원본 비율 = container 에 contain)
--
-- null 이면 렌더러가 카테고리별 기본값 사용.

alter table garden_avatar_gallery
  add column if not exists position jsonb;
