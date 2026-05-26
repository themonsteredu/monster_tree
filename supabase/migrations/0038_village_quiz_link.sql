-- ===============================================================
-- 0038: village_buildings 의 '퀴즈 오두막' 학생 라우트 갱신.
--
-- 0026 시드에서 link='/quiz' / is_ready=false 였던 것을
-- 학생용 퀴즈센터(/tree/quiz-center) 가 실제로 동작하므로
-- link='/quiz-center' / is_ready=true 로 변경한다.
--
-- (basePath 가 /tree 이므로 Next.js Link 가 자동으로 /tree 를 prefix 한다.)
-- ===============================================================

update public.village_buildings
   set link = '/quiz-center',
       is_ready = true,
       updated_at = now()
 where building_key = 'quiz';
