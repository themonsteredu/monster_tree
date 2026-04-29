// 학생 영역(/tree/me/**)에서만 monster_student JWT 쿠키를 검증한다.
// /tree (=basePath root, 로비 TV 보드) 와 /tree/admin/** (기존 admin 쿠키 인증) 은 화이트리스트.
// 미인증이면 https://www.themonster.kr/login 으로 리다이렉트.

import { NextRequest, NextResponse } from 'next/server';
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from '@/lib/student-jwt';

export const config = {
  // basePath 가 /tree 이므로 Next.js 가 자동으로 prefix 를 적용한다.
  // matcher 에는 basePath 를 도 추가하지 않는다 (는 공식 문서 권고안).
  matcher: ['/me/:path*'],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (payload) return NextResponse.next();

  const loginUrl = new URL('https://www.themonster.kr/login');
  return NextResponse.redirect(loginUrl);
}
