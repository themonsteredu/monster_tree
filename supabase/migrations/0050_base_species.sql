-- ============================================================================
-- 0050_base_species.sql — 기본 몬스터 5종 시드 + emoji 컬럼 정합성
-- ============================================================================
-- 왜 필요한가 (ONBOARDING_GAPS.md §4-2):
--   0049_more_species.sql 은 15종(display_order 6~20)만 심는다.
--   원래의 5종 — 불꽃몬🔥 / 물결몬💧 / 새싹몬🌿 / 번개몬⚡ / 달빛몬🌙 — 은
--   0049 파일 **주석에만** 언급되고 실제 INSERT 가 어디에도 없다.
--   운영 DB 에는 손으로 들어가 있어(HANDOFF.md §3-1 (C)) 눈에 띄지 않았지만,
--   새 환경에서 마이그레이션만 돌리면 도감이 15종·display_order 6부터로 시작한다.
--
-- 함께 고치는 것 — emoji 컬럼 정의 불일치:
--   · 운영 DB   : emoji text not null default '✨'   (손으로 적용)
--   · 0049 파일 : emoji text                          (nullable, default 없음)
--   · types.ts  : emoji: string                       (non-null 로 선언)
--   즉 새 환경에서는 emoji 가 NULL 이 될 수 있는데 타입은 아니라고 말한다.
--   실제로 /admin/monsters 의 createSpeciesAction 은 emoji 를 넣지 않으므로
--   새 환경에서 관리자가 종을 추가하면 곧바로 NULL 이 들어간다.
--   여기서 운영 DB 기준(not null default '✨')으로 맞춘다.
--
-- 안전성:
--   · 전부 idempotent — 여러 번 실행해도 안전하다.
--   · 종은 **이름으로** 존재를 확인하고 없을 때만 넣는다 (0049 와 같은 패턴).
--     → 운영 DB 에는 5종이 이미 있으므로 아무것도 추가되지 않는다.
--   · 기존 행의 emoji / 설명 / 순서를 덮어쓰지 않는다.
--     (운영자가 /admin/monsters 에서 바꿔둔 값을 존중한다.)
--   · 빈 DB 에서 0034 → 0049 → 0050 순서로 돌려 검증했다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- ============================================================================


-- ===== 1) emoji 컬럼을 운영 DB 기준으로 정렬 =====
-- 0049 가 nullable 로 만들었을 수 있으니 먼저 채우고 제약을 건다.
alter table public.monster_species add column if not exists emoji text;

update public.monster_species
   set emoji = '✨'
 where emoji is null or btrim(emoji) = '';

alter table public.monster_species alter column emoji set default '✨';

do $$
begin
  -- 이미 not null 이면 아무 일도 일어나지 않는다.
  alter table public.monster_species alter column emoji set not null;
exception when others then
  raise warning 'monster_species.emoji 를 not null 로 바꾸지 못했습니다: %', sqlerrm;
end $$;


-- ===== 2) 기본 5종 시드 (이름이 이미 있으면 건너뜀) =====
-- display_order 1~5 — 0049 가 심는 15종(6~20)의 앞에 온다.
insert into public.monster_species (name, emoji, description, display_order)
select v.name, v.emoji, v.description, v.display_order
from (values
  ('불꽃몬', '🔥', '뜨거운 불꽃에서 태어난 몬스터',   1),
  ('물결몬', '💧', '맑은 물결을 타고 다니는 몬스터',  2),
  ('새싹몬', '🌿', '작은 새싹에서 자라난 몬스터',     3),
  ('번개몬', '⚡', '번쩍이는 번개를 품은 몬스터',     4),
  ('달빛몬', '🌙', '달빛을 받으며 자라는 몬스터',     5)
) as v(name, emoji, description, display_order)
where not exists (
  select 1 from public.monster_species s where s.name = v.name
);


-- ===== 3) 단계 행이 없는 종에 기본 5단계 채우기 =====
-- 0049 의 마지막 블록과 동일한 패턴. 방금 넣은 5종에 단계가 붙는다.
-- 누적 EXP 0 / 70 / 190 / 380 / 630 — src/lib/types.ts 의 MONSTER_STAGE_DEFAULTS 와 같다.
-- 이미지(image_url)는 비워 둔다 → 화면에서 STAGE_FALLBACK_EMOJI 가 대신 나오고,
-- /admin/monsters 에서 업로드하면 그쪽이 우선한다.
insert into public.monster_stage_images (species_id, stage, stage_name, required_exp)
select s.id, d.stage, d.stage_name, d.required_exp
from public.monster_species s
cross join (values
  (1, '알',      0),
  (2, '금간 알',  70),
  (3, '부화',    190),
  (4, '성장',    380),
  (5, '완성체',  630)
) as d(stage, stage_name, required_exp)
where not exists (
  select 1 from public.monster_stage_images i
  where i.species_id = s.id and i.stage = d.stage
);


-- ===== 4) 결과 확인용 (실행 후 눈으로 보라고 남겨둔다) =====
-- select display_order, name, emoji,
--        (select count(*) from public.monster_stage_images i where i.species_id = s.id) as stages
--   from public.monster_species s
--  order by display_order;
-- → 20종 / 각 5단계 가 나오면 정상.


-- ============================================================================
-- 롤백 (새 환경에서 이 파일이 넣은 것만 되돌릴 때. 운영 DB 에서는 실행 금지)
-- ============================================================================
--   delete from public.monster_stage_images
--    where species_id in (select id from public.monster_species
--                          where name in ('불꽃몬','물결몬','새싹몬','번개몬','달빛몬'));
--   delete from public.monster_species
--    where name in ('불꽃몬','물결몬','새싹몬','번개몬','달빛몬');
--   alter table public.monster_species alter column emoji drop not null;
--   alter table public.monster_species alter column emoji drop default;
-- ============================================================================
