-- 0045: 건의함 개선 + 아바타 획득 루프 기반
--
-- 1) garden_suggestion_reactions — 공개 건의글 공감 스티커 (학생당 글당 1개)
-- 2) garden_suggestions.reply_seen — "새 답장" 뱃지 (관리자 답장 시 false,
--    학생이 내 쪽지 확인 시 true)
-- 3) garden_avatar_gallery.price / is_style_ref — 아바타 아이템 가격(0=무료),
--    AI 생성 스타일 기준 이미지 플래그
-- 4) garden_avatar_ownership — 학생별 구매한 아바타 아이템 보유 장부
--    (마당 소품은 기존 student_decorations 를 그대로 사용)
--
-- 차감은 기존 garden_shop_deduct RPC(0040), 적립은 garden_award_external(0044)
-- 재사용 — 새 RPC 없음.

-- ============================================================
-- 1. 공감 스티커
-- ============================================================
create table if not exists public.garden_suggestion_reactions (
  suggestion_id uuid not null references public.garden_suggestions(id) on delete cascade,
  student_id    uuid not null references public.garden_students(id) on delete cascade,
  kind          text not null check (kind in ('heart', 'thumbs')),
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, student_id)
);

create index if not exists garden_suggestion_reactions_suggestion_idx
  on public.garden_suggestion_reactions (suggestion_id);

alter table public.garden_suggestion_reactions enable row level security;

drop policy if exists "garden_suggestion_reactions_read" on public.garden_suggestion_reactions;
create policy "garden_suggestion_reactions_read" on public.garden_suggestion_reactions
  for select using (true);
-- 쓰기는 service_role(서버 액션) 전용 — 기존 garden_* 패턴과 동일.

-- ============================================================
-- 2. 답장 확인 뱃지
-- ============================================================
alter table public.garden_suggestions
  add column if not exists reply_seen boolean not null default true;

-- 기존에 답장이 달려있던 글은 "이미 본 것"으로 간주 (default true 로 충족).

-- ============================================================
-- 3. 아바타 아이템 가격 / 스타일 기준
-- ============================================================
alter table public.garden_avatar_gallery
  add column if not exists price int not null default 0 check (price >= 0);

alter table public.garden_avatar_gallery
  add column if not exists is_style_ref boolean not null default false;

-- ============================================================
-- 4. 아바타 아이템 보유 장부
-- ============================================================
create table if not exists public.garden_avatar_ownership (
  student_id  uuid not null references public.garden_students(id) on delete cascade,
  gallery_id  uuid not null references public.garden_avatar_gallery(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (student_id, gallery_id)
);

create index if not exists garden_avatar_ownership_student_idx
  on public.garden_avatar_ownership (student_id);

alter table public.garden_avatar_ownership enable row level security;

drop policy if exists "garden_avatar_ownership_read" on public.garden_avatar_ownership;
create policy "garden_avatar_ownership_read" on public.garden_avatar_ownership
  for select using (true);
