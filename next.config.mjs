// 빌드 타임 환경변수 검증.
// production 빌드에서 필수 키가 비어 있으면 즉시 실패시켜, 런타임에서야
// 학생 인증 / 어드민 쓰기 작업이 깨지는 사고를 막는다.
const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_KEY',
  'JWT_SECRET',
];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `\n[monster_tree] 다음 환경변수가 설정되지 않아 빌드를 중단합니다: ${missing.join(', ')}\n` +
        `Vercel Project Settings → Environment Variables 에서 추가 후 재배포하세요.\n` +
        `(JWT_SECRET 은 monster-site / monster-class 와 동일한 값이어야 합니다.)\n`,
    );
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/tree',
  assetPrefix: '/tree',
  reactStrictMode: true,
};

export default nextConfig;
