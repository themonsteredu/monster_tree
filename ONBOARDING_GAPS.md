# ONBOARDING_GAPS.md — 신규 지점(branch) 개설 시 수동 입력이 필요한 데이터

> **점검 질문**: 신규 학원(지점)을 하나 만들 때 필요한 초기 데이터가 전부
> 마이그레이션 파일로 재현 가능한가?
>
> **결론: 아니다.** 지점을 만드는 행위 자체가 마이그레이션에 없고, 지점 개설 후
> 사람이 손으로 채워야만 동작하는 항목이 **13개** 있다.
> 그중 **5개는 빠뜨리면 화면이 비거나 기능이 조용히 죽는다**(§2 필수 항목).
>
> 애플리케이션 코드는 수정하지 않았다. 다만 §6 의 1·2번 제안은 이후 실제로 반영되어
> **마이그레이션 파일 2개가 새로 추가**되었다 (`monster-site/supabase/migrations/0000_legacy_core_tables.sql`,
> `monster_tree/supabase/migrations/0050_base_species.sql`). 검증 방법은 §5-1 참고.
> 함께 볼 것: `MODULES.md`(모듈 의존성), `monster_tree/HANDOFF.md`(과거 수동 적용 이력).
> 이 파일은 세 저장소에 같은 내용으로 들어 있다.

---

## 0. 먼저 — 두 가지 상황을 구분해야 한다

| | ① 기존 환경에 **지점 추가** | ② **새 환경**(새 Supabase 프로젝트) 구축 |
|---|---|---|
| 빈도 | 학원이 늘 때마다 | 사실상 1회 (재해복구·스테이징) |
| 마이그레이션으로 되나 | 애초에 지점 생성이 마이그레이션 대상이 아님 | **아니오 — 표 자체가 없는 것이 6개** |
| 이 문서의 범위 | §1 ~ §3 | §4 |

**중요한 구조적 사실**: monster_tree 의 콘텐츠 설정은 **거의 전부 전역(global)** 이다.
`village_buildings` · `village_settings` · `yard_settings` · `decoration_items` ·
`monster_species` · `monster_stage_images` · `garden_avatar_gallery` · `garden_tree_stages` ·
`quiz_questions` 어디에도 `branch_id` 컬럼이 없다.

- **좋은 점**: 지점을 추가해도 마을·몬스터·소품·퀴즈를 다시 만들 필요가 없다. 자동으로 상속된다.
- **주의할 점**: 지점별로 다른 마을을 꾸밀 수 없다. 한 지점에서 건물 이미지를 바꾸면 **전 지점에 반영**된다.

지점별로 갈라지는 tree 테이블은 `shop_settings`(지점 PK)와 `garden_admin_alerts` 둘뿐이다.

---

## 1. 지점 개설의 전체 순서 (현재 실제 동작)

```
[1] 지점 레코드 생성        monster-site /admin (브라우저)      ← 마이그레이션 없음
        ↓ app_data.admin_branches 에 {id:"br_"+Date.now(), name, ...} 추가
[2] 학생 등록               monster-site 지점 화면              ← 마이그레이션 없음
        ↓ app_data.branch_<id>.students[] 에 추가
[3] 계정 발급               /admin/student-auth                 ← API 는 있으나 사람이 눌러야 함
        ↓ student_credentials + class auth.users + tree garden_students
[4] 지점 라벨               /class/admin/permissions            ← 사람이 입력
        ↓ class branch_labels
[5] 어드민 지점 지정        /class/admin/permissions            ← 슈퍼어드민이 지정
        ↓ class students.branch_id
[6] 상점 오픈 기간          /tree/admin/shop                    ← 선택 (행 없으면 항상 열림)
[7] 로비 TV                 monster-site next.config.mjs 수정   ← 코드 변경 + 재배포 필요
```

**[1] 지점 생성은 순수 클라이언트 코드다.**
`components/MainDashboard.tsx:5150` 에서 브라우저가 `"br_" + Date.now()` 로 id 를 만들고
`app_data.admin_branches` blob 에 넣는다. 서버 API 도, 검증도, 마이그레이션도 없다.
→ 지점 id 는 **생성 시각에 의존**하므로 다른 환경에서 같은 id 를 재현할 수 없다.
→ 스테이징/복구 환경을 만들면 지점 id 가 달라지고, `branch_id` 를 참조하는 모든
   데이터(`garden_students` · `quiz_plays` · `shop_requests` · `class_logs` …)가 어긋난다.

