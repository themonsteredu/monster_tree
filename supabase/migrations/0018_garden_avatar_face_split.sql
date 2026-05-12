-- 아바타 표정 세분화: face 단일 필드 → eyes/mouth 쌍으로 분해.
-- 기존 4종(smile/neutral/surprised/wink) 값을 새 스키마로 변환 후 face 키 제거.
-- 액세서리(glasses/hat) 는 옵셔널이므로 별도 백필 불필요.

update public.garden_students
set avatar = (avatar - 'face')
  || case avatar->>'face'
       when 'smile'     then jsonb_build_object('eyes', 'dot',   'mouth', 'smile')
       when 'neutral'   then jsonb_build_object('eyes', 'dot',   'mouth', 'neutral')
       when 'surprised' then jsonb_build_object('eyes', 'round', 'mouth', 'oh')
       when 'wink'      then jsonb_build_object('eyes', 'wink',  'mouth', 'neutral')
       else                  jsonb_build_object('eyes', 'dot',   'mouth', 'smile')
     end
where avatar ? 'face';

alter table public.garden_students
  alter column avatar set default jsonb_build_object(
    'kind', 'human',
    'body', 'boy',
    'skin', 'light',
    'hair', 'short_brown',
    'eyes', 'dot',
    'mouth', 'smile',
    'top', 'hoodie_white',
    'bottom', 'shorts_green',
    'shoes', 'sneakers_brown'
  );
