# 🍎 사과정원 (Apple Garden)

더몬스터학원 학생 보상 시스템 - 동전 저금통을 사과나무 키우기로 게임화한 웹앱입니다.

- **원장 관리 화면 (모바일)**: `/admin` — 학생별 포인트를 빠르게 적립
- **로비 TV 화면 (가로 풀스크린)**: `/` — 모든 학생의 사과나무를 실시간 표시
- **학생 관리**: `/admin/students`
- **사과나무 8단계 미리보기**: `/test`

---

## 🛠 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Realtime)
- Pretendard 웹폰트
- 배포 대상: Vercel (`garden.themonster.kr`)

---

## 🚀 처음 한 번만 하면 되는 셋업 (양희쌤용)

### 1) 패키지 설치

터미널을 열고 (VS Code 의 `보기 → 터미널`) 아래 한 줄 입력:

```bash
npm install
```

> 시간이 1~2분 정도 걸려요. 줄줄이 글자가 올라가는 게 정상입니다.

### 2) Supabase 환경변수 채우기

프로젝트 루트(맨 위)에 있는 `.env.example` 파일을 복사해서 같은 위치에 **`.env.local`** 이라는 이름으로 새로 만드세요.

> macOS 터미널: `cp .env.example .env.local`
> Windows 명령 프롬프트: `copy .env.example .env.local`

`.env.local` 파일을 열고 아래 두 값을 채웁니다.

| 변수 | 어디서 찾나요? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 기존 themonster.kr 의 [Supabase 대시보드](https://supabase.com/dashboard) → 해당 프로젝트 → **Settings → API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 같은 페이지 → **Project API keys → anon / public** (public 라벨이 붙은 긴 문자열) |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 페이지 → **Project API keys → service_role** (⚠️ 절대 외부 공유 금지) |
| `ADMIN_KEY` / `NEXT_PUBLIC_ADMIN_KEY` | 원장 비밀번호 (예: `garden2026`). 두 줄 모두 같은 값으로 |

> ⚠️ `service_role` 키는 절대 다른 사람과 공유하거나 GitHub 에 올리지 마세요. `.env.local` 은 자동으로 git 에서 제외됩니다.

### 3) Supabase 테이블 만들기

[Supabase 대시보드](https://supabase.com/dashboard) → 해당 프로젝트 → **SQL Editor** 로 이동.

이 프로젝트의 `supabase/migrations/0001_init_garden.sql` 파일 내용을 **통째로 복사**해서 SQL Editor 에 붙여넣고 **Run** 을 누르세요.

> 이 파일은 `garden_` 접두사가 붙은 새 테이블 3개만 만듭니다. 기존 themonster.kr 의 테이블은 절대 건드리지 않아요.

생성되는 것:
- `garden_students` (학생 명단)
- `garden_point_logs` (포인트 적립 기록)
- `garden_harvests` (수확 기록 - Phase 2)
- 위 테이블의 RLS (anon 읽기 전용) + Realtime 활성화
- 더미 학생 10명 (테스트용 — 나중에 `/admin/students` 에서 삭제 가능)

### 4) 개발 서버 실행

```bash
npm run dev
```

브라우저에서:
- TV 화면: <http://localhost:3000>
- 관리자: <http://localhost:3000/admin> (비밀번호 입력)
- 8단계 미리보기: <http://localhost:3000/test>

---

## 🌐 배포 (Vercel)

1. GitHub 저장소를 Vercel 에 연결
2. 환경변수 4개 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_KEY`, `NEXT_PUBLIC_ADMIN_KEY`)를 Vercel 의 **Settings → Environment Variables** 에 등록
3. 도메인 연결: Vercel **Settings → Domains** 에 `garden.themonster.kr` 추가
4. Cloudflare(또는 도메인 DNS 관리처)에서 `garden` 서브도메인을 Vercel 의 안내대로 CNAME 추가

---

## 📂 폴더 구조

```
src/
├─ app/
│  ├─ page.tsx              # / : TV 화면 (서버 컴포넌트)
│  ├─ TVScreen.tsx          # / : TV 화면 클라이언트 로직 (Realtime)
│  ├─ test/page.tsx         # /test : 8단계 미리보기
│  └─ admin/
│     ├─ page.tsx           # /admin : 원장 입력 화면
│     ├─ AdminClient.tsx
│     ├─ LoginForm.tsx
│     ├─ auth.ts            # 비밀번호 보호 로직
│     ├─ actions.ts         # Server Actions (포인트/CRUD)
│     └─ students/
│        ├─ page.tsx        # /admin/students
│        └─ StudentsClient.tsx
├─ components/
│  └─ AppleTree.tsx         # 사과나무 SVG (8단계, size 옵션)
└─ lib/
   ├─ garden.ts             # 단계 계산 / 임계값
   ├─ types.ts              # garden_* 테이블 타입
   └─ supabase/
      ├─ browser.ts         # 브라우저용 클라이언트
      └─ server.ts          # 서버용 클라이언트 (anon / service_role)

supabase/
└─ migrations/0001_init_garden.sql
```

---

## 🌱 단계 시스템 한눈에 보기

| 단계 | 이름 | 누적 포인트 |
|:---:|:---:|:---:|
| 1 | 화분 | 0 |
| 2 | 씨앗 | 10 |
| 3 | 새싹 | 30 |
| 4 | 어린나무 | 70 |
| 5 | 큰나무 | 130 |
| 6 | 꽃나무 | 200 |
| 7 | 열매 | 280 |
| 8 | 수확! | 380 |

(원본 기획서의 §6 표와 동일. 코드에서는 `src/lib/garden.ts` 의 `STAGE_TABLE` 한 곳에서 관리합니다.)

---

## 🐛 문제 해결

### "Supabase 환경변수가 비어 있어요" 메시지가 뜰 때
→ `.env.local` 을 만들었는지, `npm run dev` 를 다시 시작했는지 확인하세요. (env 파일 변경 후에는 서버 재시작 필요)

### TV 화면이 실시간으로 갱신되지 않을 때
→ Supabase 대시보드 → **Database → Replication** 에서 `garden_students`, `garden_point_logs` 가 활성화되어 있는지 확인. 마이그레이션 SQL 을 다시 실행하면 자동 활성화됩니다.

### 포인트 입력이 "학생 정보 갱신 실패" 로 끝날 때
→ 거의 100% `SUPABASE_SERVICE_ROLE_KEY` 가 비어 있거나 잘못된 경우입니다. RLS 가 anon 의 쓰기를 막고 있어요.

---

## 🗺 로드맵

**Phase 1 (현재)**
- [x] 사과나무 8단계 SVG 컴포넌트
- [x] TV 화면 + Realtime
- [x] 모바일 admin (빠른 입력 + 사유)
- [x] 학생 관리 CRUD

**Phase 2 (예정)**
- [ ] 🐛 벌레 시스템 (미적립 일수 추적)
- [ ] 🛒 마켓데이 (수확 사과로 상품 교환)
- [ ] 👨‍👩‍👧 학부모 뷰
- [ ] 📊 통계 페이지
- [ ] 🎉 단계 상승 효과음
- [ ] 📱 알림톡 연동