---

## 2. ⚠️ 빠뜨리면 기능이 죽는 항목 (필수 5개)

### 2-1. 학생 계정 발급 — 안 하면 학생이 세 앱 어디에도 존재하지 않는다

- **무엇**: `student_credentials`(site) + `auth.users`/`students`(class) + `garden_students`(tree)
- **왜 수동인가**: `/api/student-issue` 라는 API 는 있지만, 원장이 `/admin/student-auth` 에서
  학생마다(또는 일괄) 버튼을 눌러야 실행된다. 지점 학생 등록만으로는 자동 발급되지 않는다.
- **빠뜨리면**: 학생이 로그인 불가, 사과나무 없음, TV 에 안 나옴, 강의실 진입 불가.
- **일괄 복구**: `/admin/student-auth` → "사과정원 일괄 동기화"(`/api/admin/sync-tree-branch`).
  단 이건 `garden_students` 만 채운다. 로그인 자격(`student_credentials`)은 발급 버튼이 따로 필요하다.

### 2-2. 퀴즈 문제 검수(승인) — 안 하면 학생 화면에 퀴즈가 0개

- **무엇**: `quiz_questions.is_approved = true`
- **왜 수동인가**: RLS 정책상 학생/anon 은 `is_approved = true AND is_active = true` 인 문제만
  SELECT 할 수 있다(`0037_quiz_center.sql:78`). 그런데 기본값이 `false` 다(`:28`).
  AI 대량 생성과 시드 스크립트(`scripts/seed-quiz.mjs`)는 전부 `is_approved=false` 로 넣는다.
- **빠뜨리면**: 퀴즈센터가 문제 0개로 보인다. 에러도 안 난다 — **조용히 빈 화면**.
- **예외**: 관리자가 `/tree/admin/quiz-center` 에서 폼으로 1개씩 직접 추가하거나
  엑셀/시트로 업로드한 문제는 `is_approved=true` 로 바로 저장된다.
- 지점 추가 시에는 이미 승인된 문제를 공유하므로 재작업 불필요 (전역 테이블).

### 2-3. 강의실 지점 라벨 + 어드민 지점 지정

- **무엇**: class `branch_labels`(지점 id ↔ 사람이 읽는 이름), class `students.branch_id`
- **왜 수동인가**: `branch_labels` 표는 `0014_student_branch.sql` 이 만들지만 **시드가 없다**.
  슈퍼어드민이 `/class/admin/permissions` 에서 직접 입력한다.
- **빠뜨리면**: 지점 이름 자리에 `br_1771825369381` 같은 원시 id 가 그대로 노출된다
  (`lib/branch-scope.ts` — 라벨 없으면 branch_id 그대로 표시).
  어드민 `branch_id` 를 안 정하면 그 어드민은 **전 지점 학생을 보게 된다**
  (전환기 호환 규칙 — `branch-scope.ts` 주석 참고).

### 2-4. 학생 지점 동기화 (미로그인 학생)

- **무엇**: class `students.branch_id`
- **왜 수동인가**: 평소엔 학생이 강의실에 로그인할 때 JWT 로 자동 채워진다
  (`lib/request-user.ts` 의 `syncBranchFromStudentJwt`). 하지만 **한 번도 로그인하지 않은
  학생은 영원히 NULL** 이다.
- **빠뜨리면**: 신규 지점 학생 전원이 "지점 미지정" 으로 보이고, 지점 어드민의 목록에서
  섞여 나온다.
- **복구**: monster-site `/admin/student-auth` → `/api/admin/backfill-class-branch`
  (`?dry=1` 로 미리보기 가능, 멱등).

### 2-5. 로비 TV 주소 — 지점이 2개 이상이면 코드 수정이 필요하다

- **무엇**: `monster-site/next.config.mjs` 의 `/tv` redirect
- **현재 상태**: 지점 id 가 **하드코딩**되어 있다.
  ```js
  { source: '/tv',
    destination: 'https://monster-tree.vercel.app/tree/tv?branch=br_1771825369381',
    permanent: false }
  ```
