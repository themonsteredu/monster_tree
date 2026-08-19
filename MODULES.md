# MODULES.md — 모듈 의존성 지도

> 저장소 3개(monster-site / monster-class / monster_tree)로 이루어진 더몬스터학원 시스템의
> 기능별 데이터 흐름 지도. 각 기능마다 **(1) 만드는 데이터 (2) 필요한 데이터 (3) 다른 기능을
> 직접 호출하는 곳** 을 정리했다.
> 이 파일은 **monster_tree** 판이다 — §0·§3 은 세 저장소 공통, §1·§2 가 이 저장소 전용.
>
> 문서 전용 파일이며 코드는 일절 수정하지 않았다.

## 0. 시스템 전체 지도

더몬스터학원 서비스는 **저장소 3개 + Supabase 프로젝트 4개**로 이루어져 있다.
학생·학부모에게는 `themonster.kr` 한 도메인으로 보이지만, 실제로는 monster-site 가
앞단에서 나머지 둘을 rewrite 로 프록시한다.

```
                        브라우저 (www.themonster.kr)
                                  │
                    ┌─────────────┴─────────────┐
                    │        monster-site        │  ← 유일한 공개 진입점
                    │  (원장 대시보드 · 로그인)   │     Vercel: themonster.kr
                    └──┬──────────────────────┬──┘
       rewrite /class/*│                      │rewrite /tree/*
                       ▼                      ▼
            ┌──────────────────┐   ┌────────────────────┐
            │  monster-class   │   │    monster_tree    │
            │ 강의실(LMS·영상) │   │ 몬스터마을(게임화)  │
            │ basePath /class  │   │  basePath /tree    │
            └──────────────────┘   └────────────────────┘
```

- rewrite 정의: `monster-site/next.config.mjs`
  → `/tree/*` = `monster-tree.vercel.app/tree/*`, `/class/*` = `monster-class.vercel.app/class/*`
- 예외: `themonster.kr/tv` 는 rewrite 를 거치지 않고 monster_tree 로 **직접 redirect**
  (로비 TV 속도 확보용, `?branch=` 고정).

### Supabase 프로젝트 4개 (서로 다른 DB — 조인 불가)

| 프로젝트 | 주인 | 대표 테이블 |
|---|---|---|
| site (`nbxwtsxeqwsblbggvxsk`) | monster-site | `app_data`, `student_credentials`, `assessments`, `submissions`/`gradings`, `notices`, `class_logs`, `essay_*`, `api_usage_logs` |
| class | monster-class | `students`, `courses`/`lessons`, `progress`, `study_logs`, `roadmaps` |
| tree | monster_tree | `garden_students`, `garden_point_logs`, `student_monsters`, `village_buildings`, `quiz_questions` |
| mathmaster (`xgvfpgkyafmrkarzxwpn`) | monster-site 의 오답Master 화면 | `problems`, `wrong_problems`, `exam_papers`, `ai_usage` |

> **핵심 제약**: 프로젝트가 갈라져 있어 **SQL 조인이 불가능**하다.
> 저장소를 넘는 데이터 연결은 전부 "코드로 잇는 키 매칭"이며, 그 키는 아래 3개뿐이다.

### 저장소를 잇는 3개의 키

| 키 | 발급처 | 쓰는 곳 |
|---|---|---|
| `branch_id` (`br_<timestamp>`) | monster-site `app_data.admin_branches` | 세 앱 전부의 지점 스코프 |
| `student_local_id` (지점 내 정수 id) | monster-site `app_data.branch_<id>.students[].id` | tree `garden_students.external_student_id` |
| `login_id` (학번) | monster-site `student_credentials.login_id` | class `students.student_id`, class auth 이메일 `<학번>@monsterclass.local` |

`student_credentials` (site 프로젝트) 가 이 셋을 한 행에 묶는 **유일한 매핑 테이블**이다.
여기에 행이 없으면 학생은 강의실·사과정원 어느 쪽에도 존재하지 않는다.

### 인증 3종

