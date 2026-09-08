// Admin 접근 권한 체크 (단순 비밀번호 비교)
// 기획서 §4-1 "단순 비밀번호 보호" - URL ?key=XXXX 또는 쿠키
//
// 보안 한계:
//  - 이건 진정한 인증이 아니라 "URL 을 모르는 사람이 못 들어오게"하는 정도입니다.
//  - 양희쌤만 URL 을 알면 충분한 단계 (Phase 2 에서 더 강화 가능).

import { cookies } from "next/headers";

const COOKIE_NAME = "garden_admin_key";

export function getExpectedAdminKey(): string | null {
  // Missing server configuration must deny access, never accept a public or default password.
  const key = process.env.ADMIN_KEY;
  return key && key.trim() ? key : null;
}

export function isAdminKey(input: string | null | undefined): boolean {
  if (!input) return false;
  return input === getExpectedAdminKey();
}

/** 서버 컴포넌트에서 호출: 쿠키 또는 URL 쿼리(?key=)로 인증되어 있는가? */
export async function isAdminAuthenticated(searchKey?: string | null): Promise<boolean> {
  if (!getExpectedAdminKey()) return false;
  if (isAdminKey(searchKey)) return true;
  const c = (await cookies()).get(COOKIE_NAME)?.value;
  return isAdminKey(c);
}

/** 로그인 처리: 쿠키 발급 (Server Action 에서 호출) */
export async function setAdminCookie(value: string) {
  if (!isAdminKey(value)) throw new Error("AUTH_REQUIRED: 관리자 인증이 필요합니다.");
  (await cookies()).set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE_NAME);
}
