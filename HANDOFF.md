# 인수인계서 — 몬스터마을 게임센터 / 도감 / 퀴즈 통합

> 통합 브랜치: **`claude/tender-wright-5niRX`** → **`main` 에 머지 완료** (이후 배포 기준은 `main`)
> 저장소: `themonsteredu/monster_tree` (= 사과정원 sap, basePath `/tree`, garden.themonster.kr)

---

## 0. 가장 먼저 할 일 (TL;DR)

1. **Vercel에서 `main` 최신 배포를 Production으로 Promote** (통합 브랜치는 `main`에 머지됨)
   → 안 하면 학생 폰에 게임센터/도감/퀴즈가 안 보임 (현재 production은 옛 perf 브랜치).
2. **DB 마이그레이션 적용 확인** (§3) — 안 돼 있으면 해당 페이지가 런타임 에러.
3. **`ANTHROPIC_API_KEY` 환경변수 확인** (퀴즈 AI 문제생성용).
4. **퀴즈 문제 검수(승인)** (§3-2) — 안 하면 학생에게 문제가 0개로 보임.
5. 학생 계정으로 폰에서 게임센터 / 도감 / 퀴즈 동작 확인.

---

## 1. 왜 통합했나 (사고 경위)

세 개의 feature 브랜치가 **서로 머지되지 않은 채** 각자 production으로 promote되어,
나중에 올린 게 앞엣것을 덮어쓰는 사고가 반복됨:

| 브랜치 | 기능 |
|---|---|
| `claude/tender-wright-5niRX` | 게임센터 + 몬스터도감 (+ 랜덤 알/진화 축하) |
| `claude/eager-ritchie-2y1nG` | 퀴즈센터 (학생/관리자 + AI 문제생성) |
| `claude/notification-talk-send-error-e8Abw` | 저사양 폰 성능개선 (blur 제거 등) |

→ perf 브랜치가 마지막에 promote되면서 게임센터/도감/퀴즈가 production에서 사라진 것처럼 보임.
**작업물은 git에 모두 살아있었음** (브랜치별로 분산돼 있었을 뿐).

**조치:** 세 브랜치를 `claude/tender-wright-5niRX` 하나로 머지 (충돌 없음, typecheck 통과).
이제 이 브랜치에 네 기능이 전부 들어있음.

**앞으로의 규칙:** production 배포는 **이 통합 브랜치 하나에서만**. 새 작업도 이 브랜치에서
분기 → 다시 이 브랜치로 머지. (또는 이 브랜치를 main에 머지하고 main 배포 체계로 전환.)

---

## 2. 빌드된 기능 + 경로

### 게임센터 (학생: `/me/game-center`)
- 허브: 몬스터알 진행바, 게임 카드 2개(각자 오늘 횟수), 게임별 랭킹 탭
- **무한의 계단** `/me/game-center/infinite-stairs`
  - 좌/우 탭 + 키보드 ←→, 목숨 3, 하루 3판, 콤보, BGM(Web Audio 칩튠), 계단 스크롤 애니메이션
- **스카이 슈터** `/me/game-center/sky-shooter`
  - 드래그/키보드 이동, 자동 발사, 적👾(+2)/동전🪙(+1)/폭탄💣(-1목숨), 목숨 3, 하루 3판
- 점수의 10% = EXP(최소1) → 활성 몬스터알 `current_exp` 누적 → 단계 진화
- 게임별 월간 랭킹 (`game_rankings`, game_type 별)

### 몬스터도감 (학생: `/me/collection`)
- 활성 종 3열 그리드, 수집(컬러+이름+획득일) / 미수집(실루엣+???+🔒)
- 카드 탭 → 상세 모달 ("N번째로 키운 몬스터", 획득일)
- `/me` 하단에 "📖 몬스터도감" 링크

### 알/진화 (학생: `/me/onboarding`)
- 종 선택 없이 **서버가 랜덤 배정** (`startRandomEggAction`) — 닉네임만 입력
- 알 단계(1~4) 동안 종 숨김(`hide_name`), 5단계 진화 시 onboarding에서 "🎉 OO몬 발견" 축하
- 기존 수동 선택(`SelectEggClient`/`selectEggAction`)은 후방호환 위해 보존(미사용)

