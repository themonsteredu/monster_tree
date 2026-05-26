// /admin/game-center-preview/sky-shooter — 관리자 스카이슈터 테스트 플레이.
// adminMode=true 로 SkyShooterGame 재사용. DB 쓰기 없음.

import { isAdminAuthenticated } from "../../auth";
import { LoginForm } from "../../LoginForm";
import { SkyShooterGame } from "@/app/me/game-center/sky-shooter/SkyShooterGame";
import { DAILY_PLAY_LIMIT } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSkyShooterPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  return (
    <SkyShooterGame
      adminMode
      homeHref="/admin/game-center-preview"
      remainingBefore={DAILY_PLAY_LIMIT}
      avatarConfig={null}
      monsterNickname="테스트"
    />
  );
}