| 방식 | 쿠키/토큰 | 검증하는 곳 |
|---|---|---|
| 학생 | `monster_student` JWT (Domain `.themonster.kr`, 30일) | 세 앱 전부. **`JWT_SECRET` 이 3개 저장소에서 동일해야 함** |
| 원장(site) | Supabase Auth 세션 + `ADMIN_EMAILS` 허용목록 | `monster-site/lib/verify-admin-token.ts` |
| 원장(tree) | `garden_admin_key` 쿠키 = `ADMIN_KEY` 단순 비교 | `monster_tree/src/app/admin/auth.ts` |

- 학생 JWT 는 **monster-site 만 sign** 한다 (`/api/student-login`, `/api/admin/enter-class`).
  class·tree 는 verify 전용.
- 원장이 강의실에 들어갈 때는 `/api/admin/enter-class` 가 magiclink 로
  monster-class 의 `sb-*` 세션 쿠키까지 대신 구워준다 (SSO).

### 저장소 간 직접 호출 (전부 monster-site → 바깥 방향)

| 호출자 | 대상 | 수단 |
|---|---|---|
| `/api/admin/sync-tree-branch` | tree `garden_students` | service_role upsert |
| `/api/admin/award-garden-points` | tree RPC `garden_award_external` | service_role rpc |
| `/api/student-issue` | class auth + tree `garden_students` | service_role |
| `/api/admin/sync-class-roadmap` | class `roadmaps`/`roadmap_cells` | service_role replace |
| `/api/admin/enter-class` | class auth (magiclink) | service_role |
| `/api/admin/class-student-cleanup` | class `students` 삭제 | service_role |
| `/api/admin/backfill-class-branch` | class `students.branch_id` | service_role |

**역방향(class/tree → site) 직접 호출은 없다.** class·tree 는 자기 DB 와
학생 JWT 만 보고 동작한다. 유일한 예외는 링크 이동
(`monster_tree/src/lib/monster-site.ts` 의 `getMonsterSiteUrl()`).

---

## 1. monster_tree 모듈 지도

각 기능을 세 가지로 정리한다.
**만드는 데이터** = 이 기능만 쓰는 곳 / **필요한 데이터** = 없으면 동작 안 하는 선행 조건 /
**직접 호출** = 다른 기능의 코드·액션을 실제로 부르는 지점.

### 1-0. 이 저장소의 구조 원칙

- **basePath `/tree`** — monster-site 가 rewrite 로 프록시. `NextResponse.redirect` 는
  basePath 를 자동으로 붙이지 않으므로 `/tree/...` 를 명시해야 한다 (`admin/handoff/route.ts` 참고).
- **인증 2종**: 학생 = `monster_student` JWT (`middleware.ts` 가 `/me/**` 만 보호) /
  관리자 = `garden_admin_key` 쿠키 = `ADMIN_KEY` 단순 비교 (`src/app/admin/auth.ts`).
  `/`(TV), `/tv`, `/quiz-center`, `/shop`, `/admin/**` 은 미들웨어 matcher 밖이다.
- **모든 쓰기는 `createSupabaseServiceClient()`(service_role)** — RLS 우회.
  소유권은 JWT 의 학생과 대상 row 의 `student_id` 가 일치하는지 서버가 직접 검증한다.
- **학생 화면을 만들면 관리자 미리보기를 반드시 함께 만든다** (`CLAUDE.md` 규칙).
  `/admin/<feature>-preview` + 학생 컴포넌트에 `adminMode` prop + DB 영향 없음.
- **`"use client"` 모듈에서 non-component 값을 export 하지 않는다** — 서버 컴포넌트가
  import 하면 런타임 에러. 카탈로그/타입은 server-safe 모듈로 분리
  (예: `src/app/me/game-center/games.ts`, `src/lib/types.ts`).
- **상수는 `src/lib/types.ts` 한 곳에 중앙화** — 단계 임계값, 일일 한도, 라벨, 포인트 환산 등.

### 1-1. 지점(branch) 해석 — 모든 화면의 스코프

`src/lib/branch.ts` 가 지점 ID 를 세 경로로 해석한다.

| 화면 | 출처 |
|---|---|
| TV (`/`, `/tv`) | `process.env.BRANCH_ID` (배포별 고정) 또는 `?branch=` |
| 관리자 (`/admin/**`) | `garden_admin_branch` 쿠키 |
| 학생 (`/me/**`) | `monster_student` JWT 의 `branchId` |

