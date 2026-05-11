// 사과정원 sap 의 지점 ID 해석.
//
// 두 가지 경로:
//   1) TV 화면 (`/`)  — process.env.BRANCH_ID  (deployment 별 고정)
//   2) admin 페이지   — 쿠키 (관리자가 로그인 후 /admin/select-branch 에서 선택)
//
// branch_id 의 실제 형식은 monster-site 가 발급하는 "br_<timestamp>"
// (예: br_1771825369381). 과거 코멘트에 있던 "monster_gyerim" 등은 무효한 예시.

import { cookies } from "next/headers";

const ADMIN_BRANCH_COOKIE = "garden_admin_branch";

/** TV 등 비-admin 화면 용 지점 ID. env 만 본다. */
export function getBranchId(): string | null {
  const b = process.env.BRANCH_ID;
  if (!b || !b.trim()) return null;
  return b.trim();
}

/** Admin 화면 용 지점 ID. 쿠키에서 읽어온다 — 미선택이면 null. */
export function getAdminBranchId(): string | null {
  const v = cookies().get(ADMIN_BRANCH_COOKIE)?.value;
  if (!v || !v.trim()) return null;
  return v.trim();
}

export function setAdminBranchCookie(branchId: string) {
  cookies().set(ADMIN_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
}

export function clearAdminBranchCookie() {
  cookies().delete(ADMIN_BRANCH_COOKIE);
}
