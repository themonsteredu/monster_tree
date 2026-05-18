"use client";

// 학생 마이룸을 readonly 로 렌더하는 공용 컴포넌트.
// /me 에선 인터랙티브 (MeTreeClient), TV 스포트라이트엔 이 컴포넌트만 사용 → 보기만.
//
// 포함:
//  - 배경 (관리자 글로벌 배경 또는 학생 BackgroundConfig)
//  - 마당 소품 (decorations + yard layout)
//  - 날씨 효과 (WeatherEffect)
//  - 사과나무 (정해진 stage)
//  - 아바타
//  - 활성 몬스터 + 진화 완료 몬스터들
//  - 모든 SceneActor 에 idle 애니메이션 (sway, bob)
//
// 제외:
//  - 꾸미기 모드 (편집 X)
//  - EXP 정보 말풍선 (탭 X)
//  - 글로우 링 / 분무기 / pt float (이벤트 X)

import { useEffect, useRef, useState } from "react";
import { AppleTree, type AppleTreeMood } from "@/components/AppleTree";
import { AvatarFigurePreloaded } from "@/features/garden/avatar/AvatarFigurePreloaded";
import { BackgroundCanvas } from "@/features/garden/background/BackgroundCanvas";
import { WeatherEffect } from "@/features/garden/weather/WeatherEffect";
import { YardLayer } from "@/features/garden/decorations/YardLayer";
import {
  DEFAULT_AVATAR,
  DEFAULT_BACKGROUND,
  DEFAULT_SCENE_LAYOUT,
} from "@/lib/types";
import type {
  AvatarConfig,
  BackgroundConfig,
  DecorationItem,
  GardenTreeStage,
  MonsterSpecies,
  MonsterStageImage,
  SceneItemLayout,
  SceneLayout,
  StudentMonster,
  StudentYardItem,
  WeatherType,
} from "@/lib/types";
import type { AvatarGalleryItemPosition } from "@/lib/types";
import type { TreeStageImageConfig } from "@/lib/types";

const TREE_NATURAL_PX = 340;
const AVATAR_NATURAL_PX = 220;
const MONSTER_NATURAL_PX = 220;

const MONSTER_DEFAULT_LAYOUT: SceneItemLayout = {
  x: 28,
  y: 88,
  width: 22,
};

function pickStageImage(
  stages: MonsterStageImage[],
  currentStage: number,
): { url: string; isFallback: boolean } {
  const cur = stages.find((s) => s.stage === currentStage);
  if (cur?.image_url) return { url: cur.image_url, isFallback: false };
  for (let s = currentStage - 1; s >= 1; s--) {
    const prev = stages.find((x) => x.stage === s);
    if (prev?.image_url) return { url: prev.image_url, isFallback: true };
  }
  return { url: "", isFallback: true };
}

function evolvedLayout(index: number): SceneItemLayout {
  const colsPerRow = 5;
  const col = index % colsPerRow;
  const rowIdx = Math.floor(index / colsPerRow);
  return { x: 14 + col * 18, y: 68 + rowIdx * 12, width: 14 };
}

export type YardSceneProps = {
  // 배경
  yardBackgroundImage: string | null;
  studentBackground: BackgroundConfig | null;
  // 트리
  treeStage: number;
  treeMood: AppleTreeMood;
  treeWilted?: boolean;
  treeGrowthBoost?: number;
  treeImageConfig?: TreeStageImageConfig | null;
  // 아바타
  avatar: AvatarConfig | null;
  galleryPositions: Record<string, AvatarGalleryItemPosition>;
  // 씬 레이아웃
  sceneLayout: SceneLayout | null;
  // 마당 소품
  decorationItems: DecorationItem[];
  yardLayout: StudentYardItem[];
  // 날씨
  weather: WeatherType;
  // 몬스터
  activeMonster: StudentMonster | null;
  activeMonsterSpecies: MonsterSpecies | null;
  activeMonsterStages: MonsterStageImage[];
  evolvedMonsters: StudentMonster[];
  monsterSpeciesById: Record<string, MonsterSpecies>;
  monsterStagesBySpecies: Record<string, MonsterStageImage[]>;
};

