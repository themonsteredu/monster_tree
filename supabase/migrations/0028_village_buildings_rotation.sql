-- 몬스터 마을 건물 회전 각도 컬럼.
-- 배경 픽셀아트가 약간 비스듬해서, 건물 이미지도 살짝 돌려 끼워 맞추고 싶을 때가 있다.
-- 단위: 도(°), 시계방향 +, 반시계 -. 범위 -180 ~ 180.

alter table public.village_buildings
  add column if not exists rotation numeric not null default 0
  check (rotation >= -360 and rotation <= 360);
