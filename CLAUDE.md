# monster_tree — Claude 작업 규칙

## 학생 화면 = 관리자 미리보기 동반 (필수)

새 학생용(/me/\*) 페이지/기능을 추가할 때는 **반드시** admin 미리보기를 함께 만든다.
관리자가 학생 화면을 그대로 볼 수 있어야 하며, DB/EXP/랭킹/도감 등 학생 데이터에는
영향을 주지 않는 "테스트 모드"로 동작해야 한다.

### 패턴

- 라우트 위치: `/admin/<feature>-preview`
- 학생 컴포넌트에 `adminMode?: boolean` prop 추가하여 재사용
- adminMode=true 일 때:
  - 화면 상단에 `🛠 테스트 모드 — 기록 저장 안 됨` 뱃지
  - 서버 액션 호출은 건너뛰고 로컬 결과만 표시
  - 일일 한도/횟수 제한 무시 (가능하면 ∞ 또는 "무제한" 표기)
  - 학생 한정 데이터(아바타 등)는 placeholder/admin-only fallback 사용
  - ← 돌아가기 / 다음 라우트 등 링크는 admin 라우트로 분기 (예: `/admin/village-preview`)
- 진입 가드: `isAdminAuthenticated(searchParams.key)` + `LoginForm` 후방 진입 처리
- 마을 미리보기(/admin/village-preview)의 `previewLinkOverrides` 에 새 building_key 연결
  (이미 매핑된 경우 그대로 유지)

### 기존 예시

- /admin/suggest-preview ← /me/suggest
- /admin/game-center-preview ← /me/game-center
- /admin/game-center-preview/infinite-stairs ← /me/game-center/infinite-stairs
- /admin/game-center-preview/sky-shooter ← /me/game-center/sky-shooter
- /admin/collection-preview ← /me/collection (도감)

새 학생 기능 만들 때마다 이 목록도 갱신.

## 그 외

- 그라데이션 텍스트(background-clip:text)는 모바일에서 흐려지므로 피하고,
  솔리드 컬러 + text-shadow 로 글로우 표현.
- 일일 한도/EXP 같은 상수는 `src/lib/types.ts` 에 중앙화.
- 클라이언트 모듈(`"use client"`)에서 non-component 값을 export 하면 서버
  컴포넌트가 import 시 런타임 에러. 카탈로그/타입은 별도 server-safe 모듈로 분리.
- 게임/멀티게임 카탈로그는 `src/app/me/game-center/games.ts`.