**`/admin/handoff` (`src/app/admin/handoff/route.ts`)**
- monster-site 의 "몬스터마을" 메뉴가 `?branch=br_xxx&name=계림점` 으로 들어오는 진입점
- 만드는 데이터: `garden_admin_branch` / `garden_admin_branch_name` 쿠키 → `/tree/admin` 리다이렉트
- 왜 Route Handler 인가: Next.js 14 는 Server Component 에서 `cookies().set()` 을 금지한다 (500 발생)

---

### 1-2. 포인트 경제 — 이 저장소의 심장

**모든 포인트는 `garden_pending_points`(미수령 대기열)를 거쳐 학생이 "받기" 를 눌러야 확정된다.**
이 대기열이 시스템 전체에서 가장 많은 기능이 모이는 지점이다.

```
 [생산자 3종]                            [대기열]                [확정]
 ① 관리자 수동 적립                                          garden_claim_pending RPC
    admin/actions.ts                                                  │
    addPointsAction / Bulk ────┐                                      ▼
 ② 퀴즈 올클(3/3) +1pt         ├──> garden_pending_points ──> garden_point_logs
    quiz-center/actions.ts ────┤         (받기 대기)          + garden_students
 ③ monster-site 수업노트 점수  │                                .total_points
    RPC garden_award_external ─┘                                .current_stage
```

**생산자 ① 관리자 수동 적립 (`src/app/admin/actions.ts`)**
- 만드는 데이터: `garden_pending_points` 행
- 필요한 데이터: `isAdminAuthenticated()`, 지점 쿠키, `garden_students` 행
- 직접 호출: `garden_award_pending_bulk` RPC(일괄), `sendPendingPointsPushAction`(웹푸시 알림)

**생산자 ② 퀴즈센터 (`src/app/quiz-center/actions.ts`)**
- 만드는 데이터: `quiz_plays`(문제 id·답·정답수), 올클 시 `garden_pending_points` +1pt
- 필요한 데이터: 학생 JWT, **`is_approved=true AND is_active=true` 인 `quiz_questions`**
  (RLS 정책이 이렇게 걸려 있어 미승인 문제는 학생에게 0개로 보인다 — 가장 자주 빠뜨리는 단계),
  RPC `get_today_quiz_count`(KST 기준 하루 1회 판정)
- 출제 규칙: 학생 학년 + 최근 풀이 제외 + 카테고리 mix 로 3문제
- 관리자 테스트 모드(`adminMode`)에서는 `quiz_plays`·pending 둘 다 저장하지 않는다

**생산자 ③ monster-site 수업노트 (RPC `garden_award_external`, 마이그레이션 0044)**
- 만드는 데이터: `garden_external_awards`(중복 방지 장부) + `garden_pending_points`
- 필요한 데이터: `garden_students.external_student_id` 매핑, service_role
- 멱등 키: `source_key = site-note:{branchId}:{localId}:{date}:{daily|monthly}`.
  점수 정정 시 **차액만** 추가 pending 을 만든다
- ⚠️ `garden_external_awards` 는 **RLS 정책이 아예 없다** = anon/authenticated 접근 불가, service_role 전용

**소비자 — 받기 (`src/app/me/actions.ts` `claimPointAction`)**
- 만드는 데이터: `garden_point_logs` 행 + `garden_students.total_points`/`current_stage` 갱신
- 필요한 데이터: 학생 JWT, pending 행
- RPC `garden_claim_pending` 이 한 트랜잭션으로 처리. 같은 pending 두 번 호출은 no-op(`already_claimed`)

**단계 계산 (`src/lib/garden.ts`)**
- `STAGE_TABLE` 8단계 누적 임계값: 0 / 10 / 30 / 70 / 130 / 200 / 280 / 380
- 이 표가 **단일 소스**. `calculateStage()` 외의 곳에서 단계를 다시 계산하지 말 것

**수확 (`harvestStudentAction` → RPC `garden_harvest_student`)**
- 만드는 데이터: `garden_harvests` 행, `garden_students` 의 `total_points`/`current_stage` 리셋
- `apples_harvested` 는 트리거(0010)가 자동 반영하므로 RPC 는 건드리지 않는다

