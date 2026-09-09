import { DECOR_CATALOG, isBuiltinDecor } from "./decor-catalog";
import type { DecorationItem, SceneLayout, StudentYardItem } from "./types";

export const BUILTIN_YARD_ITEMS: DecorationItem[] = DECOR_CATALOG.map(item => ({
  id: `builtin:${item.id}`, name: item.label, image_url: "", price: 0,
  category: ["tulip_planter", "sunflower_planter"].includes(item.id) ? "flower" : item.category === "정원" ? "plant" : item.category === "캠핑" ? "misc" : "furniture",
  default_width_percent: item.width, is_active: true, created_at: "", updated_at: "",
}));
export type YardPlacement = Pick<StudentYardItem, "decoration_item_id" | "instance_id" | "position_x" | "position_y" | "width_percent" | "rotation" | "z_index" | "flipX">;
export function yardPlacements(legacy: StudentYardItem[], scene?: SceneLayout | null): StudentYardItem[] {
  return scene?.yard ? scene.yard.map(item => ({ id: item.instance_id, student_id: "", placed_at: "", ...item })) : legacy;
}
export function yardCatalogue(items: DecorationItem[]): DecorationItem[] {
  return [...BUILTIN_YARD_ITEMS, ...items.filter(item => !isBuiltinDecor(item.id))];
}