- **왜 수동인가**: 두 번째 지점의 TV 는 `/tv2` 를 새로 추가해야 한다
  (코드 주석에도 "지점이 늘어나면 /tv2 등으로 추가" 라고 적혀 있다).
  → **초기 데이터가 아니라 코드 변경 + 재배포**가 필요한 유일한 항목이다.
- **대안**: 안드로이드 박스에 전체 주소(`.../tree/tv?branch=br_xxx`)를 직접 입력하면
  코드 수정 없이 동작한다. 다만 rewrite 를 안 거쳐 속도만 확보한 원래 의도와는 달라진다.
- 참고: `monster_tree` 는 `BRANCH_ID` env 로도 TV 지점을 정할 수 있으나(`src/lib/branch.ts`),
  이건 **배포 단위 고정값**이라 한 배포에서 여러 지점 TV 를 띄우려면 `?branch=` 를 써야 한다.

---

## 3. 선택 항목 (없어도 동작하지만 기본값으로 떨어짐)

| # | 항목 | 어디서 | 안 하면 |
|---|---|---|---|
| 6 | 상점 오픈 기간 `shop_settings` | `/tree/admin/shop` | 행이 없으면 **항상 열림**(`shopOpenState()` 하위호환). 의도한 동작이면 그대로 둬도 됨 |
| 7 | 원장↔학번 연결 `ADMIN_LINKED_STUDENT_BY_EMAIL` | Vercel env | 새 원장 계정이 `/api/admin/enter-class` 로 강의실에 못 들어감 (500) |
| 8 | 원장 이메일 허용목록 `ADMIN_EMAILS` | Vercel env | ⚠️ 셋 다 비면 **인증된 아무 계정이나 원장 API 통과** (`verify-admin-token.ts` 의 잠금사고 방지 fallback) |
| 9 | 지점별 강사·시간표 | `/admin` 설정 메뉴 | 대시보드 위젯이 빈 상태 |
| 10 | 교재 마스터 `bookMaster` | `/admin` 교재 마스터 | 진도 입력 시 교재 선택지가 없음 |
| 11 | 강의실 강좌·차시 | `/class/admin/courses` | 학생 강의실이 빈 목록. **전역 공유**이므로 지점 추가 시엔 불필요 |
| 12 | 수강권 `enrollments` | `/class/admin/manage` | 학생이 강좌를 못 봄. `daily_plans` 배정으로도 시청 가능(대체 경로) |
| 13 | 몬스터 단계 이미지 | `/tree/admin/monsters` | `STAGE_FALLBACK_EMOJI` 로 대체 렌더 — 의도된 fallback |

---

## 4. 새 환경 구축 시의 추가 결함 (마이그레이션 자체가 없는 것)

지점 추가가 아니라 **Supabase 프로젝트를 새로 만들 때**만 문제가 되는 항목이다.
현재 운영 DB 에는 손으로 들어가 있어 눈에 띄지 않는다.

### 4-1. 🔴 monster-site: 핵심 표 6개가 마이그레이션에 아예 없다

`supabase/migrations/` 를 전부 실행해도 아래 표는 **생기지 않는다.**
저장소 어디에도 `create table` 문이 없다 (마이그레이션이 `0001_ai_comment_revisions` 부터
시작하는 것으로 보아, 그 이전에 대시보드에서 손으로 만든 표들이다).

| 표 | 정체 | 근거 |
|---|---|---|
| **`app_data`** | 지점·학생·진도·테스트·로드맵이 전부 들어있는 **중심 저장소** | `0004_rls_lockdown.sql:27` 이 `alter table public.app_data` 로 **이미 존재한다고 전제** |
| **`student_credentials`** | 세 저장소를 잇는 **유일한 매핑 표** | `0004:94` 가 동일하게 전제 |
| **`assessments`** | AI 시험 분석 결과 | `0004:46` 이 동일하게 전제 |
| `schedules` | 대시보드 시간표 위젯 | 전제조차 없음 — RLS 잠금 대상에서도 빠져 있다 |
| `todos` | 대시보드 할일 위젯 | 〃 |
| `calendar_events` | 대시보드 달력 | 〃 |

- **영향**: 새 환경에서 마이그레이션만 돌리면 **로그인 직후 대시보드가 통째로 깨진다.**
  `app_data` 가 없으면 지점 목록조차 못 읽는다.
