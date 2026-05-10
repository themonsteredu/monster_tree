// monster-site 의 관리자 페이지 URL.
// 모든 지점이 동일한 https://www.themonster.kr/admin 을 사용하므로
// 기본값으로 박아두고, 향후 지점별 분기가 필요하면 env 변수로 override.

export function getMonsterSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MONSTER_SITE_URL ?? "https://www.themonster.kr/admin"
  );
}
