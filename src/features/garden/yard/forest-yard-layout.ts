import { DEFAULT_BACKGROUND, DEFAULT_SCENE_LAYOUT, type BackgroundConfig, type SceneLayout } from "@/lib/types";

// Scene coordinates are actor CENTRES, not feet. Only never-positioned actors use these defaults.
export const FOREST_SCENE_LAYOUT: Required<SceneLayout> = {
  tree: { x: 73, y: 48, width: 43, flipX: false, rotation: 0 },
  avatar: { x: 49, y: 62, width: 25, flipX: false, rotation: 0 },
  monster: { x: 78, y: 65, width: 18, flipX: false, rotation: 0 },
};

/** The legacy database populated cream automatically; every other saved choice stays intact. */
export function usesForestBackground(background?: BackgroundConfig | null): boolean {
  return !background || (background.kind === "solid" && DEFAULT_BACKGROUND.kind === "solid" && background.color === DEFAULT_BACKGROUND.color);
}

export function resolveYardScene(saved: SceneLayout | null, forest: boolean): Required<SceneLayout> {
  const defaults = forest ? FOREST_SCENE_LAYOUT : DEFAULT_SCENE_LAYOUT;
  return { tree: saved?.tree ?? defaults.tree, avatar: saved?.avatar ?? defaults.avatar, monster: saved?.monster ?? defaults.monster };
}
