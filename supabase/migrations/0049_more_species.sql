-- ============================================================================
-- 0049_more_species.sql — 몬스터 도감 20종으로 확충 (+15종 시드)
-- ============================================================================
-- 이 파일이 하는 일(비개발자용):
--   1) monster_species 에 emoji 칸을 보장한다 (운영 DB 에만 손으로 추가돼
--      있었고 마이그레이션 파일에는 없었다 — 여기서 정식으로 맞춘다).
--   2) 기존 5종(불꽃몬·물결몬·새싹몬·번개몬·달빛몬)에 더해 15종을 새로
--      심어 총 20종이 되게 한다. 이미 같은 이름이 있으면 건너뛴다.
--   3) 단계 이미지가 없는 종에는 기본 5단계(알→금간 알→부화→성장→완성체,
--      누적 EXP 0/70/190/380/630)를 채워 넣는다. 이미지는 비워 두면
--      화면에서 단계별 기본 이모지가 대신 나온다 — /admin/monsters 에서
--      나중에 이미지를 올리면 그쪽이 우선.
--   ※ 여러 번 실행해도 안전(idempotent).
-- ============================================================================

alter table public.monster_species add column if not exists emoji text;

-- 새 종 15종 (이름이 이미 있으면 건너뜀) — display_order 6~20
insert into public.monster_species (name, emoji, description, display_order)
select v.name, v.emoji, v.description, v.display_order
from (values
  ('바람몬',   '🌪️', '바람을 타고 다니는 장난꾸러기 몬스터', 6),
  ('얼음몬',   '❄️', '차가운 얼음 속에서 태어난 몬스터',     7),
  ('바위몬',   '🪨', '단단한 바위처럼 듬직한 몬스터',         8),
  ('별빛몬',   '⭐', '밤하늘 별빛을 모아 빛나는 몬스터',      9),
  ('무지개몬', '🌈', '비 갠 뒤 무지개에서 태어난 몬스터',    10),
  ('구름몬',   '☁️', '폭신폭신 구름 위에서 사는 몬스터',     11),
  ('화산몬',   '🌋', '뜨거운 용암 속에서 자란 몬스터',       12),
  ('파도몬',   '🌊', '넘실대는 파도를 몰고 다니는 몬스터',   13),
  ('눈꽃몬',   '⛄', '눈 내리는 날에만 나타나는 몬스터',     14),
  ('태양몬',   '☀️', '햇살처럼 따뜻한 마음의 몬스터',        15),
  ('숲속몬',   '🌲', '깊은 숲을 지키는 초록 몬스터',         16),
  ('사막몬',   '🌵', '메마른 사막에서도 씩씩한 몬스터',      17),
  ('우주몬',   '🪐', '먼 우주에서 날아온 신비한 몬스터',     18),
  ('천둥몬',   '⛈️', '우르릉 천둥소리와 함께 오는 몬스터',   19),
  ('꽃잎몬',   '🌸', '봄바람에 꽃잎처럼 흩날리는 몬스터',    20)
) as v(name, emoji, description, display_order)
where not exists (
  select 1 from public.monster_species s where s.name = v.name
);

-- 단계 행이 없는 종에 기본 5단계 채우기 (기존 종 포함 — 빠진 단계만)
insert into public.monster_stage_images (species_id, stage, stage_name, required_exp)
select s.id, d.stage, d.stage_name, d.required_exp
from public.monster_species s
cross join (values
  (1, '알',     0),
  (2, '금간 알', 70),
  (3, '부화',   190),
  (4, '성장',   380),
  (5, '완성체', 630)
) as d(stage, stage_name, required_exp)
where not exists (
  select 1 from public.monster_stage_images i
  where i.species_id = s.id and i.stage = d.stage
);