### 퀴즈센터 (학생: `/quiz-center`, 관리자: `/admin/quiz-center`)
- 일 1회 3문제, 올클 시 포인트 적립 / 관리자 AI 문제생성 (claude-opus-4-7)
- ※ eager-ritchie 작업물. 이번 통합으로 함께 포함됨.

### 관리자 미리보기 (학생 화면 그대로, DB 영향 없음 — 테스트 모드)
- `/admin/game-center-preview` (+ `/infinite-stairs`, `/sky-shooter`)
- `/admin/collection-preview` (`?student=<id>` 로 특정 학생 도감)
- `/admin/quiz-center-preview`
- `/admin/monsters` 상단에 "📖 도감 미리보기" 링크

---

## 3. DB 마이그레이션 / 환경변수 (반드시 확인)

### 3-1. 게임센터 — ⚠️ 마이그레이션 **파일 없음**, SQL Editor에서 수동 적용했음
초기에 "SQL을 메시지로만 출력" 방침이라 `supabase/migrations/`에 파일이 없음.
production DB엔 이미 적용돼 있음(게임이 동작했으므로). **새 환경 구축 시 아래를 직접 실행해야 함:**

```sql
-- (A) 게임 기록/랭킹 + 일일 횟수 RPC + 마을 게임센터 링크
create table if not exists public.game_plays ( /* id, student_id→garden_students,
  branch_id, game_type default 'infinite_stairs', score, exp_earned, played_at */ );
create table if not exists public.game_rankings ( /* ... unique(student_id,game_type,month) */ );
create or replace function public.get_today_play_count(p_student_id uuid, p_game_type text) ... ; -- KST
update public.village_buildings set link='/me/game-center', is_ready=true where building_key='game';
-- (전체 SQL 은 세션 로그의 "0037" 블록 참조)

-- (B) 몬스터 단계 EXP 임계값 (누적 0/70/190/380/630)
update public.monster_stage_images set required_exp = 0   where stage = 1;
update public.monster_stage_images set required_exp = 70  where stage = 2;
update public.monster_stage_images set required_exp = 190 where stage = 3;
update public.monster_stage_images set required_exp = 380 where stage = 4;
update public.monster_stage_images set required_exp = 630 where stage = 5;

-- (C) 도감용 emoji 컬럼 + 기본 5종 + 단계 시드 (idempotent DO 블록 — 세션 로그 참조)
alter table public.monster_species add column if not exists emoji text not null default '✨';
-- 5종: 불꽃몬🔥 / 물결몬💧 / 새싹몬🌿 / 번개몬⚡ / 달빛몬🌙
```
> **TODO 권장:** 위 SQL을 정식 마이그레이션 파일(`0039_game_center.sql` 등)로 커밋해
> 다른 환경에서도 재현 가능하게 만들기. (현재는 production DB에만 손으로 들어가 있음.)

### 3-2. 퀴즈센터 — "내가 뭘 해야 하나" 체크리스트

순서대로 하면 학생에게 퀴즈가 보임. (1~3은 환경 세팅, 4가 **가장 자주 빼먹는 단계**.)

**(1) 마이그레이션 적용** — `supabase/migrations/`
- `0037_quiz_center.sql` → `quiz_questions`, `quiz_plays`, RPC `get_today_quiz_count`, RLS
- `0038_village_quiz_link.sql` → 마을 '퀴즈 오두막' 링크를 `/quiz-center` + `is_ready=true` 로 갱신
- ⚠️ 퀴즈가 이전에 production에 올라간 적 있어 **아마 이미 적용됨**. promote 전에 Supabase에서 두 테이블 존재 여부 확인.
- ※ 게임센터 수동 SQL(§3-1)을 "0037"로 칭했지만 파일은 아님 → 퀴즈 0037 파일과 **번호만 겹침, 충돌 아님**.

**(2) 환경변수** `ANTHROPIC_API_KEY`
- Vercel Project Settings → `/admin/quiz-center` 의 **AI 대량 생성** 버튼에 필요 (서버 전용).
- 시드 스크립트(아래 3번)를 로컬에서 돌릴 땐 `.env.local` 에도 필요.
- 모델: **`claude-opus-4-7`** (Messages API 직접 호출, SDK 미사용 — `src/app/admin/quiz-center/actions.ts`).

