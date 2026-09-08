# 나무 보안 업데이트 및 배포 인계 — 2026-09-08

## 현재 상태

로컬 구현·검증 완료. 이 문서를 작성한 작업자는 커밋, 푸시, 운영 배포, 운영 DB 변경을 하지 않았다. 최종 Git 검토 및 배포는 별도 담당자가 진행한다. 기존 학생·나무·포인트 데이터는 변경하지 않았다.

최종 검토자가 보안 업데이트 후 로컬 운영 서버의 관리자 디자인 미리보기를 360×800 화면으로 추가 확인했다. 토끼 프리셋 선택, 상의만 후디로 교체, 라일락 색상 변경, 미리보기 적용이 정상 동작했다. 가로 넘침, SVG 렌더링, 로드 실패한 표시 이미지, 브라우저 오류는 없었다. 이 검사는 저장 없는 가상 학생 화면이며 실제 학생 기록이나 실물 휴대폰을 사용한 검증은 아니다.

실제 광장·집 저장은 monster-site가 담당한다. 나무의 `/tree/me/plaza`는 사이트 `/plaza`로 이동하며 옛 `/tree/api/social` 및 `/presence`는 DB 접근 없이 410을 반환한다. 삭제한 구 나무 광장 SQL을 다시 적용하면 안 된다. 자세한 구조는 [광장 배포 메모](./block-world-release.md)의 맨 앞을 따른다.

## 업데이트 범위

