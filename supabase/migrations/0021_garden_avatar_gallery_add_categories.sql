-- 아바타 갤러리 카테고리에 bottom(하의), shoes(신발) 추가.
-- 0020 의 check 제약을 새 값까지 허용하도록 교체.

alter table garden_avatar_gallery
  drop constraint if exists garden_avatar_gallery_category_check;

alter table garden_avatar_gallery
  add constraint garden_avatar_gallery_category_check
  check (category in ('base', 'outfit', 'bottom', 'shoes', 'hat', 'accessory'));
