"use client";

// 마이룸 마당에 학생이 배치한 소품을 그대로 보여주는 정적 레이어.
// /me 의 사과나무 scene 안에 absolute 로 깔린다. (편집 모드일 때는 DecorateMode 가 대체)

import { DecorationArt } from "./DecorationArt";
import { yardCatalogue, yardPlacements } from "@/lib/yard-decoration";
import type { SceneLayout, DecorationItem, StudentYardItem } from "@/lib/types";

export function YardLayer({
  items,
  layout: legacyLayout,
  sceneLayout,
}: {
  items: DecorationItem[];
  layout: StudentYardItem[];
  sceneLayout?: SceneLayout | null;
}) {
  const layout = yardPlacements(legacyLayout, sceneLayout);
  if (layout.length === 0) return null;

  const itemById = new Map(yardCatalogue(items).map((i) => [i.id, i]));

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        // 배경(1) 위, 나무·아바타(2~3) 보다는 아래로.
        zIndex: 1,
      }}
    >
      {layout.map((li) => {
        const item = itemById.get(li.decoration_item_id);
        if (!item) return null;
        return (
          <div
            key={li.instance_id}
            style={{
              position: "absolute",
              left: `${li.position_x}%`,
              top: `${li.position_y}%`,
              // width 는 짧은 변(cqmin) 기준 — 세로/가로 모드 모두에서 물리적으로 같은 크기.
              width: `${li.width_percent}cqmin`,
              transform: `translate(-50%, -50%) rotate(${li.rotation}deg)`,
              zIndex: li.z_index,
            }}
          >
            <div style={{ transform: `scaleX(${li.flipX ? -1 : 1})` }}><DecorationArt item={item} className="w-full h-auto object-contain" /></div>
          </div>
        );
      })}
    </div>
  );
}
