-- ===============================================================
-- 0041: 몬스터마을 '상점' 건물 오픈.
--
-- 0026 시드에서 link='/shop' / is_ready=false 였던 것을, 학생용 상점(/shop)이
-- 실제로 동작하므로 is_ready=true 로 전환한다. (basePath '/tree' 자동 prefix)
-- ===============================================================

update public.village_buildings
   set link = '/shop',
       is_ready = true,
       updated_at = now()
 where building_key = 'shop';
