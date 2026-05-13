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
  experimental: {
    serverActions: {
      // 기본값 1MB 로는 ChatGPT 생성 PNG(보통 1~3MB) 가 silent fail.
      // 갤러리 업로드 파일 + 폼 메타데이터를 합쳐 통과시키도록 10MB 까지 허용.
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
