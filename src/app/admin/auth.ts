// Admin 접근 권한 체크 (단순 비밀번호 비교)
// 기획서 §4-1 "단순 비밀번호 보호" - URL ?key=XXXX 또는 쿠키
//
// 보안 한계:
//  - 이건 진정한 인증이 아니라 "URL 을 모르는 사람이 못 들어오게"하는 정도입니다.
//  - 양희쌤만 URL 을 알면 충분한 단계 (Phase 2 에서 더 강화 가능).

import { cookies } from "next/headers";

const COOKIE_NAME = "garden_admin_key";

export function getExpectedAdminKey(): string {
  // 서버 전용 ADMIN_KEY 우선, 없으면 NEXT_PUBLIC_ADMIN_KEY 폴백
  return (
    process.env.ADMIN_KEY ?? process.env.NEXT_PUBLIC_ADMIN_KEY ?? "garden2026"
  );
}

export function isAdminKey(input: string | null | undefined): boolean {
  if (!input) return false;
  return input === getExpectedAdminKey();
}

/** 서버 컴포넌트에서 호출: 쿠키 또는 URL 쿼리(?key=)로 인증되어 있는가? */
export function isAdminAuthenticated(searchKey?: string | null): boolean {
  if (isAdminKey(searchKey)) return true;
  const c = cookies().get(COOKIE_NAME)?.value;
  return isAdminKey(c);
}

/** 로그인 처리: 쿠키 발급 (Server Action 에서 호출) */
export function setAdminCookie(value: string) {
  cookies().set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
}

export function clearAdminCookie() {
  cookies().delete(COOKIE_NAME);
}