**되돌리기/리셋**
- `undoLogAction` → RPC `garden_undo_log`(적용된 로그 취소), `cancelPendingAction`(대기열 취소)
- `resetSemesterAction` → RPC `garden_reset_semester`(지점 스코프).
  pending 은 전체 삭제, **`garden_point_logs`·`garden_harvests` 는 보존**

---

### 1-3. 몬스터 알 / 도감 (student_monsters)

별도 표를 만들지 않고 **`student_monsters` 한 표를 `is_evolved` 로 나눠 쓴다.**
`is_evolved=false` = 지금 키우는 알(학생당 1마리) / `true` = 도감 등재 완료.

**온보딩 `/me/onboarding` (`src/app/me/actions.ts`)**
- 만드는 데이터: `student_monsters` 행 (`startRandomEggAction` — 서버가 종을 랜덤 배정, 닉네임만 입력)
- 필요한 데이터: `monster_species`(활성 종), `monster_stage_images`(단계별 EXP·이미지)
- 구 수동 선택(`selectEggAction`/`SelectEggClient`)은 후방호환용으로 보존만 되어 있다(미사용)

**EXP → 진화**
- 누적 EXP 임계값(`MONSTER_STAGE_DEFAULTS`): 0 / 70 / 190 / 380 / 630 (5단계)
- 알 단계(1~4)에는 `hide_name` 으로 종 이름을 가리고, 5단계 진화 시 공개
- `image_url` 은 선택 — 없으면 `STAGE_FALLBACK_EMOJI` 로 렌더

**도감 `/me/collection`**
- 만드는 데이터: 없음 (읽기 전용)
- 필요한 데이터: `student_monsters(is_evolved=true)` + `monster_species`

**도감 마일스톤 알림 (`src/lib/collection-alerts.ts`)**
- 만드는 데이터: `garden_admin_alerts` (기준 7종·20종 도달 시 각 1회, unique 인덱스가 중복 차단)
- 호출되는 곳 **두 군데** — `is_evolved` 를 true 로 바꾸는 모든 경로:
  `src/app/me/game-center/actions.ts`, `src/app/me/page.tsx`(자동 부화 캐치업)
- 전부 try/catch 로 감싸 실패해도 본 기능(게임 기록·진화)을 막지 않는다

**관리 `/admin/monsters`** — 만드는 데이터: `monster_species`, `monster_stage_images`(이미지 업로드)

---

### 1-4. 게임센터 (`/me/game-center`)

- 카탈로그: `src/app/me/game-center/games.ts` (server-safe — 서버 컴포넌트가 import 함)
  - 무한의 계단 `infinite_stairs` / 스카이 슈터 `sky_shooter` / 블록 수학 퀘스트 `math_adventure`
- 만드는 데이터: `game_plays`(판 기록), `game_rankings`(student×game×month UNIQUE 월간 베스트),
  그리고 **활성 몬스터의 `current_exp`/`current_stage` 갱신**
- 필요한 데이터: 학생 JWT, `garden_students` 행, **`is_evolved=false` 인 활성 몬스터**
  (없으면 `no_monster` 로 거부 — 온보딩이 선행되어야 함), RPC `get_today_play_count`(KST)
- 서버 검증(`src/app/me/game-center/actions.ts`):
  - 일일 한도 `DAILY_PLAY_LIMIT = 3` (게임당 독립)
  - 점수 상한 `MAX_REASONABLE_SCORE` — 계단 2000 / 슈터 20000 / 수학 5000, 초과 시 거부
  - EXP = `score × 0.1`, 최소 1 / 최대 200
- 직접 호출: `maybeRecordCollectionMilestone()` (진화 완료 시)
- BGM/효과음은 `bgm.ts` 의 Web Audio 칩튠 — 외부 음원 파일 없음
- 스키마: `0042_game_center.sql` 이 `game_plays`·`game_rankings`·RPC `get_today_play_count`·RLS·
  마을 게임센터 링크까지 전부 담고 있다 (`HANDOFF.md` §3-1 의 "마이그레이션 파일 없음" TODO 는 해소됨).