export function YardScene(props: YardSceneProps) {
  const yardRef = useRef<HTMLDivElement | null>(null);
  const [yardPx, setYardPx] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = yardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setYardPx({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cqminPx = Math.min(yardPx.w || 1, yardPx.h || 1) / 100;

  const effectiveScene = {
    tree: props.sceneLayout?.tree ?? DEFAULT_SCENE_LAYOUT.tree,
    avatar: props.sceneLayout?.avatar ?? DEFAULT_SCENE_LAYOUT.avatar,
    monster: props.sceneLayout?.monster ?? DEFAULT_SCENE_LAYOUT.monster,
  };

  return (
    <div
      ref={yardRef}
      className="aspect-square landscape:aspect-[16/9]"
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        background: "#e8d8b8",
        containerType: "size",
        width: "100%",
      } as React.CSSProperties}
    >
      {/* 배경 — 관리자 글로벌이 있으면 우선, 없으면 학생 background */}
      {props.yardBackgroundImage ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${props.yardBackgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <BackgroundCanvas
          config={props.studentBackground ?? DEFAULT_BACKGROUND}
          rounded={20}
        />
      )}

      {/* 마당 소품 (배경 위, 트리 아래) */}
      <YardLayer items={props.decorationItems} layout={props.yardLayout} />

      {/* 날씨 효과 */}
      <WeatherEffect weather={props.weather} />

      {/* 트리 */}
      <ReadonlySceneActor
        layout={effectiveScene.tree}
        naturalPx={TREE_NATURAL_PX}
        cqminPx={cqminPx}
        zIndex={2}
        animation="sway"
      >
        <AppleTree
          stage={props.treeStage}
          size="xl"
          mood={props.treeMood}
          wilted={props.treeWilted ?? false}
          growthBoost={props.treeGrowthBoost ?? 0}
          imageConfig={props.treeImageConfig ?? null}
        />
      </ReadonlySceneActor>

      {/* 아바타 */}
      {props.avatar && (
        <ReadonlySceneActor
          layout={effectiveScene.avatar}
          naturalPx={AVATAR_NATURAL_PX}
          cqminPx={cqminPx}
          zIndex={3}
          animation="bob"
        >
          <AvatarFigurePreloaded
            config={props.avatar ?? DEFAULT_AVATAR}
            size={AVATAR_NATURAL_PX}
            galleryPositions={props.galleryPositions}
          />
        </ReadonlySceneActor>
      )}

      {/* 진화 완료 몬스터들 (작게 자동 배치) */}
      {props.evolvedMonsters.map((em, idx) => {
        const sp = props.monsterSpeciesById[em.species_id];
        const stages = props.monsterStagesBySpecies[em.species_id] ?? [];
        if (!sp) return null;
        const pick = pickStageImage(stages, em.current_stage);
        if (!pick.url) return null;
        return (
          <ReadonlySceneActor
            key={em.id}
            layout={evolvedLayout(idx)}
            naturalPx={MONSTER_NATURAL_PX}
            cqminPx={cqminPx}
            zIndex={2}
            animation="bob"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pick.url}
              alt={em.nickname}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
              }}
            />
          </ReadonlySceneActor>
        );
      })}

      {/* 활성 몬스터 */}
      {props.activeMonster && props.activeMonsterSpecies && (() => {
        const pick = pickStageImage(props.activeMonsterStages, props.activeMonster.current_stage);
        if (!pick.url) return null;
        return (
          <ReadonlySceneActor
            layout={effectiveScene.monster ?? MONSTER_DEFAULT_LAYOUT}
            naturalPx={MONSTER_NATURAL_PX}
            cqminPx={cqminPx}
            zIndex={4}
            animation="bob"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pick.url}
              alt={props.activeMonster.nickname}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
              }}
            />
          </ReadonlySceneActor>
        );
      })()}
    </div>
  );
}

function ReadonlySceneActor({
  layout,
  naturalPx,
  cqminPx,
  zIndex = 2,
  animation,
  children,
}: {
  layout: SceneItemLayout;
  naturalPx: number;
  cqminPx: number;
  zIndex?: number;
  animation?: "bob" | "sway";
  children: React.ReactNode;
}) {
  const scale = cqminPx > 0 ? (layout.width * cqminPx) / naturalPx : 1;
  const animClass =
    animation === "bob" ? "scene-idle-bob" : animation === "sway" ? "scene-tree-sway" : "";
  return (
    <div
      style={{
        position: "absolute",
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: 0,
        height: 0,
        zIndex,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -naturalPx / 2,
          top: -naturalPx / 2,
          width: naturalPx,
          height: naturalPx,
          transform: `scale(${scale * (layout.flipX ? -1 : 1)}, ${scale}) rotate(${layout.rotation ?? 0}deg)`,
          transformOrigin: "center",
        }}
      >
        {animClass ? (
          <div className={animClass} style={{ width: "100%", height: "100%" }}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
