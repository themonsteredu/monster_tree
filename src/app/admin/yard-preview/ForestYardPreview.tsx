"use client";

import Link from "next/link";
import { useState } from "react";
import { AppleTree } from "@/components/AppleTree";
import { PaperDoll } from "@/features/avatar-v2/PaperDoll";
import { Wardrobe } from "@/features/avatar-v2/Wardrobe";
import { DEFAULT_LOOK } from "@/lib/avatar-v2";
import type { TreeStageImageConfig } from "@/lib/types";
import { calculateStage, getStageInfo, pointsToNextStage, stageProgress } from "@/lib/garden";
import { ForestYard, ForestYardScene, ForestYardProgress } from "@/features/garden/yard/ForestYard";
import YardSign from "@/features/garden/yard/YardSign";
import { YardPlazaEntry } from "@/features/social/YardPlazaEntry";
import styles from "@/features/garden/yard/ForestYard.module.css";

// The existing public stage-5 artwork, observed on the live yard. No student/database read.
const PREVIEW_TREE_IMAGE: TreeStageImageConfig = {
  url: "https://tjonmlclhhinjwgllthx.supabase.co/storage/v1/object/public/tree-stages/stage-5.png?t=1778848256749",
  scale: 1, offsetX: 0, offsetY: 0,
};

/** No student data, realtime subscriptions, shop loading or server actions in this preview. */
export function ForestYardPreview() {
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [avatarX, setAvatarX] = useState(49);
  const points = 150;
  const stage = calculateStage(points);
  return <main className={styles.page}>
    <div className={styles.previewBanner}><strong>🛠 테스트 모드 — 기록 저장 안 됨</strong><Link href="/admin/garden">← 관리로 돌아가기</Link></div>
    <ForestYard studentName="미리보기" points={points} apples={0} grade="예시 데이터" sign={<YardSign adminMode />}>
      <ForestYardScene>
        <div className={styles.previewTree}><AppleTree stage={stage} size="xl" growthBoost={stageProgress(points)} imageConfig={PREVIEW_TREE_IMAGE} /></div>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${avatarX - 49}%)`, pointerEvents: "none", zIndex: 3 }}>
          <PaperDoll look={look} size={220} className={styles.previewAvatar} />
        </div>
        <p className={styles.moodNote}>오늘도 내 속도로, 한 뼘 더 자라요.</p>
      </ForestYardScene>
      <ForestYardProgress stage={stage} name={getStageInfo(stage).name} progress={stageProgress(points)} remaining={pointsToNextStage(points)} harvest={stage === 8} />
      <div className={styles.plaza}><YardPlazaEntry previewMode /></div>
      <div className={styles.primaryActions}>
        <button type="button" onClick={() => setWardrobeOpen(true)}><span className={styles.primaryIcon} aria-hidden="true">👕</span>아바타 꾸미기</button>
        <button type="button" onClick={() => setArrangeOpen((open) => !open)} aria-expanded={arrangeOpen}><span className={styles.primaryIcon} aria-hidden="true">🪴</span>마당 꾸미기</button>
      </div>
      {arrangeOpen && <div className={styles.previewNote}>
        <p>미리보기에서 캐릭터 위치를 바꿔 볼 수 있어요. 실제 배치는 저장하지 않아요.</p>
        <button type="button" onClick={() => setAvatarX((x) => Math.max(38, x - 3))}>← 왼쪽</button>
        <button type="button" onClick={() => setAvatarX((x) => Math.min(65, x + 3))}>오른쪽 →</button>
        <button type="button" onClick={() => setAvatarX(49)}>원래 위치</button>
      </div>}
      <div className={styles.secondaryActions}><Link href="/admin/village-preview">몬스터 마을 보기</Link><Link href="/admin/collection-preview">몬스터도감 보기</Link></div>
      <div id="plaza-preview" className={styles.previewNote}>광장과 친구 집도 학생 기록 없이 확인할 수 있어요.<br /><Link href="/admin/plaza-preview" className="inline-flex min-h-11 items-center font-bold underline">광장 미리보기 열기 →</Link></div>
    </ForestYard>
    <Wardrobe open={wardrobeOpen} initial={look} onClose={() => setWardrobeOpen(false)} onSave={(next) => setLook(next)} adminMode />
  </main>;
}
