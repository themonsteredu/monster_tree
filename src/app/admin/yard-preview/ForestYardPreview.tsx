"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppleTree } from "@/components/AppleTree";
import { PaperDoll } from "@/features/avatar-v2/PaperDoll";
import { Wardrobe } from "@/features/avatar-v2/Wardrobe";
import { DEFAULT_LOOK } from "@/lib/avatar-v2";
import { DecorateMode } from "@/features/garden/decorations/DecorateMode";
import { YardLayer } from "@/features/garden/decorations/YardLayer";
import { FOREST_SCENE_LAYOUT, resolveYardScene } from "@/features/garden/yard/forest-yard-layout";
import type { SceneLayout, SceneItemLayout, StudentYardItem, TreeStageImageConfig } from "@/lib/types";
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
  const [scene, setScene] = useState<SceneLayout>(FOREST_SCENE_LAYOUT);
  const [layout, setLayout] = useState<StudentYardItem[]>([]);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [cqmin, setCqmin] = useState(1);
  useEffect(() => {
    if (!sceneRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCqmin(Math.min(entry.contentRect.width, entry.contentRect.height) / 100));
    observer.observe(sceneRef.current);
    return () => observer.disconnect();
  }, []);
  const resolved = resolveYardScene(scene, true);
  const points = 150;
  const stage = calculateStage(points);
  return <main className={styles.page}>
    <div className={styles.previewBanner}><strong>🛠 테스트 모드 — 기록 저장 안 됨</strong><Link href="/admin/garden">← 관리로 돌아가기</Link></div>
    <ForestYard studentName="미리보기" points={points} apples={0} grade="예시 데이터" sign={<YardSign adminMode />}>
      <ForestYardScene stageRef={sceneRef}>
        {arrangeOpen ? <DecorateMode adminMode items={[]} initialLayout={layout} initialSceneLayout={{ ...scene, ...resolved }}
          treeNode={<AppleTree stage={stage} size="xl" growthBoost={stageProgress(points)} imageConfig={PREVIEW_TREE_IMAGE} />}
          avatarNode={<PaperDoll look={look} size={220} />} monsterNode={null}
          treeNaturalPx={320} avatarNaturalPx={220} monsterNaturalPx={160} cqminPx={cqmin}
          onCancel={() => setArrangeOpen(false)} onSave={async ({ layout: next, sceneLayout }) => {
            setLayout(next); setScene(sceneLayout); setArrangeOpen(false); return { ok: true };
          }} /> : <>
          <YardLayer items={[]} layout={layout} sceneLayout={scene} />
          <PreviewActor layout={resolved.tree} naturalPx={320} cqmin={cqmin}><AppleTree stage={stage} size="xl" growthBoost={stageProgress(points)} imageConfig={PREVIEW_TREE_IMAGE} /></PreviewActor>
          <PreviewActor layout={resolved.avatar} naturalPx={220} cqmin={cqmin}><PaperDoll look={look} size={220} /></PreviewActor>
          <p className={styles.moodNote}>오늘도 내 속도로, 한 뼘 더 자라요.</p>
        </>}
      </ForestYardScene>
      <ForestYardProgress stage={stage} name={getStageInfo(stage).name} progress={stageProgress(points)} remaining={pointsToNextStage(points)} harvest={stage === 8} />
      <div className={styles.plaza}><YardPlazaEntry previewMode /></div>
      <div className={styles.primaryActions}>
        <button type="button" onClick={() => setWardrobeOpen(true)}><span className={styles.primaryIcon} aria-hidden="true">👕</span>아바타 꾸미기</button>
        <button type="button" onClick={() => setArrangeOpen((open) => !open)} aria-expanded={arrangeOpen}><span className={styles.primaryIcon} aria-hidden="true">🪴</span>마당 꾸미기</button>
      </div>
      <div className={styles.secondaryActions}><Link href="/admin/village-preview">몬스터 마을 보기</Link><Link href="/admin/collection-preview">몬스터도감 보기</Link></div>
      <div id="plaza-preview" className={styles.previewNote}>광장과 친구 집도 학생 기록 없이 확인할 수 있어요.<br /><Link href="/admin/plaza-preview" className="inline-flex min-h-11 items-center font-bold underline">광장 미리보기 열기 →</Link></div>
    </ForestYard>
    <Wardrobe open={wardrobeOpen} initial={look} onClose={() => setWardrobeOpen(false)} onSave={(next) => setLook(next)} adminMode />
  </main>;
}

function PreviewActor({ layout, naturalPx, cqmin, children }: { layout: SceneItemLayout; naturalPx: number; cqmin: number; children: ReactNode }) {
  const scale = layout.width * cqmin / naturalPx;
  return <div style={{ position: "absolute", left: `${layout.x}%`, top: `${layout.y}%`, zIndex: 3, pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: -naturalPx/2, top: -naturalPx/2, width: naturalPx, height: naturalPx, transform: `scale(${scale * (layout.flipX ? -1 : 1)}, ${scale}) rotate(${layout.rotation ?? 0}deg)` }}>{children}</div>
  </div>;
}
