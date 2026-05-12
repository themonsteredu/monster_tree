-- 아바타 갤러리에 hair(헤어), face(얼굴표정) 카테고리 추가.
-- 0021 의 check 제약을 새 값까지 허용하도록 교체.

alter table garden_avatar_gallery
  drop constraint if exists garden_avatar_gallery_category_check;

alter table garden_avatar_gallery
  add constraint garden_avatar_gallery_category_check
  check (category in ('base', 'outfit', 'bottom', 'shoes', 'hair', 'face', 'hat', 'accessory'));