- ⚠️ 몬스터 쪽 시드는 `0049_more_species.sql` 이 종 15종 + **존재하는 모든 종의 단계 행**
  (EXP 0/70/190/380/630)을 채운다. 다만 **기본 5종(불꽃몬·물결몬·새싹몬·번개몬·달빛몬)의
  INSERT 는 어느 마이그레이션에도 없다** — 파일 주석에만 언급되고 운영 DB 에는 손으로 들어가 있다.
  새 환경에서는 도감이 15종·`display_order` 6부터로 시작한다
  (자세한 내용은 `monster-site/ONBOARDING_GAPS.md` §4-2).

---

### 1-5. 마을 (village) — 학생 화면의 허브

- 만드는 데이터: `village_settings`(배경 1장·시즌), `village_buildings`(건물별 이미지·위치·회전·설명·`link`·`is_ready`)
- 필요한 데이터: 없음(전역 설정, 지점 무관) / 관리는 `isAdminAuthenticated()`
- 기본 건물 5동 (`building_key` → 현재 `link`):

  | key | 이름 | 시드(0026) | 현재 link | 열어준 마이그레이션 |
  |---|---|---|---|---|
  | `garden` | 사과정원 | `/me` | `/me` | 0026 (처음부터 `is_ready`) |
  | `quiz` | 퀴즈 오두막 | `/quiz` | `/quiz-center` | 0038 |
  | `shop` | 몬스터 상점 | `/shop` | `/shop` | 0041 (`is_ready` 만 전환) |
  | `mailbox` | 건의 우체통 | `/suggest` | `/suggest` | 0035~0036 |
  | `game` | 게임센터 | `/game` | `/me/game-center` | 0042 |
- **건물이 곧 라우팅** — 새 학생 기능을 만들면 해당 `building_key` 의 `link` 와 `is_ready` 를
  갱신해야 마을에서 들어갈 수 있다 (마이그레이션 0038·게임센터 SQL 이 하는 일이 이것)
- 관리자 미리보기 `/admin/village-preview` 의 `previewLinkOverrides` 에도 새 건물을 연결해야
  관리자가 학생 화면을 그대로 볼 수 있다 (`CLAUDE.md` 규칙)

---

### 1-6. 마이룸 꾸미기 (아바타 / 마당 / 배경 / 날씨 / 기분)

`src/features/garden/*` 에 모여 있다. 전부 학생 개인 데이터.

| 기능 | 만드는 데이터 | 필요한 데이터 |
|---|---|---|
| 아바타 | `garden_students.avatar`(JSON `AvatarConfig`), Storage `avatars` 버킷 | `garden_avatar_gallery` 아이템, 유료 아이템은 `garden_avatar_ownership` |
| 아바타 갤러리(관리) | `garden_avatar_gallery`(카테고리·이미지·position·`price`·`is_style_ref`) | `isAdminAuthenticated()` |
| 마당 소품 | `student_decorations`(보유), `student_yard_layout`(배치 x/y/크기/회전/z) | `decoration_items` 마스터 |
| 마당 배경 | `yard_settings`(전역 1행) | 관리자 업로드 |
| 씬 배치 | `garden_students.scene_layout`(나무·아바타·몬스터 위치) | — |
| 배경 | `garden_students.background`(`BackgroundConfig`) | — |
| 날씨 | `student_weather_setting` | — |
| 기분 한마디 | `garden_students.mood_text` (최대 30자) | — |

- 구매 경로: `buyAvatarItemAction` / `buyDecorationAction` — `price>0` 이면 포인트 차감,
  `price=0` 이면 전원 무료(기존 동작 유지)
- AI 아이템 생성: `generateAvatarItemAction` → OpenAI 이미지 API (`OPENAI_API_KEY`),
  `is_style_ref=true` 인 갤러리 아이템을 스타일 기준으로 사용
- 배경 제거: `src/lib/image/removeBackground.ts`

---

### 1-7. 건의함 (`/me/suggest`, `/admin/suggest`)

- 만드는 데이터: `garden_suggestions`(카테고리·공개여부·상태·답변),
  `garden_suggestion_reactions`(학생당 글당 1개), `garden_suggestion_blocks`(차단)
