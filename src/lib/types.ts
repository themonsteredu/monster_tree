// Supabase garden_* 테이블의 행 타입 정의 (마이그레이션 SQL 과 1:1 대응)

export type AvatarHumanBody = "boy" | "girl";
export type AvatarKind = "human" | "animal" | "fantasy";

export type AvatarAccessories = { glasses?: string; hat?: string };

export type AvatarConfig =
  | {
      kind: "human";
      body: AvatarHumanBody;
      skin: string;
      hair: string;
      eyes: string;
      mouth: string;
      // costume = 상의+하의+신발 세트. "none" 이면 맨몸(피부만).
      costume: string;
      accessories?: AvatarAccessories;
    }
  | {
      kind: "animal" | "fantasy";
      variant: string;
      // 동물/판타지도 의상 입을 수 있음.
      costume?: string;
      accessories?: AvatarAccessories;
    }
  | {
      kind: "image";
      url: string;
    }
  | {
      // 관리자가 카테고리별로 업로드한 갤러리에서 학생이 1개씩 골라 합성하는 아바타.
      // 각 슬롯은 garden_avatar_gallery.image_url 값. 없으면 해당 레이어 미표시.
      kind: "gallery";
      base?: string;
      outfit?: string;
      bottom?: string;
      shoes?: string;
      hair?: string;
      face?: string;
      hat?: string;
      accessory?: string;
    };

export type AvatarGalleryCategory =
  | "base"
  | "outfit"
  | "bottom"
  | "shoes"
  | "hair"
  | "face"
  | "hat"
  | "accessory";

// 갤러리 아이템이 합성 아바타 안에서 차지하는 위치/크기 — base bbox 기준.
// x, y: 0~100 (% 위치, 중심점 기준 — translate(-50%, -50%) 와 결합).
// scaleX, scaleY: 10~200 (% 크기, 100 = inner box 전체 너비/높이).
export type AvatarGalleryItemPosition = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

// 카테고리별 기본 위치 — 관리자가 position 을 따로 지정하지 않은 항목에 적용.
export const DEFAULT_GALLERY_POSITION_BY_CATEGORY: Record<
  AvatarGalleryCategory,
  AvatarGalleryItemPosition
> = {
  base:      { x: 50, y: 50, scaleX: 100, scaleY: 100 },
  outfit:    { x: 50, y: 52, scaleX: 45,  scaleY: 45 },
  bottom:    { x: 50, y: 70, scaleX: 40,  scaleY: 40 },
  shoes:     { x: 50, y: 88, scaleX: 35,  scaleY: 35 },
  hair:      { x: 50, y: 20, scaleX: 50,  scaleY: 50 },
  face:      { x: 50, y: 33, scaleX: 35,  scaleY: 35 },
  hat:       { x: 50, y: 15, scaleX: 45,  scaleY: 45 },
  accessory: { x: 50, y: 33, scaleX: 35,  scaleY: 35 },
};

export function getGalleryItemPosition(item: {
  category: AvatarGalleryCategory;
  position?: AvatarGalleryItemPosition | null;
}): AvatarGalleryItemPosition {
  return item.position ?? DEFAULT_GALLERY_POSITION_BY_CATEGORY[item.category];
}

export type AvatarGalleryItem = {
  id: string;
  category: AvatarGalleryCategory;
  label: string | null;
  image_url: string;
  position: AvatarGalleryItemPosition | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export const DEFAULT_AVATAR: AvatarConfig = {
  kind: "human",
  body: "boy",
  skin: "light",
  hair: "short_brown",
  eyes: "happy",
  mouth: "smile",
  costume: "casual_olive",
};

// 학생 개인 페이지 + TV 스포트라이트 의 배경 꾸미기.
// solid: 단색  /  pattern: 무늬 (color 위에 패턴 오버레이)  /  scene: 풍경 프리셋
export type BackgroundConfig =
  | { kind: "solid"; color: string }
  | { kind: "pattern"; pattern: string; color: string }
  | { kind: "scene"; scene: string };

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  kind: "solid",
  color: "cream",
};

export type GardenStudent = {
  id: string;
  name: string;
  class_name: string | null;
  branch_id: string | null;
  total_points: number;
  current_stage: number; // 1~8
  apples_harvested: number;
  is_active: boolean;
  created_at: string;
  avatar?: AvatarConfig | null;
  background?: BackgroundConfig | null;
  mood_text?: string | null;
  mood_updated_at?: string | null;
};

export const MOOD_TEXT_MAX = 30;

export type GardenPointLog = {
  id: string;
  student_id: string;
  points: number; // 음수도 가능
  reason: string | null;
  logged_at: string;
};

export type GardenHarvest = {
  id: string;
  student_id: string;
  apples_count: number;
  harvested_at: string;
};

// 사과나무 단계별 이미지 + 미세조정 설정.
// image_url 이 null 이면 AppleTree 는 기존 SVG fallback 으로 렌더된다.
export type GardenTreeStage = {
  stage: number;
  image_url: string | null;
  scale: number;
  offset_x: number;
  offset_y: number;
  updated_at: string;
};

export type TreeStageImageConfig = {
  url: string;
  scale: number;
  offsetX: number;
  offsetY: number;
};
