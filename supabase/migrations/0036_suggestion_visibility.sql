-- 건의글 가시성 — 다른 학생도 본문을 볼 수 있는 'public' 과
-- 관리자에게만 보이는 'private' 두 가지.
-- 기본값은 public (기존 글들은 다 공개로 처리).

alter table garden_suggestions
  add column if not exists visibility text not null default 'public';

alter table garden_suggestions
  drop constraint if exists garden_suggestions_visibility_check;

alter table garden_suggestions
  add constraint garden_suggestions_visibility_check
  check (visibility in ('public', 'private'));

create index if not exists garden_suggestions_visibility_idx
  on garden_suggestions(visibility);
