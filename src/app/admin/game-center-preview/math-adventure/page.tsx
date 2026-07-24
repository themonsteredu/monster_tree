// /admin/game-center-preview/math-adventure — 관리자 수학 대모험 테스트 플레이.
// 학생용 컴포넌트를 adminMode로 재사용하며 DB에는 기록하지 않는다.

import { isAdminAuthenticated } from "../../auth";
import { LoginForm } from "../../LoginForm";
import { BlockWorldSoundLayer } from "@/app/me/game-center/math-adventure/BlockWorldSoundLayer";
import { MathAdventureGame } from "@/app/me/game-center/math-adventure/MathAdventureGame";
import { DAILY_PLAY_LIMIT } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMathAdventurePreviewPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  return (
    <>
      <BlockWorldSoundLayer />
      <MathAdventureGame
        adminMode
        homeHref="/admin/game-center-preview"
        remainingBefore={DAILY_PLAY_LIMIT}
        monsterNickname="테스트 몬스터"
      />
    </>
  );
}