- **실증**: 빈 PostgreSQL 16 에 `0001`~`0024` 를 순서대로 실행해 확인했다 —
  `0004_rls_lockdown.sql` 이 다음으로 죽는다:
  `ERROR: relation "public.app_data" does not exist`.
  즉 이 결함은 추정이 아니라 재현되는 사실이다.
- **✅ 해소됨**: `0000_legacy_core_tables.sql` 이 추가되어 6개 표를 정식화했다.
  번호가 `0000` 인 이유는 이 표들이 모든 마이그레이션보다 앞서야 `0004` 가 통과하기 때문이다.
  추가 후 빈 DB 에서 `0000`~`0024` 전체 체인이 통과하는 것을 확인했다.
- **추가 위험**: `schedules`/`todos`/`calendar_events` 는 `0004_rls_lockdown.sql` 의
  잠금 대상에도 빠져 있다. 즉 **현재 운영 DB 에서 이 세 표의 RLS 상태가 코드로 확인되지 않는다.**
  (잠겨 있는지 anon 에 열려 있는지 저장소만 봐서는 알 수 없다 — 대시보드에서 직접 확인 필요.)
- monster-site 마이그레이션에는 **INSERT 문이 단 한 줄도 없다.** 시드가 전무하다.

### 4-2. 🔴 monster_tree: 기본 몬스터 5종이 마이그레이션에 없다

- `0049_more_species.sql` 은 **15종(display_order 6~20)만** 심는다.
- 원래의 5종(불꽃몬🔥·물결몬💧·새싹몬🌿·번개몬⚡·달빛몬🌙)은 파일 안 **주석에만 언급**되고
  실제 INSERT 가 없다. 운영 DB 에는 손으로 들어가 있다(`HANDOFF.md` §3-1 (C)).
- **영향**: 새 환경의 도감은 15종으로 시작하고 `display_order` 가 6부터 시작한다.
  (빈 DB 에 `0001`~`0049` 를 돌려 종이 정확히 15개인 것을 확인했다.)
- **✅ 해소됨**: `0050_base_species.sql` 이 추가되어 기본 5종(`display_order` 1~5)을 심고,
  `emoji` 를 `not null default '✨'` 로 맞춘다. 적용 후 20종 × 5단계 = 100 단계행이 된다.
- 다만 `monster_stage_images`(단계·EXP 0/70/190/380/630)는 0049 가 **존재하는 모든 종에 대해**
  채워주므로 이 부분은 재현된다.
  > (이전 커밋의 `monster_tree/MODULES.md` 에 "단계 EXP 시드가 마이그레이션 밖" 이라고 적었는데
  >  이는 부정확했다. 실제 결함은 "기본 5종 자체가 없다" 쪽이다. 같은 커밋에서 함께 바로잡았다.)

- **부수 불일치**: `emoji` 컬럼을 운영 DB 는 `not null default '✨'` 로,
  마이그레이션 0049 는 `text`(nullable, default 없음)로 만든다.
  `src/lib/types.ts:352` 는 `emoji: string`(non-null)으로 선언 → 새 환경에서 NULL 이 들어갈 수 있다.

### 4-3. 🟡 monster_tree: 더미 학생 10명이 `branch_id` NULL 로 들어간다

- `0001_init_garden.sql:86` 이 테스트용 학생 10명(김민지·박서준 …)을 심는다.
- `branch_id` 컬럼은 나중(`0003`)에 추가되므로 이 10명은 **전부 NULL** 이다.
- **영향**: 새 환경 TV/관리 화면에 정체불명의 학생이 섞인다.
  `/tree/admin/students` 에서 수동 삭제해야 한다 (README 도 "나중에 삭제 가능" 이라고만 안내).

### 4-4. 🟡 Storage 버킷 — tree 는 되고, site 는 안 된다

| 저장소 | 버킷 | 마이그레이션 |
|---|---|---|
| monster_tree | `avatars`(0019), `tree-stages`(0024), `village`(0026/0039), `decorations`(0030), `yard`(0032), `monsters`(0034) | ✅ 전부 자동 생성 |
| monster-site | **`test-papers`** (채점 답안·시험지 사진) | ❌ 없음 — 손으로 만들어야 함 |
| mathmaster | **`problem-photos`** (오답 사진) | ❌ 없음 (이 프로젝트는 마이그레이션 자체가 저장소에 없다) |