- 필요한 데이터: 학생 JWT, 차단되지 않았을 것
- **포인트를 지급하지 않는다** (구 `SUGGESTION_REWARD_POINTS` 는 제거됨 —
  "하고 싶은 말이 있을 때 쓰는 곳이지 포인트를 버는 곳이 아니다")
- `visibility`: `public`(다른 학생도 본문 열람) / `private`(관리자에게만, 다른 학생은 접힌 종이만)
- 학생 액션은 전부 service_role 이므로 **소유권은 JWT student ↔ row `student_id` 비교로 직접 검증**
- 답장 알림: `reply_seen` 플래그 → `src/app/me/NotifyBell.tsx`

---

### 1-8. 상점 (`/shop`, `/admin/shop`)

포인트로 실물을 대리구매 신청하는 기능. **상태 기계가 핵심이다.**

```
requested ──approve──> purchased ──> shipping ──> delivered
    │                      │             │
    └──────── canceled ────┴─────────────┘   (취소 시 차감분 환불)
```

- 만드는 데이터: `shop_requests`(링크·옵션·예상가격·`point_cost`·`status`·`point_log_id`)
- 필요한 데이터: 학생 JWT, `shop_settings` 의 오픈 기간(`shopOpenState()` 판정 — 행이 없으면 항상 열림)
- 환산: `POINT_TO_WON = 100` (1pt = 100원), `wonToPoints()` 는 **올림**
- **신청 시점에는 차감하지 않는다** — 잔액으로 막지 않고, 관리자 승인 시 확정 차감
- 승인 `approveShopRequestAction` → RPC **`garden_shop_deduct`**:
  잔액 부족이면 차감하지 않고 `ok=false` 로 거부(마이너스 방지), 성공 시 음수
  `garden_point_logs` 1행을 만들고 그 id 를 `point_log_id` 에 저장
- 취소 `cancelShopRequestAction` → 차감된 신청이면 `garden_undo_log` 로 포인트 복구
- 상태 전이 규칙은 `SHOP_NEXT_STATUS` (`src/lib/types.ts`) 한 곳에 정의

---

### 1-9. TV 화면 (`/`, `/tv`)

- 만드는 데이터: 없음 (읽기 전용)
- 필요한 데이터: `BRANCH_ID` env 또는 `?branch=`, `src/lib/tv-data.ts` 의 `loadTvData()` 가
  한 번에 모으는 것 — 학생·오늘 수확·나무 단계 이미지·마당 배경/소품/배치·날씨·활성 몬스터·도감·씬 배치
- 실시간: `useTvRealtime.ts` 가 `garden_point_logs` INSERT 를 구독해 +pt 를 3초 강조
- `themonster.kr/tv` 는 rewrite 를 거치지 않고 **직접 redirect** 로 들어온다 (속도 확보)

---

### 1-10. 실시간 구독 (Realtime)

| 훅 | 구독 대상 | 쓰는 화면 |
|---|---|---|
| `useStudentRealtime.ts` | `garden_point_logs` INSERT, `garden_pending_points` INSERT/DELETE (student 필터) | `/me` |
| `useTvRealtime.ts` | `garden_point_logs` INSERT | TV |
| `AdminClient.tsx` 내부 | `garden_point_logs` INSERT, `garden_pending_points` INSERT/DELETE | `/admin` |

⚠️ Supabase 대시보드 → Database → Replication 에서 해당 표가 켜져 있어야 동작한다.
꺼져 있으면 화면이 새로고침 전까지 갱신되지 않는다 (README "문제 해결" 참고).

---

### 1-11. 웹 푸시 (`src/lib/push.ts`)

- 만드는 데이터: `garden_push_subscriptions`(`savePushSubscriptionAction`), 만료 구독 자동 삭제
- 필요한 데이터: VAPID 키 3개. **없으면 기능 전체가 조용히 비활성화**되고 "알림 켜기" 버튼도 숨는다
- 발송 경로 2곳(같은 함수 공유):
  - `/admin` 의 "미수령 알림 보내기" → `sendPendingPointsPushAction` (지점 스코프)
  - Vercel Cron → `/tree/api/push-pending` (전 지점, `vercel.json` 매일 10:00 UTC = 19:00 KST)
    · `CRON_SECRET` 미설정 시 라우트가 잠긴 상태로 아무것도 하지 않는다
