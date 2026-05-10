// monster-site 의 지점별 관리자 페이지 URL.
// 수많은 사과정원 deployment 각각이 자신의 지점 URL 을 env 로 설정.
// 미설정 시 해당 메인 도메인 루트로 폴백.
//
// 설정 예 (Vercel 계림점):
//   NEXT_PUBLIC_MONSTER_SITE_URL=https://www.themonster.kr/admin/monster_gyerim
// 설정 예 (봉선점):
//   NEXT_PUBLIC_MONSTER_SITE_URL=https://www.themonster.kr/admin/monster_bong

export function getMonsterSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MONSTER_SITE_URL ?? "https://www.themonster.kr"
  );
}