### 4-5. 🔴 최초 슈퍼어드민 — 부트스트랩 경로가 없다

- class `students.is_admin` / `is_super_admin` 은 기본값 `false`(`0002_dashboard.sql:11`).
- `students_prevent_self_promote` 트리거가 **service_role 이 아닌 모든 권한 변경을 거부**한다
  (`0002_dashboard.sql:118~122`).
- 즉 첫 슈퍼어드민은 **SQL Editor 또는 service_role 스크립트로 직접 UPDATE** 해야 한다.
  마이그레이션에도, 관리 화면에도 그 경로가 없다 (`/admin/permissions` 자체가 어드민 전용이라 닭-달걀).

### 4-6. 🟡 mathmaster 프로젝트는 스키마가 저장소에 없다

- `problems` · `wrong_problems` · `exam_papers` · `solution_logs` · `completions` · `ai_usage` 는
  별개 Supabase 프로젝트(`xgvfpgkyafmrkarzxwpn`)에 있고, **마이그레이션 파일이 어느 저장소에도 없다.**
- 새 환경에서 오답Master 를 재현하려면 기존 프로젝트에서 스키마를 직접 덤프해야 한다.

### 4-7. 환경변수 — 값이 없으면 기능이 조용히 꺼진다

| 변수 | 없으면 | 저장소 |
|---|---|---|
| `JWT_SECRET` (3개 저장소 동일값) | 학생이 `/tree/me`·`/class` 에서 전부 튕김 | 전부 |
| `SUPABASE_SERVICE_ROLE_KEY` | 포인트 적립·계정 발급 등 쓰기 전부 실패 | 전부 |
| `MONSTER_TREE_SUPABASE_URL` / `MONSTER_TREE_SERVICE_ROLE_KEY` | 사과정원 동기화·포인트 적립 500 | site |
| `MONSTER_CLASS_SUPABASE_URL` / `_ANON_KEY` / `_SERVICE_ROLE_KEY` | 강의실 SSO·로드맵 동기화 실패 | site |
| `ANTHROPIC_API_KEY` | AI 전 기능 정지 (분석·멘트·비서·서술형·퀴즈생성) | site, tree |
| `MONTHLY_BUDGET_KRW` | 예산 캡 판정 기준 소실 (`cost-tracker`) | site |
| `VAPID_*` 3종 | 웹푸시가 **조용히 비활성화**, "알림 켜기" 버튼도 숨음 | tree |
| `CRON_SECRET` | 매일 19:00 KST 미수령 알림 크론이 **잠긴 채 아무것도 안 함** | tree |
| `ADMIN_KEY` / `NEXT_PUBLIC_ADMIN_KEY` | tree 관리자 기본값 `garden2026` 로 폴백 | tree |
| `BRANCH_ID` | TV 가 지점 미지정 안내 화면 | tree |
| `VIMEO_ACCESS_TOKEN` | 강의 일괄 가져오기 불가 (수동 입력은 가능) | class |
| `SOLAPI_*` | 알림톡·SMS 발송 실패 (코드에 기본값 하드코딩되어 있음) | site |

> `monster-class` 와 `monster_tree` 는 `next.config.mjs` 에 **빌드 타임 필수 env 검증**이 있어
> 누락 시 배포가 실패한다. **monster-site 에는 이 검증이 없다** — 런타임에야 500 으로 드러난다.

---

## 5. 요약 — 수동 입력 항목 13개

**지점을 하나 추가할 때 (§1~§3)**

| # | 항목 | 필수 | 마이그레이션 |
|---|---|:---:|:---:|
| 1 | 지점 레코드 (`app_data.admin_branches`) | ✅ | ❌ 클라이언트 코드로만 생성 |
| 2 | 학생 명단 (`app_data.branch_<id>.students[]`) | ✅ | ❌ |
| 3 | 학생 계정 발급 (credentials + class + tree) | ✅ | ❌ API 는 있으나 사람이 실행 |
| 4 | 강의실 지점 라벨 (`branch_labels`) | ✅ | 표만 있음, 시드 없음 |
| 5 | 어드민 지점 지정 (`students.branch_id`) | ✅ | ❌ |
| 6 | 미로그인 학생 지점 백필 | ✅ | ❌ API 는 있으나 사람이 실행 |
| 7 | 로비 TV 주소 | 지점 2개↑ | ❌ **코드 수정 + 재배포** |
| 8 | 상점 오픈 기간 (`shop_settings`) | ⬜ | 없으면 항상 열림 |
| 9 | 원장 env 2종 (`ADMIN_LINKED_STUDENT_BY_EMAIL`, `ADMIN_EMAILS`) | 신규 원장 시 ✅ | ❌ |
| 10 | 강사·시간표 | ⬜ | ❌ |
| 11 | 교재 마스터 | ⬜ | ❌ |
| 12 | 강좌·차시 / 수강권 | 강의실 쓰면 ✅ | ❌ |
| 13 | 몬스터·나무·소품 이미지 | ⬜ | fallback 있음 |