- 대상: `garden_pending_points` 가 있고 구독도 있는 학생 → **포인트 대기열과 직결**

---

### 1-12. 관리자 화면 공통 (`src/app/admin/nav.ts`, `AdminHeader.tsx`)

- `ADMIN_NAV` 한 곳에 메뉴를 정의하면 모든 관리 화면 상단에 동일하게 붙는다
- 새 관리 화면(`/admin/<feature>`, 미리보기 아님)을 만들면 **`ADMIN_NAV` 에 반드시 추가**한다.
  빼먹으면 어느 화면에서도 링크가 없어 URL 을 직접 쳐야만 들어갈 수 있다
  (실제로 마을 구성·상점·건의함이 그런 상태였다 — `CLAUDE.md`)
- 미리보기 화면(`/admin/*-preview`)에는 `AdminHeader` 를 붙이지 않는다 (학생 화면을 그대로 보여주는 게 목적)
- 현재 미리보기 목록: suggest / game-center(+infinite-stairs, sky-shooter, math-adventure) /
  collection / quiz-center / shop / village

---

### 1-13. monster_tree 의존성 요약 (한 장)

```
monster-site /api/student-issue ──> garden_students (branch_id, external_student_id)
                                          │  ← 이 행이 없으면 학생은 마을에 존재하지 않음
monster_student JWT ──> middleware(/me/**) │
                                          ▼
  ┌──────────── garden_pending_points ─────────────┐
  │  ① admin 수동  ② 퀴즈 올클  ③ site 수업노트    │
  └───────────────────┬────────────────────────────┘
                      │ claimPointAction (RPC garden_claim_pending)
                      ▼
        garden_point_logs + garden_students.total_points
                      │
      ┌───────────────┼────────────────┬──────────────┐
      ▼               ▼                ▼              ▼
  단계(garden.ts)  수확(harvest)   상점 차감      TV/실시간
                                (garden_shop_deduct)

student_monsters(is_evolved=false) ──게임 EXP──> 진화 ──> 도감 ──> garden_admin_alerts
village_buildings.link ──> 학생이 각 기능으로 들어가는 유일한 통로
```

---

## 2. 다른 저장소와의 연결 (monster_tree 관점)

**내가 남에게서 받는 것 (전부 monster-site 로부터)**
| 받는 것 | 경로 | 없으면 |
|---|---|---|
| `monster_student` JWT | 쿠키 (`JWT_SECRET` 공유) | `/me/**` 전부 로그인 페이지로 튕김 |
| `garden_students` 행 | site `/api/student-issue`(개별) 또는 `/api/admin/sync-tree-branch`(일괄) | 학생의 나무가 없음, TV 가 빈 화면 |
| `garden_pending_points` | site `/api/admin/award-garden-points` → RPC `garden_award_external` | 수업 점수 자동 적립 안 됨 |
| 지점 컨텍스트 | site 메뉴 → `/tree/admin/handoff?branch=&name=` | 관리자가 지점 선택을 직접 해야 함 |
| `branch_id` 값 자체 | site `app_data.admin_branches` | 지점 스코프가 맞지 않음 |

**내가 남에게 주는 것**
- RPC `garden_award_external` (site 가 호출하는 공개 계약 — 시그니처를 바꾸면 site 가 깨진다)
- `garden_students.external_student_id` 매핑 (site 가 학생 매칭에 사용)
- 학생 화면 자체 (`/tree/me`, `/tree/me/village` — site 의 학생 홈이 링크)
- 관리자 화면 (`/tree/admin/*` — site 의 AdminNav "몬스터마을" 그룹이 새 탭으로 링크)

**monster_tree → monster-site 로 나가는 코드 호출은 없다.**
`src/lib/monster-site.ts` 의 `getMonsterSiteUrl()` 이 만드는 **링크 이동**과,
미인증 시 `themonster.kr/login` 리다이렉트가 전부다.

