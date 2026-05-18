-- 몬스터 마을 16:9 배경에 맞춰 건물 기본 위치/크기 재정렬.
-- 0026 의 시드는 9:16 세로 컨테이너 가정으로 잡혀 있었음. 컨테이너가 16:9 가로로 바뀌면서
-- 좌표를 6개 초록 사각형(타일) 위에 맞춰 재배치한다.
--
-- 6개 타일 배치 (이미지 좌표계 — 컨테이너 16:9 기준 %):
--   ┌──────────────────────────────────────────────────┐
--   │   [Plot1]        [Plot2]         [Plot3]         │
--   │           [Plot4]        [Plot5]        [Plot6]  │
--   └──────────────────────────────────────────────────┘
-- - 윗줄 (back row, y≈32%) : 사과정원(좌) / 퀴즈 오두막(중) / 몬스터 상점(우)
-- - 아랫줄 (front row, y≈58%): 건의 우체통(좌) / 게임센터(중) / (예비 자리)

update public.village_buildings
   set position_top = '30%',
       position_left = '8%',
       position_right = null,
       size = '17%',
       updated_at = now()
 where building_key = 'garden';

update public.village_buildings
   set position_top = '32%',
       position_left = '37%',
       position_right = null,
       size = '17%',
       updated_at = now()
 where building_key = 'quiz';

update public.village_buildings
   set position_top = '32%',
       position_left = '66%',
       position_right = null,
       size = '17%',
       updated_at = now()
 where building_key = 'shop';

update public.village_buildings
   set position_top = '55%',
       position_left = '20%',
       position_right = null,
       size = '17%',
       updated_at = now()
 where building_key = 'mailbox';

update public.village_buildings
   set position_top = '57%',
       position_left = '50%',
       position_right = null,
       size = '17%',
       updated_at = now()
 where building_key = 'game';