**(3) (선택) 초기 문제 시드** — `scripts/seed-quiz.mjs`
- 실행: repo 루트에서 `npm install` (1회) → `npm run seed:quiz`
- 생성량: 수학 7학년×20 = 140, 상식(all) 30, 넌센스(all) 30 → **총 200문제**
- 필요 env(`.env.local`): `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- 결과: 전부 `is_approved=false` (검수 대기) 로 적재 → **그대로면 학생에게 안 보임.** 4번 필수.

**(4) ⚠️ 문제 검수(승인) — 빼먹으면 학생 화면 퀴즈 0개**
- RLS 정책상 학생/anon 은 `is_approved=true AND is_active=true` 문제만 SELECT 가능.
- 시드·AI 대량 생성 문제는 **`is_approved=false`** 로 들어감 → 관리자가 `/admin/quiz-center`
  에서 검수 큐를 보고 **승인(approve)** 해야 학생에게 노출됨.
- 예외: 관리자가 폼으로 **직접 1개씩 추가**한 문제는 `is_approved=true` 로 바로 저장됨.
- 카테고리/학년: `math`(학년별 `elementary_3`~`middle_3`) / `general`(all) / `nonsense`(all).

**(5) 동작 규칙 메모**
- 학생: 하루 1회, 3문제. 올클(3/3) 시 사과포인트 1점 → `garden_pending_points` 에 행 추가(승인제).
- 오늘 푼 횟수: RPC `get_today_quiz_count` (KST 기준).
- 관리자 미리보기: `/admin/quiz-center-preview` (DB 영향 없는 테스트 모드).

### 3-3. 환경변수 (Vercel Project Settings)
- 기존 필수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_KEY`, `JWT_SECRET`
- 퀴즈 추가: **`ANTHROPIC_API_KEY`** (AI 문제생성)

---

## 4. 데이터 모델 메모

- 몬스터 알/도감은 **기존 `student_monsters` 재사용** (`monster_eggs`/`monster_collection` 별도 테이블 안 만듦)
  - `is_evolved=false` = 키우는 알, `is_evolved=true` = 도감 등재
  - 종 마스터 = `monster_species`, 단계 이미지/EXP = `monster_stage_images`
- 게임: `game_plays`(판 기록), `game_rankings`(월간 베스트, game_type별)
- 일일 횟수 한도 = `DAILY_PLAY_LIMIT` (`src/lib/types.ts`), 현재 **3판** (게임당 독립)
- 단계 이미지(`image_url`)는 **선택사항** — 없으면 `STAGE_FALLBACK_EMOJI` 자동 표시
  (admin이 `/admin/monsters`에서 단계별 이미지 업로드하면 그게 우선)

---

## 5. 코드 구조 / 규칙 (CLAUDE.md 에도 기록됨)

- **학생 기능 추가 시 admin 미리보기 동반 필수** — `/admin/<feature>-preview` + `adminMode` prop
  + 🛠 테스트 모드 뱃지 + DB 영향 없음 (서버 액션 스킵).
- 그라데이션 텍스트(`background-clip:text`)는 모바일에서 흐려짐 → 솔리드 + `text-shadow`.
- `"use client"` 모듈에서 non-component 값(배열/객체) export 금지 — 서버 컴포넌트가
  import 시 런타임 에러. 카탈로그/타입은 server-safe 모듈로 분리
  (예: `src/app/me/game-center/games.ts`).
- 게임 BGM/효과음: `src/app/me/game-center/bgm.ts` (Web Audio, 외부 음원 없음).
- 성능: 학생 화면 상시 노출 요소에 `backdrop-blur` 쓰지 말 것 (저사양 폰 스크롤 끊김 원인).

---

## 6. 남은 일 / 추천

- [x] **이 통합 브랜치를 `main`에 머지** — 이후 배포는 main 기준으로 일원화 (완료)
- [ ] **`main` → Production promote** (필수, Vercel에서 수동)
- [ ] 퀴즈 마이그레이션 0037/0038 + `ANTHROPIC_API_KEY` 적용 확인 (§3-2)
- [ ] **퀴즈 문제 검수(승인)** — 시드 200문제는 `is_approved=false` 라 승인 전엔 학생에게 안 보임 (§3-2-4)
- [ ] 게임센터 수동 SQL을 정식 마이그레이션 파일로 커밋 (§3-1 TODO)
- [ ] 게임 밸런스 검수: 하루 3판/목숨3/스폰속도/콤보 임계 등 실제 플레이로 튜닝
- [ ] 몬스터 단계별 이미지 업로드 (현재 이모지 fallback) — `/admin/monsters`
