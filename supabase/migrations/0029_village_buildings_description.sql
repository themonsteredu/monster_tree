-- 몬스터 마을 건물 소개(말풍선 내용) 컬럼.
-- 학생 화면에서 hover/touch 시 건물 위에 말풍선으로 표시한다.
-- 빈 문자열이면 말풍선에 이름만 보여줌.

alter table public.village_buildings
  add column if not exists description text not null default '';

-- 기본 소개 문구 — 비어 있는 행에 한해 채워준다 (관리자 변경분 보존).
update public.village_buildings
   set description = '포인트로 사과를 따고 아바타를 꾸미는 너만의 정원'
 where building_key = 'garden' and description = '';

update public.village_buildings
   set description = '친구들과 풀어보는 깜짝 퀴즈 — 곧 오픈!'
 where building_key = 'quiz' and description = '';

update public.village_buildings
   set description = '사과로 아이템을 사는 몬스터 상점 — 곧 오픈!'
 where building_key = 'shop' and description = '';

update public.village_buildings
   set description = '선생님께 익명으로 의견을 보낼 수 있어 — 곧 오픈!'
 where building_key = 'mailbox' and description = '';

update public.village_buildings
   set description = '쉬는 시간에 즐기는 미니 게임 — 곧 오픈!'
 where building_key = 'game' and description = '';
