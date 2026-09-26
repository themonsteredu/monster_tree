# 몬스터마을 사과정원 홍보영상

- `monster-village-promo.mp4` — 1920×1080, 30fps, 약 56초, 배경음악 + 하단 한국어 자막 포함
- 실제 앱 화면(로비 TV 사과정원, 선생님 휴대폰 포인트 적립, 숲속 마당 꾸미기, 게임센터·무한의 계단, 퀴즈 오두막, 몬스터도감·우리 광장)을 녹화해 자막과 함께 편집했습니다.
- 화면에 나오는 학생 이름·점수는 모두 **녹화용 가짜(더미) 데이터**입니다. 실제 학원 DB에는 접속하지 않았고, 실제 학생 정보는 들어 있지 않습니다.
- `monster-village-promo.srt` — 자막 파일 (유튜브 등에 따로 올릴 때 사용)
- `source/` — 다시 만들 때 쓰는 녹화·편집 스크립트 (앱 배포에는 포함되지 않음)
  - `mock-supabase.mjs` — 녹화 전용 가짜 DB 서버 (더미 학생 12명, 몬스터, 퀴즈 문제)
  - `rec.mjs` · `go2.mjs` — Playwright 로 실제 화면을 녹화 (관리자 미리보기 = 테스트 모드 화면 사용)
  - `compose.html` · `render.mjs` — 1920×1080 편집 화면을 프레임 단위로 렌더
  - `music.py` — 직접 합성한 배경음악 (저작권 걱정 없음)

## 다시 만드는 순서 (개발자용 메모)

1. `node source/mock-supabase.mjs` 로 가짜 DB 실행 (포트 54321)
2. 환경변수 `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `ADMIN_KEY=promo-key`, `BRANCH_ID=br_promo` 등을 넣고 `next build && next start`
3. `node go2.mjs <tv|admin|yard|gchub|stairs|sky|quiz|col|plaza>` 로 장면별 녹화 → `clips/`
4. 클립을 `frames/<이름>/00001.jpg…` 로 풀고, `public/block-world/forest-yard-v1.webp`(→ `forest-yard.jpg`)·`public/icons/monster-symbol.png` 을 `compose.html` 옆에 복사
5. `node render.mjs` → `out/` 프레임, `python3 music.py` → `music.wav`, ffmpeg 로 합쳐 mp4 완성