**깨지면 생기는 일**
| 바뀌는 것 | 영향 |
|---|---|
| `JWT_SECRET` 불일치 | 학생이 `/tree/me` 진입 불가 (TV·관리자는 영향 없음) |
| RPC `garden_award_external` 시그니처 | site 수업노트의 포인트 자동 적립 중단 |
| `garden_students` 의 `(branch_id, external_student_id)` 유니크 | site 의 일괄 동기화 upsert 실패 |
| `basePath` 변경 | site 의 rewrite·`/tv` redirect·`vercel.json` cron 경로를 동시에 고쳐야 함 |
| `village_buildings.link` | 학생이 해당 기능으로 들어갈 통로가 사라짐 |
| `quiz_questions.is_approved` 정책 | 학생 퀴즈가 0문제로 보임 |

---

## 3. 다른 저장소 요약 (자세한 내용은 각 저장소의 MODULES.md)

### monster-site — 원장 대시보드 + 공개 진입점 (`themonster.kr`)
- 만드는 데이터: `app_data`(지점·학생·교재·진도·테스트·로드맵 통짜 blob),
  **`student_credentials`**(세 저장소를 잇는 유일한 매핑 표), `assessments`(AI 시험 분석),
  `submissions`/`gradings`(채점), `essay_*`(서술형), `notices`(공지·신청), `class_logs`,
  `api_usage_logs`(AI 요금), `secretary_conversations`/`student_memos`(몬스터비서)
- 필요한 데이터: 원장 Supabase 세션 + `ADMIN_EMAILS` 허용목록, `ANTHROPIC_API_KEY`
- monster_tree 로 나가는 호출: `/api/student-issue`, `/api/admin/sync-tree-branch`,
  `/api/admin/award-garden-points`

### monster-class — 강의실 (`/class`)
- 만드는 데이터: `students`, `courses`/`lessons`, `enrollments`, `progress`(영상 진도),
  `study_logs`/`study_activities`(학습일지), `weekly_study_plans`, `daily_plans`,
  `materials`/`exams`, `roadmaps`/`roadmap_cells`, `quiz_questions`/`quiz_attempts`,
  `parent_report_tokens`
- 필요한 데이터: `monster_student` JWT 또는 site 의 enter-class 가 구운 `sb-*` 세션
- **monster_tree 와 monster-class 사이에는 직접 연결이 없다.** 둘 다 monster-site 를 통해서만 이어진다.

---

## 4. 새 기능을 붙일 때 확인할 것

1. **학생용(`/me/*`) 화면인가?** → `/admin/<feature>-preview` 미리보기를 **반드시 함께** 만든다.
   `adminMode` prop + 🛠 테스트 모드 뱃지 + 서버 액션 스킵 + 일일 한도 무시 (`CLAUDE.md`).
   `/admin/village-preview` 의 `previewLinkOverrides` 에도 `building_key` 를 연결한다.
2. **새 관리 화면(`/admin/<feature>`)인가?** → `src/app/admin/nav.ts` 의 `ADMIN_NAV` 에 추가하고
   `<AdminHeader current="..." />` 를 쓴다. 빼먹으면 링크가 어디에도 없다.
3. **포인트를 주는가?** → `garden_point_logs` 에 직접 쓰지 말고
   `garden_pending_points` 에 넣어 학생이 "받기" 로 확정하게 한다 (기존 흐름 유지).
   차감은 반드시 RPC `garden_shop_deduct`(잔액 검증 포함)를 쓴다.
4. **상수를 추가하는가?** → `src/lib/types.ts` 에 중앙화한다 (단계 임계값·일일 한도·라벨·환산율).
5. **`"use client"` 모듈인가?** → non-component 값(배열·객체·함수)을 export 하지 않는다.
   서버 컴포넌트가 import 하면 런타임 에러. 카탈로그는 server-safe 모듈로 분리.
6. **새 표를 만드는가?** → `supabase/migrations/` 에 파일로 커밋한다.
   게임센터는 한동안 SQL Editor 로만 적용돼 새 환경에서 재현이 불가능했고,
   나중에 `0042_game_center.sql` 로 되살려야 했다. 시드 데이터도 같이 넣는다
   (`monster_stage_images` 의 EXP/이미지 시드는 아직 파일 밖에 있다).
7. **모바일 성능** — 학생 화면에 상시 노출되는 요소에 `backdrop-blur` 를 쓰지 않는다
   (저사양 폰 스크롤 끊김). 그라데이션 텍스트(`background-clip:text`) 대신 솔리드 + `text-shadow`.