**새 환경을 만들 때 추가로 (§4)** — 위 13개에 더해:
`app_data`·`student_credentials`·`assessments`·`schedules`·`todos`·`calendar_events` 표 생성 /
기본 몬스터 5종 / 더미 학생 10명 삭제 / `test-papers`·`problem-photos` 버킷 /
최초 슈퍼어드민 승격 / mathmaster 스키마 전체 / 퀴즈 문제 적재+승인

---

## 6. 개선 제안과 진행 상태

| # | 제안 | 상태 |
|---|---|---|
| 1 | 옛 핵심 표 6개 정식화 | ✅ **완료** — `monster-site/supabase/migrations/0000_legacy_core_tables.sql` |
| 2 | 기본 몬스터 5종 시드 + `emoji` 정합성 | ✅ **완료** — `monster_tree/supabase/migrations/0050_base_species.sql` |
| 3 | `test-papers` 버킷 생성 마이그레이션 | ⬜ 미착수 — tree 의 `0019`/`0026` 패턴을 그대로 따라 하면 된다 |
| 4 | 더미 학생 10명 시드 제거 또는 `branch_id` 명시 | ⬜ 미착수 — 새 환경 오염 방지 |
| 5 | 지점 생성을 서버 API 로 | ⬜ 미착수 — `br_<timestamp>` 클라이언트 생성 대신 서버가 발급하고 `branch_labels`(class) 행까지 한 번에 만들면 §1 의 [1]·[4] 가 한 단계로 합쳐진다 |
| 6 | `/tv` 를 `?branch=` 쿼리 기반으로 | ⬜ 미착수 — 지점이 늘 때마다 코드를 고치지 않아도 되게 |
| 7 | monster-site 에 빌드 타임 env 검증 추가 | ⬜ 미착수 — class·tree 의 `next.config.mjs` 패턴 이식 |

### 6-1. 완료된 두 마이그레이션이 하는 일

**`0000_legacy_core_tables.sql`** (monster-site)
- `app_data` · `student_credentials` · `assessments` · `schedules` · `todos` · `calendar_events`
  6개 표를 `create table if not exists` 로 정식화.
- 컬럼 정의는 **운영 DB 를 조회한 것이 아니라 코드에서 역산**했다
  (select 목록 / insert payload / TypeScript 행 타입 / PostgREST 필터).
  파일 머리말에 `information_schema` 로 대조하는 검증 쿼리를 넣어 두었다.
- `schedules`·`todos`·`calendar_events` 의 RLS 를 **처음으로 명시**한다.
  이 셋은 `0004_rls_lockdown.sql` 의 잠금 대상에서 빠져 있어 상태가 코드로 확인되지 않았다.
  → **운영 DB 에 적용하면 이 세 표만은 no-op 이 아니다.** 적용 후 대시보드 위젯을 확인할 것.
- `student_credentials` 의 UNIQUE 인덱스 2개는 그냥 만들지 않고 **중복 검사 후 건너뛴다**
  (아래 §6-2 참고).

**`0050_base_species.sql`** (monster_tree)
- 기본 5종(불꽃몬🔥·물결몬💧·새싹몬🌿·번개몬⚡·달빛몬🌙)을 `display_order` 1~5 로 심는다.
  **이름으로 존재를 확인**하므로 운영 DB 에서는 아무것도 추가되지 않는다.
- `monster_species.emoji` 를 `not null default '✨'` 로 맞춘다
  (`types.ts` 는 `emoji: string` 인데 `0049` 는 nullable 로 만들고,
   `/admin/monsters` 의 `createSpeciesAction` 은 emoji 를 넣지 않아 새 환경에서 NULL 이 들어간다).
