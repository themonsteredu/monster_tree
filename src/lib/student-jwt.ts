// monster-site 와 동일한 JWT 스키마의 verify 전용 헬퍼.
// edge runtime (middleware) 에서도 안전하게 작동하는 jose 사용.

import { jwtVerify } from 'jose';

export type StudentJwtPayload = {
  branchId: string;
  studentLocalId: number;
  loginId: string;
  name: string;
};

export const STUDENT_COOKIE_NAME = 'monster_student';

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다');
  return new TextEncoder().encode(s);
}

export async function verifyStudentJwt(token: string | undefined | null): Promise<StudentJwtPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.branchId !== 'string' ||
      typeof payload.studentLocalId !== 'number' ||
      typeof payload.loginId !== 'string' ||
      typeof payload.name !== 'string'
    ) {
      return null;
    }
    return {
      branchId: payload.branchId,
      studentLocalId: payload.studentLocalId,
      loginId: payload.loginId,
      name: payload.name,
    };
  } catch {
    return null;
  }
}
