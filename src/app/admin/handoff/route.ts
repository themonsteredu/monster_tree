// /admin/handoff?branch=br_xxx&name=...
//
// monster-site 의 "몬스터 트리" 버튼이 ?branch=br_xxx&name=계림점 핸드오프로 진입.
// 쿠키 변경은 Route Handler 에서만 허용되므로 (Next.js 14), 이 경로에서 쿠키를 굽고
// clean URL (/admin) 로 리다이렉트. — Server Component 에서 cookies().set() 하면
// "Cookies can only be modified in a Server Action or Route Handler" 500 발생.

import { NextResponse, type NextRequest } from "next/server";
import { setAdminBranchCookie } from "@/lib/branch";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const branch = request.nextUrl.searchParams.get("branch")?.trim();
  const name = request.nextUrl.searchParams.get("name")?.trim() || null;

  if (branch) {
    setAdminBranchCookie(branch, name);
  }

  // basePath ('/tree') 가 설정되어 있어도 NextResponse.redirect 는 자동 prepend 안 함 → 명시.
  return NextResponse.redirect(new URL("/tree/admin", request.url));
}
