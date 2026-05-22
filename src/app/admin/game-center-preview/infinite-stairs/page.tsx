// /admin/game-center-preview/infinite-stairs — 관리자 테스트 플레이용.
// 학생용 InfiniteStairsGame 컴포넌트를 adminMode 로 재사용.
// 서버 액션 호출 / DB 쓰기 일체 없음 — 자유 체험만.

import { isAdminAuthenticated } from "../../auth";
import { LoginForm } from "../../LoginForm";
import { InfiniteStairsGame } from "@/app/me/game-center/infinite-stairs/InfiniteStairsGame";
import { DAILY_PLAY_LIMIT } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminInfiniteStairsPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  // 관리자에겐 아바타가 없음 → null 로 넘기면 게임이 🏃 fallback 으로 렌더.
  return (
    <InfiniteStairsGame
      adminMode
      homeHref="/admin/game-center-preview"
      remainingBefore={DAILY_PLAY_LIMIT}
      avatarConfig={null}
      monsterNickname="테스트"
    />
  );
}