- 단계 행이 없는 종에 5단계(EXP 0/70/190/380/630)를 채운다 — `0049` 의 마지막 블록과 같은 패턴.
- 기존 행의 emoji·설명·순서·`hide_name` 을 **덮어쓰지 않는다** (운영자 수정 존중).

### 6-2. 적용 전 알아둘 것 — 유일하게 위험한 지점

`student_credentials` 의 UNIQUE 인덱스는 표가 이미 있어도 **인덱스는 없을 수 있다.**
운영 DB 에 중복 행이 있으면 `create unique index` 가 실패한다. 실제로 재현했다:

```
ERROR: could not create unique index "student_credentials_branch_local_key"
DETAIL: Key (branch_id, student_local_id)=(br_..., 1) is duplicated.
```

그래서 그냥 만들지 않고 **중복이 있으면 건너뛰고 경고만** 남기도록 했다.
경고가 나오면 아래로 확인하고 정리한 뒤 파일을 다시 실행하면 된다.

```sql
select login_id, count(*) from public.student_credentials
 group by login_id having count(*) > 1;

select branch_id, student_local_id, count(*) from public.student_credentials
 group by branch_id, student_local_id having count(*) > 1;
```

보통 학번을 바꿔 재발급한 옛 행이 남아 있는 경우다. 최신 행만 남기면 된다.

> 참고: `monster_species.name` 에는 UNIQUE 제약이 없어 같은 이름의 종이 여러 개 존재할 수 있다.
> `0050` 은 이름으로 존재를 확인하므로 중복을 **늘리지는 않지만**, 이미 중복이 있다면
> 도감에 같은 종이 두 번 보인다. 필요하면 `/tree/admin/monsters` 에서 정리할 것.

### 6-3. 검증 방법 (실제로 돌려본 것)

로컬 PostgreSQL 16 에 Supabase 스텁(`anon`/`authenticated`/`service_role` 롤,
`auth`·`storage` 스키마, `supabase_realtime` publication)을 만들고 네 가지를 확인했다.

| 시나리오 | 결과 |
|---|---|
| 빈 DB 에 monster-site `0000`~`0024` 순서대로 | ✅ 전체 통과 (`0000` 없이는 `0004` 에서 실패) |
| 같은 체인을 **두 번** 실행 (멱등성) | ✅ 통과 |
| 표가 이미 있고 정의가 다른 "운영 흉내" DB 에 `0000` | ✅ 오류 없음, 행 수·값·손으로 만든 컬럼 모두 보존 |
| `student_credentials` 에 중복 행이 있는 DB 에 `0000` | ✅ 실패하지 않고 경고 후 계속 |
| 빈 DB 에 monster_tree `0001`~`0050` 순서대로 | ✅ 전체 통과 → 20종 × 5단계 = 100행, `emoji` NULL 0건 |
| 5종이 이미 있고 원장이 수정해 둔 DB 에 `0050` | ✅ 종 수 그대로(20), 수정한 emoji·설명·`hide_name` 보존 |

**다만 진짜 운영 DB 로 검증한 것은 아니다.** 위는 코드에서 역산한 스키마를 재현한
로컬 DB 기준이다. 운영 적용 전에 `0000` 머리말의 `information_schema` 쿼리로
실제 컬럼 정의를 한 번 대조하기를 권한다.

### 6-4. 적용 순서 (권장)

1. Supabase 대시보드에서 **DB 백업을 1회 성공**시킨다 (`.github/workflows/db-backup.yml`).
2. 위 §6-2 의 중복 검사 쿼리를 먼저 돌려본다 (읽기 전용).
3. `information_schema` 대조 쿼리로 6개 표의 실제 정의를 확인한다 (읽기 전용).
4. 정의가 다르면 `0000` 을 실제 정의에 맞게 고친다. **운영 DB 를 파일에 맞추려 하지 말 것** —
   실데이터가 있는 쪽이 정답이다.
5. `0000` 을 SQL Editor 에서 실행한 뒤 **대시보드 위젯(시간표·할일·달력)** 을 확인한다.
   이 셋은 RLS 가 새로 걸리는 유일한 대상이다.
6. `0050` 을 monster_tree 프로젝트의 SQL Editor 에서 실행하고 `/tree/admin/monsters` 를 확인한다.