- 공식 2026년 8월 보안 공지는 유지보수 LTS의 수정 버전을 15.5.24로 안내한다. 확인 시점의 최신 15.x인 Next.js 15.5.25 및 eslint-config-next 15.5.25를 적용했다. [공식 보안 공지](https://nextjs.org/blog/august-2026-security-release)
- React·React DOM 19.2.8, React 타입 19.2.18, React DOM 타입 19.2.7로 정렬했다. 기존 framer-motion 11.18.2는 React 19 peer 범위를 지원한다.
- 공식 `next-async-request-api` codemod를 먼저 실행하고, 자동 변환되지 않은 관리자·지점 쿠키 래퍼와 호출자를 수동 정리했다. `cookies()`, 페이지 `searchParams`, 관리자 인증·지점 선택 helper의 Promise는 모두 await 또는 return으로 소비한다. `UnsafeUnwrapped` 및 codemod 미해결 표식은 남기지 않았다. [15 버전 가이드](https://nextjs.org/docs/app/guides/upgrading/version-15), [공식 codemod](https://nextjs.org/docs/app/guides/upgrading/codemods)
- React 19의 JSX 타입 변경에 맞춰 기존 아바타·배경 컴포넌트에 타입 import만 추가했다. 기존 학생 데이터 처리와 화면 기능을 보존했다.
- 관리자 키는 서버 전용 `ADMIN_KEY`만 사용한다. 미설정·빈 값·공백은 인증 실패로 처리하며 공개 환경변수와 기본 비밀번호로 대체하지 않는다. 기존 query key 로그인은 유지한다. 관리자·지점 쿠키는 운영에서 Secure이며 HttpOnly·SameSite=Lax를 유지한다.
- 학생 JWT는 HS256만 허용한다. 기존 갤러리 아바타 주소는 HTTPS, 정확한 설정 origin, 공개 Storage 경로만 허용한다. 유사 도메인·사용자정보가 붙은 URL·HTTP·비공개 경로는 거절한다.
- 기존 npm 및 pnpm 잠금 파일을 모두 동기화했다. 호환 범위의 의존성을 정리해 ws 8.21.3, sharp 0.35.4를 사용하며 PostCSS는 8.5.28로 통일했다. npm override 및 pnpm workspace override를 함께 기록했다. 강제 주요 버전 일괄 수정은 사용하지 않았다.
- `.env.example`의 공개 관리자 키·기본 비밀번호 예시를 제거했다. 실제 환경 파일이나 운영 키는 생성·기록하지 않았다.

## 로컬 검증 결과

모든 검사는 실제 학생 계정·운영 DB 없이 수행했다.

| 검사 | 결과 |
| --- | --- |
| Next.js 운영 빌드 및 TypeScript 검사 | 통과 |
| 전체 의존성·운영 의존성 npm 보안 검사 | 취약점 0건 |
| 이전 광장 경로 종료 회귀 | 21개 통과 |
| 아바타 저장 권한·URL 검사 | 5개 통과 |
| 학생 JWT 검증 | 8개 통과 |
| 아바타 정적 렌더링 | 63개 통과, 최대 43 DOM 노드 |
| 접속 정보 요청·공간 전환·취소 검사 | 13개 통과 |
| JSON 요청·시간 제한·취소 검사 | 9개 통과 |
| 이동 범위·잘못된 좌표 검사 | 120쌍 통과 |
| 두 저장소의 비동기 요청·인증 호출 독립 감사 | 181개 await/return 확인 |
| 나무 관리자 action 독립 권한 감사 | 56개 action 각각 무쿠키·잘못된 쿠키에서 외부 작업 0회 |
| 실제 로컬 운영 서버 HTTP 검사 | 18개 통과 |
| Git 공백 오류 검사 | 통과 |

관리자 독립 감사는 `ADMIN_KEY` 미설정·빈 값·공백, 공개 변수·기본 키 거절, 올바른 query key 및 비동기 쿠키 허용, 잘못된 관리자 쿠키 설정 거절, 운영 쿠키 속성도 확인했다. 감사 도구는 monster-site의 `scripts/test-plaza-tree-admin.mjs`, `scripts/test-plaza-async-audit.mjs`이며 나무 저장소 경로를 명시해 읽기 전용으로 실행했다.

운영 빌드는 localhost를 가리키는 명백한 임시 Supabase 값과 임시 인증값만 해당 실행 프로세스에 설정했다. 환경 파일을 쓰거나 라이브 DB에 접속하지 않았다. localhost:3102의 운영 서버에서 이전 API의 7개 메서드, no-store, HEAD 빈 본문, 사이트로의 307 이동, 비로그인 관리자 차단, 관리자 디자인 미리보기를 확인했다. 640px 아바타 머리 시트의 WebP 최적화 응답은 24,666바이트였다.

빌드에 남은 경고는 기존 이미지 태그와 기존 전역 글꼴 링크에 관한 항목이다. 빌드·타입 오류는 없다. 아바타 DOM 수에는 React 19가 출력하는 이미지 preload 링크 3개가 포함되며 기존 50개 제한 이내다.

## 배포 시 확인

- 운영에 서버 전용 `ADMIN_KEY`가 설정되어 있어야 한다. 설정이 없으면 관리자 접근은 의도적으로 차단된다. 실제 키를 코드·문서·클라이언트에 넣지 않는다.
- 기존 Supabase 및 JWT 운영 설정은 배포 담당자가 현재 프로젝트에 그대로 연결되어 있는지 확인한다. 이 업데이트는 DB 마이그레이션을 요구하지 않는다.
- 배포 후 비로그인 관리자 차단, 정상 관리자 로그인, 기존 학생 로그인 및 아바타 저장, 나무 화면, 사이트 광장 이동을 확인한다. 실제 학생 저장 검증은 명시된 테스트 계정으로만 한다.
- 로컬 자동 검사와 화면 크기 조절 검증은 실물 휴대폰 성능 검사가 아니다. 학생들이 쓰는 저사양 Android·iPhone에서 화면 전환, 옷장, 24명 표시, 연결 끊김·백그라운드 복귀를 별도 확인한다. 실제 광장 접속·집 저장 검증은 monster-site에서 수행한다.
- 현재 로컬 관리자 미리보기는 저장하지 않는 테스트 모드다. 실제 학생 저장 또는 운영 광장의 동시 접속 검증으로 해석하지 않는다.

## 변경 파일 묶음

- 패키지·환경 안내: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.env.example`.
- 비동기 요청 API: `src/app/admin`의 인증·페이지·action·헤더, `src/lib/branch.ts`, 학생·상점·퀴즈·첫 화면·TV의 쿠키 및 searchParams 호출자.
- 인증 보강: `src/app/admin/auth.ts`, `src/lib/student-jwt.ts`, `src/app/me/actions.ts`의 기존 아바타 URL 검증.
- 이전 광장 종료: `src/lib/social/retired.ts`, `src/app/api/social` 두 경로, `src/app/me/plaza/page.tsx`, 마을의 광장 링크 표시.
- 회귀 및 지침: `scripts/test-social-retired.mjs`, `scripts/test-avatar-actions.mjs`, `scripts/test-student-jwt.mjs`, `CLAUDE.md`, `docs`.
- 기존 아바타 개편·래스터 이미지·관리자 미리보기 등 동시 작업자의 변경은 보존했다. 보안 작업만으로 해당 변경을 되돌리거나 재작성하지 않았다.
